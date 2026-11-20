-- Prevent shared records from being reassigned or having their creator spoofed on update.
create or replace function public.guard_household_record_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'A household record cannot be moved to another household';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'The original record creator cannot be changed';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['bills','shopping_items','household_tasks','maintenance_reminders'] loop
    execute format('drop trigger if exists guard_household_record_ownership on public.%I', t);
    execute format(
      'create trigger guard_household_record_ownership before update on public.%I for each row execute function public.guard_household_record_ownership()',
      t
    );
  end loop;
end $$;
