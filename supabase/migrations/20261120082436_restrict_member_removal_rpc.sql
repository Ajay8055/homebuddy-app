-- Member removal is an authenticated owner action, never an anonymous RPC.
revoke execute on function public.remove_household_member(uuid, uuid) from public, anon;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
