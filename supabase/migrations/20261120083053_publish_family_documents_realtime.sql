do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='household_documents') then
  alter publication supabase_realtime add table public.household_documents;
 end if;
end $$;