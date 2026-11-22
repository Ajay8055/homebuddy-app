-- Track completed maintenance visits so overdue reminders stop and service history remains visible.
alter table public.maintenance_reminders
  add column if not exists is_done boolean not null default false,
  add column if not exists completed_at timestamptz;

create index if not exists maintenance_reminders_household_open_date_idx
  on public.maintenance_reminders(household_id, service_date)
  where is_done = false;

-- Do not generate new reminders for maintenance records already marked serviced.
do $$
declare
  definition text;
  old_join text := 'join public.maintenance_reminders m on m.household_id=r.household_id';
  new_join text := 'join public.maintenance_reminders m on m.household_id=r.household_id and not m.is_done';
begin
  definition := pg_get_functiondef('public.generate_homebuddy_reminders()'::regprocedure);
  if position(old_join in definition) = 0 then
    raise exception 'Could not safely update maintenance reminder generator: expected query fragment not found';
  end if;
  execute replace(definition, old_join, new_join);
end;
$$;

create or replace function public.cancel_completed_maintenance_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_done and not old.is_done then
    update public.notifications
       set status = 'cancelled'
     where category = 'maintenance'
       and entity_type = 'maintenance'
       and entity_id = new.id
       and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists cancel_completed_maintenance_notifications on public.maintenance_reminders;
create trigger cancel_completed_maintenance_notifications
after update of is_done on public.maintenance_reminders
for each row execute function public.cancel_completed_maintenance_notifications();

revoke all on function public.cancel_completed_maintenance_notifications() from public, anon, authenticated;