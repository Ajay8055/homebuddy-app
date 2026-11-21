-- Family finance and private household document vault.
create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  category text not null default 'Other',
  expense_date date not null default current_date,
  paid_by uuid not null references auth.users(id),
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_expenses_household_date_idx
  on public.shared_expenses(household_id, expense_date desc);
create index if not exists shared_expenses_paid_by_idx
  on public.shared_expenses(paid_by);

alter table public.shared_expenses enable row level security;
drop policy if exists "Household members read shared expenses" on public.shared_expenses;
create policy "Household members read shared expenses"
on public.shared_expenses for select to authenticated
using (private.is_household_member(household_id));
drop policy if exists "Household members add shared expenses" on public.shared_expenses;
create policy "Household members add shared expenses"
on public.shared_expenses for insert to authenticated
with check (
  private.is_household_member(household_id)
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.household_members m
    where m.household_id = shared_expenses.household_id
      and m.user_id = shared_expenses.paid_by
  )
);
drop policy if exists "Creators and owners edit shared expenses" on public.shared_expenses;
create policy "Creators and owners edit shared expenses"
on public.shared_expenses for update to authenticated
using (private.is_household_member(household_id) and (created_by = (select auth.uid()) or private.is_household_owner(household_id)))
with check (
  private.is_household_member(household_id)
  and exists (
    select 1 from public.household_members m
    where m.household_id = shared_expenses.household_id
      and m.user_id = shared_expenses.paid_by
  )
);
drop policy if exists "Creators and owners delete shared expenses" on public.shared_expenses;
create policy "Creators and owners delete shared expenses"
on public.shared_expenses for delete to authenticated
using (private.is_household_member(household_id) and (created_by = (select auth.uid()) or private.is_household_owner(household_id)));
grant select, insert, update, delete on public.shared_expenses to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shared_expenses') then
    alter publication supabase_realtime add table public.shared_expenses;
  end if;
end $$;

create table if not exists public.household_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  category text not null default 'Other',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists household_documents_household_created_idx
  on public.household_documents(household_id, created_at desc);
alter table public.household_documents enable row level security;
drop policy if exists "Household members read documents" on public.household_documents;
create policy "Household members read documents"
on public.household_documents for select to authenticated
using (private.is_household_member(household_id));
drop policy if exists "Household members upload documents" on public.household_documents;
create policy "Household members upload documents"
on public.household_documents for insert to authenticated
with check (private.is_household_member(household_id) and uploaded_by = (select auth.uid()));
drop policy if exists "Uploaders and owners delete documents" on public.household_documents;
create policy "Uploaders and owners delete documents"
on public.household_documents for delete to authenticated
using (private.is_household_member(household_id) and (uploaded_by = (select auth.uid()) or private.is_household_owner(household_id)));
grant select, insert, delete on public.household_documents to authenticated;

-- Private bucket: downloads are signed/authenticated and membership is checked by storage RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homebuddy-documents',
  'homebuddy-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false, file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Household members read vault files" on storage.objects;
create policy "Household members read vault files"
on storage.objects for select to authenticated
using (
  bucket_id = 'homebuddy-documents'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "Household members upload vault files" on storage.objects;
create policy "Household members upload vault files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'homebuddy-documents'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2]) = (select auth.uid())::text
);
drop policy if exists "Uploaders and owners delete vault files" on storage.objects;
create policy "Uploaders and owners delete vault files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'homebuddy-documents'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
  and (
    ((storage.foldername(name))[2]) = (select auth.uid())::text
    or private.is_household_owner(((storage.foldername(name))[1])::uuid)
  )
);
