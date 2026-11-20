-- HomeBuddy initial schema. Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create or replace function public.is_household_member(target_household uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.household_members m where m.household_id = target_household and m.user_id = auth.uid()); $$;

create or replace function public.create_household(household_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(household_name)) not between 1 and 80 then raise exception 'Household name must be 1 to 80 characters'; end if;
  insert into public.households(name, created_by) values (trim(household_name), auth.uid()) returning id into new_id;
  insert into public.household_members(household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end; $$;

create or replace function public.join_household(code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target_id from public.households where invite_code = lower(trim(code));
  if target_id is null then raise exception 'Invalid household invite code'; end if;
  insert into public.household_members(household_id, user_id, role) values (target_id, auth.uid(), 'member') on conflict do nothing;
  return target_id;
end; $$;

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  quantity text not null default '',
  is_done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  due_date date,
  is_paid boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  due_label text not null default 'Today',
  is_done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  details text not null default '',
  service_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items enable row level security;
alter table public.bills enable row level security;
alter table public.household_tasks enable row level security;
alter table public.maintenance_reminders enable row level security;

drop policy if exists "Members can view their households" on public.households;
create policy "Members can view their households" on public.households for select to authenticated using (public.is_household_member(id));
drop policy if exists "Owners can update their households" on public.households;
create policy "Owners can update their households" on public.households for update to authenticated using (exists(select 1 from public.household_members m where m.household_id=id and m.user_id=auth.uid() and m.role='owner')) with check (exists(select 1 from public.household_members m where m.household_id=id and m.user_id=auth.uid() and m.role='owner'));
drop policy if exists "Members can view household membership" on public.household_members;
create policy "Members can view household membership" on public.household_members for select to authenticated using (public.is_household_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['shopping_items','bills','household_tasks','maintenance_reminders'] loop
    execute format('drop policy if exists "Household members can read %1$s" on public.%1$I', t);
    execute format('create policy "Household members can read %1$s" on public.%1$I for select to authenticated using (public.is_household_member(household_id))', t);
    execute format('drop policy if exists "Household members can add %1$s" on public.%1$I', t);
    execute format('create policy "Household members can add %1$s" on public.%1$I for insert to authenticated with check (public.is_household_member(household_id) and created_by = auth.uid())', t);
    execute format('drop policy if exists "Household members can edit %1$s" on public.%1$I', t);
    execute format('create policy "Household members can edit %1$s" on public.%1$I for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))', t);
    execute format('drop policy if exists "Household members can delete %1$s" on public.%1$I', t);
    execute format('create policy "Household members can delete %1$s" on public.%1$I for delete to authenticated using (public.is_household_member(household_id))', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.shopping_items, public.bills, public.household_tasks, public.maintenance_reminders to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
