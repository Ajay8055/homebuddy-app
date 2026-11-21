-- Restore the production RLS hardening and least-privilege RPC wrappers.
create index if not exists household_members_user_id_idx on public.household_members(user_id);

drop policy if exists "Members can view their households" on public.households;
create policy "Members can view their households"
on public.households for select to authenticated
using (exists (select 1 from public.household_members m where m.household_id=households.id and m.user_id=(select auth.uid())));
drop policy if exists "Owners can update their households" on public.households;
create policy "Owners can update their households"
on public.households for update to authenticated
using (exists (select 1 from public.household_members m where m.household_id=households.id and m.user_id=(select auth.uid()) and m.role='owner'))
with check (exists (select 1 from public.household_members m where m.household_id=households.id and m.user_id=(select auth.uid()) and m.role='owner'));
drop policy if exists "Members can view household membership" on public.household_members;
create policy "Users can view their own household memberships"
on public.household_members for select to authenticated using ((select auth.uid())=user_id);
do $$
declare t text;
begin
 foreach t in array array['shopping_items','bills','household_tasks','maintenance_reminders'] loop
  execute format('drop policy if exists %I on public.%I','Household members can read '||t,t);
  execute format('drop policy if exists %I on public.%I','Household members can add '||t,t);
  execute format('drop policy if exists %I on public.%I','Household members can edit '||t,t);
  execute format('drop policy if exists %I on public.%I','Members read '||t,t);
  execute format('drop policy if exists %I on public.%I','Members insert '||t,t);
  execute format('drop policy if exists %I on public.%I','Members update '||t,t);
  execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.household_members m where m.household_id=%I.household_id and m.user_id=(select auth.uid())))','Household members can read '||t,t,t);
  execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.household_members m where m.household_id=%I.household_id and m.user_id=(select auth.uid())) and created_by=(select auth.uid()))','Household members can add '||t,t,t);
  execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.household_members m where m.household_id=%I.household_id and m.user_id=(select auth.uid()))) with check (exists (select 1 from public.household_members m where m.household_id=%I.household_id and m.user_id=(select auth.uid())))','Household members can edit '||t,t,t,t);
  execute format('create index if not exists %I on public.%I(household_id)',t||'_household_id_idx',t);
  execute format('create index if not exists %I on public.%I(created_by)',t||'_created_by_idx',t);
 end loop;
end $$;
create index if not exists households_created_by_idx on public.households(created_by);

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
drop function if exists public.is_household_member(uuid);
create or replace function private.create_household(household_name text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare new_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if char_length(trim(household_name)) not between 1 and 80 then raise exception 'Household name must be 1 to 80 characters'; end if;
 insert into public.households(name,created_by) values(trim(household_name),auth.uid()) returning id into new_id;
 insert into public.household_members(household_id,user_id,role) values(new_id,auth.uid(),'owner');
 return new_id;
end;
$$;
create or replace function private.join_household(code text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare target_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if char_length(trim(code)) not between 6 and 20 then raise exception 'Invalid household invite code'; end if;
 select id into target_id from public.households where invite_code=lower(trim(code));
 if target_id is null then raise exception 'Invalid household invite code'; end if;
 insert into public.household_members(household_id,user_id,role) values(target_id,auth.uid(),'member') on conflict do nothing;
 return target_id;
end;
$$;
revoke all on function private.create_household(text) from public,anon;
revoke all on function private.join_household(text) from public,anon;
grant execute on function private.create_household(text) to authenticated;
grant execute on function private.join_household(text) to authenticated;
create or replace function public.create_household(household_name text)
returns uuid language sql security invoker set search_path=pg_catalog,public
as $$ select private.create_household(household_name); $$;
create or replace function public.join_household(code text)
returns uuid language sql security invoker set search_path=pg_catalog,public
as $$ select private.join_household(code); $$;
revoke all on function public.create_household(text) from public,anon;
revoke all on function public.join_household(text) from public,anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
