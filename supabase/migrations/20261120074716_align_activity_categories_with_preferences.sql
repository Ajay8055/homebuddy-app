-- Backfill the current notification preference categories without overwriting user choices.
update public.notification_preferences
set categories = jsonb_build_object(
  'bills', coalesce(categories->'bills','true'::jsonb),
  'tasks', coalesce(categories->'tasks','true'::jsonb),
  'calendar', coalesce(categories->'calendar','true'::jsonb),
  'maintenance', coalesce(categories->'maintenance','true'::jsonb),
  'family_activity', coalesce(categories->'family_activity','true'::jsonb)
)
where categories is null
   or not (categories ? 'bills' and categories ? 'tasks' and categories ? 'calendar' and categories ? 'maintenance' and categories ? 'family_activity');
