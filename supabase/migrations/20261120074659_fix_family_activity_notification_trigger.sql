-- Rebind the family-join activity trigger to the hardened activity function.
drop trigger if exists notify_family_member_joined on public.household_members;
create trigger notify_family_member_joined after insert on public.household_members for each row execute function public.notify_household_activity();
