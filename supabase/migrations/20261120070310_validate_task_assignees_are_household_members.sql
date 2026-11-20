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
