-- Recurrence metadata for family calendar events.
alter table public.household_events
  add column if not exists recurrence_frequency text not null default 'none'
  check (recurrence_frequency in ('none','weekly','monthly','yearly'));

create index if not exists household_events_household_recurrence_idx
  on public.household_events(household_id, recurrence_frequency);
