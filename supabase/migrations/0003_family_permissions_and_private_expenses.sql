-- Family collaboration hardening and private personal expenses.
-- Shared household records remain readable/editable by members; only owners can delete.
create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target_household_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function private.is_household_member(uuid) from public, anon;
revoke all on function private.is_household_owner(uuid) from public, anon;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_owner(uuid) to authenticated;

-- Members can see the roster for their own household (needed for the Family screen).
drop policy if exists "Users can view their own household memberships" on public.household_members;
create policy "Members can view household roster"
on public.household_members for select to authenticated
using (private.is_household_member(household_id));

-- Shared records: keep member insert/update policies; replace delete with owner-only.
do $$
declare t text;
begin
  foreach t in array array['shopping_items','bills','household_tasks','maintenance_reminders'] loop
    execute format('drop policy if exists %I on public.%I', 'Household members can delete ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Members delete ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_household_owner(household_id))', 'Only household owners delete ' || t, t);
  end loop;
end $$;

-- Personal expenses are private to the authenticated creator, even from the household owner.
create table if not exists public.personal_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'Other',
  expense_date date not null default current_date,
  created_at timestamptz not null default now(),
  constraint personal_expenses_creator_matches_session check (user_id = auth.uid())
);
create index if not exists personal_expenses_user_date_idx
  on public.personal_expenses(user_id, expense_date desc);

alter table public.personal_expenses enable row level security;
drop policy if exists "Users manage their own personal expenses" on public.personal_expenses;
create policy "Users manage their own personal expenses"
on public.personal_expenses for all to authenticated
using (
  user_id = (select auth.uid())
  and private.is_household_member(household_id)
)
with check (
  user_id = (select auth.uid())
  and private.is_household_member(household_id)
);
grant select, insert, update, delete on public.personal_expenses to authenticated;

-- Owner-only member removal. Owners cannot remove themselves through this action.
create or replace function public.remove_household_member(target_household_id uuid, target_user_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can remove members';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'The owner cannot remove themselves';
  end if;
  delete from public.household_members
  where household_id = target_household_id and user_id = target_user_id and role <> 'owner';
  if not found then raise exception 'Member not found or cannot be removed'; end if;
end;
$$;
revoke all on function public.remove_household_member(uuid, uuid) from public, anon;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;

-- Publish the shared tables and private-expense table for live updates.
do $$
declare t text;
begin
  foreach t in array array['bills','household_tasks','shopping_items','maintenance_reminders','personal_expenses','household_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
