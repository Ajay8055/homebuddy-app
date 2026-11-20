alter table public.bills add column if not exists paid_at timestamptz;
alter table public.household_tasks add column if not exists completed_at timestamptz;
create index if not exists bills_household_paid_at_idx on public.bills(household_id, paid_at) where paid_at is not null;
create index if not exists household_tasks_household_completed_at_idx on public.household_tasks(household_id, completed_at) where completed_at is not null;