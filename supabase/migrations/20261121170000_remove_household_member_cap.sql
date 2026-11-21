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
