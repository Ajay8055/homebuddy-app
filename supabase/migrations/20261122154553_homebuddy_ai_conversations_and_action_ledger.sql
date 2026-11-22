-- HomeBuddy conversational assistant: private conversation history and idempotent action ledger.
-- Additive only; existing household records and policies are untouched.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations(user_id, updated_at desc);
create index if not exists ai_conversations_household_idx
  on public.ai_conversations(household_id, updated_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists "Users read their own AI conversations" on public.ai_conversations;
create policy "Users read their own AI conversations"
  on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));
drop policy if exists "Users create their own AI conversations" on public.ai_conversations;
create policy "Users create their own AI conversations"
  on public.ai_conversations for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));
drop policy if exists "Users update their own AI conversations" on public.ai_conversations;
create policy "Users update their own AI conversations"
  on public.ai_conversations for update to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id))
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));
drop policy if exists "Users delete their own AI conversations" on public.ai_conversations;
create policy "Users delete their own AI conversations"
  on public.ai_conversations for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null check (char_length(content) <= 12000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages(conversation_id, created_at);
alter table public.ai_messages enable row level security;
drop policy if exists "Users access messages in their own conversations" on public.ai_messages;
create policy "Users access messages in their own conversations"
  on public.ai_messages for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
        and private.is_household_member(c.household_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
        and private.is_household_member(c.household_id)
    )
  );

create table if not exists public.ai_action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  action_type text not null check (char_length(action_type) between 1 and 80),
  status text not null default 'started' check (status in ('started','succeeded','failed','needs_confirmation')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists ai_action_requests_household_created_idx
  on public.ai_action_requests(household_id, created_at desc);
alter table public.ai_action_requests enable row level security;
drop policy if exists "Users view their own AI action requests" on public.ai_action_requests;
create policy "Users view their own AI action requests"
  on public.ai_action_requests for select to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id));
drop policy if exists "Users create their own AI action requests" on public.ai_action_requests;
create policy "Users create their own AI action requests"
  on public.ai_action_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));
drop policy if exists "Users update their own AI action requests" on public.ai_action_requests;
create policy "Users update their own AI action requests"
  on public.ai_action_requests for update to authenticated
  using (user_id = (select auth.uid()) and private.is_household_member(household_id))
  with check (user_id = (select auth.uid()) and private.is_household_member(household_id));

grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, update, delete on public.ai_messages to authenticated;
grant select, insert, update on public.ai_action_requests to authenticated;

create or replace function public.touch_ai_conversation()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  update public.ai_conversations set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;
revoke all on function public.touch_ai_conversation() from public, anon, authenticated;
drop trigger if exists ai_messages_touch_conversation on public.ai_messages;
create trigger ai_messages_touch_conversation
  after insert on public.ai_messages
  for each row execute function public.touch_ai_conversation();

comment on table public.ai_conversations is 'Private per-user conversational assistant threads scoped to a household.';
comment on table public.ai_messages is 'Messages for HomeBuddy AI conversations; protected by conversation ownership and household membership.';
comment on table public.ai_action_requests is 'Idempotency and audit ledger for AI-triggered household actions.';
