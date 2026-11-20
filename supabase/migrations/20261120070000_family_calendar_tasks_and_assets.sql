-- Family calendar, richer household tasks, and home asset inventory.
create table if not exists public.household_events (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 title text not null check (char_length(trim(title)) between 1 and 120),
 description text not null default '',
 starts_at timestamptz not null,
 all_day boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists household_events_household_starts_idx on public.household_events(household_id, starts_at);
create index if not exists household_events_created_by_idx on public.household_events(created_by);

alter table public.household_tasks
 add column if not exists description text not null default '',
 add column if not exists due_date date,
 add column if not exists assigned_to uuid references auth.users(id) on delete set null,
 add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high')),
 add column if not exists recurrence_frequency text not null default 'none' check (recurrence_frequency in ('none','weekly','monthly','yearly'));
create index if not exists household_tasks_household_due_idx on public.household_tasks(household_id, due_date);
create index if not exists household_tasks_assigned_to_idx on public.household_tasks(assigned_to);

create table if not exists public.home_assets (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 120),
 category text not null default 'Appliance',
 brand_model text not null default '',
 purchase_date date,
 warranty_until date,
 service_interval_months integer check (service_interval_months is null or service_interval_months between 1 and 60),
 notes text not null default '',
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists home_assets_household_idx on public.home_assets(household_id);
create index if not exists home_assets_created_by_idx on public.home_assets(created_by);

alter table public.maintenance_reminders
 add column if not exists asset_id uuid references public.home_assets(id) on delete set null,
 add column if not exists recurrence_frequency text not null default 'none' check (recurrence_frequency in ('none','monthly','yearly'));

alter table public.household_events enable row level security;
alter table public.home_assets enable row level security;
drop policy if exists "Household members can read household events" on public.household_events;
create policy "Household members can read household events" on public.household_events for select to authenticated using (private.is_household_member(household_id));
drop policy if exists "Household members can add household events" on public.household_events;
create policy "Household members can add household events" on public.household_events for insert to authenticated with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
drop policy if exists "Household members can edit household events" on public.household_events;
create policy "Household members can edit household events" on public.household_events for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
drop policy if exists "Only household owners delete household events" on public.household_events;
create policy "Only household owners delete household events" on public.household_events for delete to authenticated using (private.is_household_owner(household_id));

drop policy if exists "Household members can read home assets" on public.home_assets;
create policy "Household members can read home assets" on public.home_assets for select to authenticated using (private.is_household_member(household_id));
drop policy if exists "Household members can add home assets" on public.home_assets;
create policy "Household members can add home assets" on public.home_assets for insert to authenticated with check (private.is_household_member(household_id) and created_by = (select auth.uid()));
drop policy if exists "Household members can edit home assets" on public.home_assets;
create policy "Household members can edit home assets" on public.home_assets for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
drop policy if exists "Only household owners delete home assets" on public.home_assets;
create policy "Only household owners delete home assets" on public.home_assets for delete to authenticated using (private.is_household_owner(household_id));

grant select, insert, update, delete on public.household_events to authenticated;
grant select, insert, update, delete on public.home_assets to authenticated;

do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='household_events') then
   alter publication supabase_realtime add table public.household_events;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='home_assets') then
   alter publication supabase_realtime add table public.home_assets;
 end if;
end $$;

-- Only assign a household task to someone who is currently in that household.
drop policy if exists "Household members can add household_tasks" on public.household_tasks;
create policy "Household members can add household_tasks"
on public.household_tasks for insert to authenticated
with check (
 private.is_household_member(household_id)
 and created_by = (select auth.uid())
 and (assigned_to is null or exists (
   select 1 from public.household_members m
   where m.household_id = household_tasks.household_id
     and m.user_id = household_tasks.assigned_to
 ))
);
drop policy if exists "Household members can edit household_tasks" on public.household_tasks;
create policy "Household members can edit household_tasks"
on public.household_tasks for update to authenticated
using (private.is_household_member(household_id))
with check (
 private.is_household_member(household_id)
 and (assigned_to is null or exists (
   select 1 from public.household_members m
   where m.household_id = household_tasks.household_id
     and m.user_id = household_tasks.assigned_to
 ))
);
