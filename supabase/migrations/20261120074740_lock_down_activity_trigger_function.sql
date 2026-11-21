-- Trigger functions are invoked by their owning triggers, not directly by clients.
revoke all on function public.notify_household_activity() from public,anon,authenticated;
