-- Recurring bill schedule metadata as present in the reconciled production schema.
alter table public.bills
 add column if not exists recurrence_frequency text not null default 'none'
 check (recurrence_frequency in ('none','weekly','monthly','yearly')),
 add column if not exists recurrence_end_date date,
 add column if not exists recurrence_series_id uuid;
create index if not exists bills_recurrence_series_idx
 on public.bills(recurrence_series_id) where recurrence_series_id is not null;
create unique index if not exists bills_recurring_occurrence_unique
 on public.bills(recurrence_series_id,due_date)
 where recurrence_series_id is not null and due_date is not null;
