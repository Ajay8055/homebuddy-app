-- Return display names from user profile metadata for family and assignee views.
create or replace function public.get_household_members()
returns table(user_id uuid, role text, joined_at timestamptz, display_name text)
language sql stable security definer
set search_path to public, auth
as $function$
  select hm.user_id,
         hm.role,
         hm.joined_at,
         coalesce(
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
           nullif(split_part(u.email, '@', 1), ''),
           'Family member'
         ) as display_name
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = (
    select mine.household_id
    from public.household_members mine
    where mine.user_id = auth.uid()
    limit 1
  )
  and auth.uid() is not null
  order by hm.joined_at;
$function$;
revoke all on function public.get_household_members() from public,anon;
grant execute on function public.get_household_members() to authenticated;
