-- Add recurring schedule metadata to bills. Existing bills remain one-time by default.
alter table public.bills
  add column if not exists recurrence_frequency text not null default 'none'
  check (recurrence_frequency in ('none','weekly','monthly','yearly'));
