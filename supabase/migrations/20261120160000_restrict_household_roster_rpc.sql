-- The roster RPC intentionally runs as SECURITY DEFINER so it can read auth.users.
-- It is only needed by signed-in household members; do not expose it to anonymous clients.
revoke execute on function public.get_household_members() from public, anon;
grant execute on function public.get_household_members() to authenticated;
