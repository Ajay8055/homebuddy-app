create index if not exists home_assets_created_by_idx on public.home_assets(created_by);
create index if not exists household_events_created_by_idx on public.household_events(created_by);
create index if not exists household_tasks_assigned_to_idx on public.household_tasks(assigned_to);
do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='household_events') then
   alter publication supabase_realtime add table public.household_events;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='home_assets') then
   alter publication supabase_realtime add table public.home_assets;
 end if;
end $$;
