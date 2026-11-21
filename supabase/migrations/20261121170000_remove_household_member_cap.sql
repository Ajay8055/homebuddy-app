-- Remove the arbitrary five-member limit while retaining serialized, idempotent joins.
-- Existing household row locking prevents concurrent invite-code joins from racing.
create or replace function private.join_household(code text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $join$
declare target_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(code)) not between 6 and 20 then
    raise exception 'Invalid household invite code';
  end if;

  select id into target_id
  from public.households
  where invite_code = lower(trim(code))
  for update;

  if target_id is null then
    raise exception 'Invalid household invite code';
  end if;

  if exists (
    select 1 from public.household_members
    where household_id = target_id and user_id = auth.uid()
  ) then
    return target_id;
  end if;

  if not exists (
    select 1 from public.households
    where id = target_id and status = 'active'
  ) then
    raise exception 'This household is archived and is not accepting new members';
  end if;

  insert into public.household_members(household_id, user_id, role)
  values (target_id, auth.uid(), 'member')
  on conflict do nothing;

  return target_id;
end;
$join$;

revoke all on function private.join_household(text) from public, anon;
grant execute on function private.join_household(text) to authenticated;

-- The public RPC remains the stable client entry point.
create or replace function public.join_household(code text)
returns uuid
language sql
set search_path = pg_catalog, public
as $wrapper$
  select private.join_household(code);
$wrapper$;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;


-- Permanently delete a household only when explicitly requested by its owner.
-- The client removes vault files through the Storage API before calling this RPC.
create or replace function public.delete_household(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $delete$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  perform 1
  from public.households h
  join public.household_members m on m.household_id = h.id
  where h.id = target_household_id
    and m.user_id = auth.uid()
    and m.role = 'owner'
  for update of h;
  if not found then
    raise exception 'Only the household owner can delete this household';
  end if;
  delete from public.households where id = target_household_id;
end;
$delete$;
revoke all on function public.delete_household(uuid) from public, anon;
grant execute on function public.delete_household(uuid) to authenticated;
