-- Preserve shared household history when an account is deleted.
-- Account-specific rows (personal expenses, notification preferences, subscriptions,
-- notifications and membership) continue to cascade with auth.users.
alter table public.households
  add column if not exists status text not null default 'active'
    check (status in ('active','archived')),
  add column if not exists archived_at timestamptz;

-- Shared records outlive their author. Keep the record and clear the user reference.
alter table public.households alter column created_by drop not null;
alter table public.households drop constraint if exists households_created_by_fkey;
alter table public.households add constraint households_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

do $$
declare item record;
begin
  for item in
    select * from (values
      ('bills','created_by','bills_created_by_fkey'),
      ('home_assets','created_by','home_assets_created_by_fkey'),
      ('household_documents','uploaded_by','household_documents_uploaded_by_fkey'),
      ('household_events','created_by','household_events_created_by_fkey'),
      ('household_tasks','created_by','household_tasks_created_by_fkey'),
      ('maintenance_reminders','created_by','maintenance_reminders_created_by_fkey'),
      ('shared_expenses','created_by','shared_expenses_created_by_fkey'),
      ('shared_expenses','paid_by','shared_expenses_paid_by_fkey'),
      ('shopping_items','created_by','shopping_items_created_by_fkey')
    ) as x(table_name,column_name,constraint_name)
  loop
    execute format('alter table public.%I alter column %I drop not null',item.table_name,item.column_name);
    execute format('alter table public.%I drop constraint if exists %I',item.table_name,item.constraint_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      item.table_name,item.constraint_name,item.column_name
    );
  end loop;
end $$;

create or replace function private.is_household_active(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.households h
    where h.id = target_household_id and h.status = 'active'
  );
$$;
revoke all on function private.is_household_active(uuid) from public, anon;
grant execute on function private.is_household_active(uuid) to authenticated;

create or replace function private.is_household_owner(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = target_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and h.status = 'active'
  );
$$;

-- Owners may hand over the household, or leave it archived and viewable.
create or replace function public.prepare_household_owner_exit(
  target_household_id uuid,
  transfer_to_user_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare actor_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select role into actor_role
  from public.household_members
  where household_id = target_household_id and user_id = auth.uid()
  for update;

  if actor_role is null then raise exception 'You are not a member of this household'; end if;
  if actor_role <> 'owner' then return 'member_exit'; end if;

  perform 1 from public.households where id = target_household_id for update;
  if not found then raise exception 'Household not found'; end if;

  if transfer_to_user_id is null then
    update public.household_members
      set role = 'member'
      where household_id = target_household_id and user_id = auth.uid();
    update public.households
      set status = 'archived', archived_at = now()
      where id = target_household_id;
    return 'archived';
  end if;

  if transfer_to_user_id = auth.uid() or not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = transfer_to_user_id
  ) then
    raise exception 'Choose an existing member of this household';
  end if;

  update public.household_members
    set role = 'member'
    where household_id = target_household_id and role = 'owner';
  update public.household_members
    set role = 'owner'
    where household_id = target_household_id and user_id = transfer_to_user_id;
  update public.households
    set created_by = transfer_to_user_id, status = 'active', archived_at = null
    where id = target_household_id;
  return 'transferred';
end;
$$;
revoke all on function public.prepare_household_owner_exit(uuid,uuid) from public, anon;
grant execute on function public.prepare_household_owner_exit(uuid,uuid) to authenticated;

-- A remaining member can later take over an archived household. Row locking
-- ensures only one member can win the claim.
create or replace function public.claim_archived_household(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform 1 from public.households
    where id = target_household_id and status = 'archived'
    for update;
  if not found then raise exception 'This household is no longer available to claim'; end if;
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid()
  ) then raise exception 'Only an existing household member can claim it'; end if;
  update public.household_members
    set role = 'member'
    where household_id = target_household_id and role = 'owner';
  update public.household_members
    set role = 'owner'
    where household_id = target_household_id and user_id = auth.uid();
  update public.households
    set status = 'active', archived_at = null, created_by = auth.uid()
    where id = target_household_id;
end;
$$;
revoke all on function public.claim_archived_household(uuid) from public, anon;
grant execute on function public.claim_archived_household(uuid) to authenticated;

-- Archived households are read-only until a remaining member claims ownership.
do $$
declare t text;
begin
  foreach t in array array[
    'shopping_items','bills','household_tasks','maintenance_reminders',
    'household_events','home_assets','shared_expenses','household_documents'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (private.is_household_active(household_id))',
      'Active household required for insert', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (private.is_household_active(household_id)) with check (private.is_household_active(household_id))',
      'Active household required for update', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (private.is_household_active(household_id))',
      'Active household required for delete', t
    );
  end loop;
end $$;

-- FK ON DELETE SET NULL must be allowed through the existing creator guard.
-- A non-null replacement remains blocked, preventing creator reassignment/spoofing.
create or replace function public.guard_household_record_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'A household record cannot be moved to another household';
  end if;
  if new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'The original record creator cannot be changed';
  end if;
  return new;
end;
$$;


-- If Auth deletion fails after ownership was changed, restore the original
-- owner only when the expected transfer/archive state is still untouched.
create or replace function public.rollback_household_owner_exit(
  target_household_id uuid,
  original_owner_id uuid,
  transfer_to_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $rollback$
begin
  if not exists (select 1 from auth.users where id = original_owner_id) then
    raise exception 'Original account no longer exists; rollback is not applicable';
  end if;

  perform 1 from public.households where id = target_household_id for update;
  if not found then raise exception 'Household not found during rollback'; end if;

  if transfer_to_user_id is null then
    if not exists (
      select 1 from public.households
      where id = target_household_id and status = 'archived'
    ) or not exists (
      select 1 from public.household_members
      where household_id = target_household_id and user_id = original_owner_id and role = 'member'
    ) then
      raise exception 'Household changed after archival; refusing unsafe rollback';
    end if;
    update public.household_members
      set role = 'owner'
      where household_id = target_household_id and user_id = original_owner_id;
    update public.households
      set status = 'active', archived_at = null, created_by = original_owner_id
      where id = target_household_id;
    return;
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = transfer_to_user_id and role = 'owner'
  ) or not exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = original_owner_id and role = 'member'
  ) then
    raise exception 'Household ownership changed after transfer; refusing unsafe rollback';
  end if;

  update public.household_members
    set role = 'member'
    where household_id = target_household_id and user_id = transfer_to_user_id;
  update public.household_members
    set role = 'owner'
    where household_id = target_household_id and user_id = original_owner_id;
  update public.households
    set status = 'active', archived_at = null, created_by = original_owner_id
    where id = target_household_id;
end;
$rollback$;
revoke all on function public.rollback_household_owner_exit(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.rollback_household_owner_exit(uuid,uuid,uuid) to service_role;

-- Index the foreign keys identified by Supabase's performance advisor.
create index if not exists household_documents_uploaded_by_idx on public.household_documents(uploaded_by);
create index if not exists maintenance_reminders_asset_id_idx on public.maintenance_reminders(asset_id);
create index if not exists notification_preferences_household_id_idx on public.notification_preferences(household_id);
create index if not exists notification_subscriptions_household_id_idx on public.notification_subscriptions(household_id);
create index if not exists notifications_household_id_idx on public.notifications(household_id);
create index if not exists personal_expenses_household_id_idx on public.personal_expenses(household_id);
create index if not exists shared_expenses_created_by_idx on public.shared_expenses(created_by);
create index if not exists shared_expenses_paid_by_idx on public.shared_expenses(paid_by);

-- Private expenses remain available to read in an archived household, but
-- household-wide read-only mode also prevents creating or changing them.
create policy "Active household required for private expense insert"
on public.personal_expenses as restrictive for insert to authenticated
with check (private.is_household_active(household_id));
create policy "Active household required for private expense update"
on public.personal_expenses as restrictive for update to authenticated
using (private.is_household_active(household_id))
with check (private.is_household_active(household_id));
create policy "Active household required for private expense delete"
on public.personal_expenses as restrictive for delete to authenticated
using (private.is_household_active(household_id));

-- Storage uploads and mutations must follow the same archived-household
-- read-only rule. Existing documents remain readable to household members.
create policy "Active household required for vault upload"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'homebuddy-documents'
  or private.is_household_active(((storage.foldername(name))[1])::uuid)
);
create policy "Active household required for vault update"
on storage.objects as restrictive for update to authenticated
using (
  bucket_id <> 'homebuddy-documents'
  or private.is_household_active(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id <> 'homebuddy-documents'
  or private.is_household_active(((storage.foldername(name))[1])::uuid)
);
create policy "Active household required for vault delete"
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'homebuddy-documents'
  or private.is_household_active(((storage.foldername(name))[1])::uuid)
);
