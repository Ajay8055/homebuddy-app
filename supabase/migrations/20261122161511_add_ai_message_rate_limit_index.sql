-- Support the per-user, per-minute AI request limit without scanning message history.
create index if not exists ai_messages_user_created_idx
  on public.ai_messages(user_id, created_at desc);
