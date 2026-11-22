-- Preserve existing date-only reminders while adding an optional exact due time for chat-created reminders.
alter table public.household_tasks
  add column if not exists due_at timestamptz;

create index if not exists household_tasks_due_at_pending_idx
  on public.household_tasks(household_id, due_at)
  where is_done = false and due_at is not null;

comment on column public.household_tasks.due_at is 'Optional exact due timestamp for reminders; due_date remains the calendar-date compatibility field.';
