-- HomeBuddy notification centre migration (production objects).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table if not exists public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 household_id uuid references public.households(id) on delete cascade,
 enabled boolean not null default true,
 categories jsonb not null default '{"bills":true,"tasks":true,"calendar":true,"maintenance":true,"family_activity":true}'::jsonb,
 reminder_time time not null default '09:00', timezone text not null default 'Asia/Kolkata',
 quiet_hours_enabled boolean not null default true, quiet_hours_start time not null default '22:00', quiet_hours_end time not null default '08:00',
 bill_reminder_days integer[] not null default array[3,1,0], task_reminder_days integer[] not null default array[1,0],
 maintenance_reminder_days integer[] not null default array[7,1], updated_at timestamptz not null default now()
);
create table if not exists public.notification_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid references public.households(id) on delete cascade, endpoint text not null unique,
 p256dh text not null, auth text not null, user_agent text, active boolean not null default true,
 last_seen_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists notification_subscriptions_user_active_idx on public.notification_subscriptions(user_id,active);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid references public.households(id) on delete cascade,
 category text not null check(category in ('bills','tasks','calendar','maintenance','family_activity','system')),
 title text not null, body text not null default '', target_url text not null default '/',
 entity_type text, entity_id uuid, scheduled_for timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sent','failed','cancelled','read')),
 delivered_at timestamptz, read_at timestamptz, attempts integer not null default 0,
 last_error text, dedupe_key text not null unique, created_at timestamptz not null default now()
);
create index if not exists notifications_due_idx on public.notifications(status,scheduled_for);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
alter table public.notification_preferences enable row level security;
alter table public.notification_subscriptions enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Users manage own push subscriptions" on public.notification_subscriptions;
create policy "Users manage own push subscriptions" on public.notification_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Users read and update own notifications" on public.notifications;
create policy "Users read and update own notifications" on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete on public.notification_preferences to authenticated;
grant select,insert,update,delete on public.notification_subscriptions to authenticated;
grant select,update on public.notifications to authenticated;
CREATE OR REPLACE FUNCTION public.generate_homebuddy_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inserted_count integer := 0; n integer := 0;
begin
  -- Bill reminders for shared bills only. Private personal_expenses are intentionally excluded.
  with recipients as (
    select hm.user_id, hm.household_id, coalesce(np.timezone,'Asia/Kolkata') tz,
           coalesce(np.reminder_time,'09:00'::time) reminder_time,
           coalesce((np.categories->>'bills')::boolean,true) enabled,
           coalesce(np.bill_reminder_days,array[3,1,0]) offsets
    from public.household_members hm
    left join public.notification_preferences np on np.user_id=hm.user_id
    where coalesce(np.enabled,true)
  ), candidates as (
    select r.user_id, r.household_id, b.id entity_id, b.name,
      case when b.due_date < (now() at time zone r.tz)::date then 'Overdue bill: '||b.name
           when b.due_date = (now() at time zone r.tz)::date then 'Bill due today: '||b.name
           else 'Upcoming bill: '||b.name end title,
      'Your household bill of ₹'||b.amount::text||' is due '||b.due_date::text||'.' body,
      '/?page=bills' target_url,
      (b.due_date - off.days)::timestamp + r.reminder_time as local_send,
      r.tz
    from recipients r
    join public.bills b on b.household_id=r.household_id and not b.is_paid and b.due_date is not null
    cross join lateral unnest(r.offsets) off(days)
    where r.enabled and (b.due_date - off.days) = (now() at time zone r.tz)::date
  )
  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select user_id,household_id,'bills',title,body,target_url,'bill',entity_id,
         local_send at time zone tz,
         'bill:'||entity_id::text||':'||((local_send::date)::text)||':'||user_id::text
  from candidates
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; inserted_count := inserted_count+n;

  -- Task reminders: assignee first; unassigned tasks notify all household members.
  with task_recipients as (
    select t.id,t.household_id,t.name,t.due_date,hm.user_id,
      coalesce(np.timezone,'Asia/Kolkata') tz,coalesce(np.reminder_time,'09:00'::time) reminder_time,
      coalesce((np.categories->>'tasks')::boolean,true) enabled,
      coalesce(np.task_reminder_days,array[1,0]) offsets
    from public.household_tasks t
    join public.household_members hm on hm.household_id=t.household_id
    left join public.notification_preferences np on np.user_id=hm.user_id
    where not t.is_done and t.due_date is not null and coalesce(np.enabled,true)
      and (t.assigned_to is null or t.assigned_to=hm.user_id)
  ), candidates as (
    select tr.*, off.days,
      (tr.due_date-off.days)::timestamp+tr.reminder_time local_send
    from task_recipients tr cross join lateral unnest(tr.offsets) off(days)
    where tr.enabled and (tr.due_date-off.days)=(now() at time zone tr.tz)::date
  )
  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select user_id,household_id,'tasks','Task reminder: '||name,'This household task is due '||due_date::text||'.','/?page=tasks','task',id,
    local_send at time zone tz,'task:'||id::text||':'||due_date::text||':'||days::text||':'||user_id::text
  from candidates on conflict(dedupe_key) do nothing;
  get diagnostics n = row_count; inserted_count := inserted_count+n;

  -- Calendar reminders: one-off events plus weekly, monthly and yearly recurrences.
  with recipients as (
    select hm.user_id,hm.household_id,coalesce(np.timezone,'Asia/Kolkata') tz,
      coalesce((np.categories->>'calendar')::boolean,true) enabled
    from public.household_members hm left join public.notification_preferences np on np.user_id=hm.user_id
    where coalesce(np.enabled,true)
  ), occurrences as (
    select r.user_id,r.household_id,r.tz,e.id,e.title,e.recurrence_frequency,
      case
        when e.recurrence_frequency='yearly' then
          (e.starts_at + make_interval(years=>greatest(0,extract(year from (now() at time zone r.tz))::int-extract(year from (e.starts_at at time zone r.tz))::int)))
        when e.recurrence_frequency='monthly' then
          (e.starts_at + make_interval(months=>greatest(0,
            (extract(year from (now() at time zone r.tz))::int-extract(year from (e.starts_at at time zone r.tz))::int)*12
            + extract(month from (now() at time zone r.tz))::int-extract(month from (e.starts_at at time zone r.tz))::int)))
        when e.recurrence_frequency='weekly' then
          (e.starts_at + make_interval(weeks=>greatest(0,floor(extract(epoch from (now()-e.starts_at))/604800)::int)))
        else e.starts_at
      end first_occurrence
    from recipients r join public.household_events e on e.household_id=r.household_id
    where r.enabled
  ), next_occurrences as (
    select *,case
      when first_occurrence > now() then first_occurrence
      when recurrence_frequency='yearly' then first_occurrence + interval '1 year'
      when recurrence_frequency='monthly' then first_occurrence + interval '1 month'
      when recurrence_frequency='weekly' then first_occurrence + interval '1 week'
      else first_occurrence
    end occurrence
    from occurrences
  ), candidates as (
    select n.user_id,n.household_id,n.id,n.title,n.occurrence,offsets.mins,
      n.occurrence - make_interval(mins=>offsets.mins) scheduled,n.tz
    from next_occurrences n cross join (values (1440),(60)) offsets(mins)
    where n.occurrence > now()
      and n.occurrence - make_interval(mins=>offsets.mins) <= now() + interval '1 minute'
      and n.occurrence - make_interval(mins=>offsets.mins) > now() - interval '1 minute'
  )
  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select user_id,household_id,'calendar','Upcoming event: '||title,
    title||' starts in '||case when mins=60 then '1 hour.' else '1 day.' end,
    '/?page=calendar','event',id,scheduled,
    'event:'||id::text||':'||to_char(occurrence at time zone tz,'YYYY-MM-DD')||':'||mins::text||':'||user_id::text
  from candidates on conflict(dedupe_key) do nothing;
  get diagnostics n = row_count; inserted_count := inserted_count+n;

  -- Maintenance reminders: 7 days and 1 day before service date.
  with recipients as (
    select hm.user_id,hm.household_id,coalesce(np.timezone,'Asia/Kolkata') tz,
      coalesce(np.reminder_time,'09:00'::time) reminder_time,
      coalesce((np.categories->>'maintenance')::boolean,true) enabled,
      coalesce(np.maintenance_reminder_days,array[7,1]) offsets
    from public.household_members hm left join public.notification_preferences np on np.user_id=hm.user_id
    where coalesce(np.enabled,true)
  ), candidates as (
    select r.user_id,r.household_id,m.id,m.name,m.service_date,off.days,
      (m.service_date-off.days)::timestamp+r.reminder_time local_send,r.tz
    from recipients r join public.maintenance_reminders m on m.household_id=r.household_id
    cross join lateral unnest(r.offsets) off(days)
    where r.enabled and m.service_date is not null
      and (m.service_date-off.days)=(now() at time zone r.tz)::date
  )
  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select user_id,household_id,'maintenance','Maintenance due soon: '||name,
    name||' is due for servicing on '||service_date::text||'.',
    '/?page=maintenance','maintenance',id,local_send at time zone tz,
    'maintenance:'||id::text||':'||days::text||':'||user_id::text
  from candidates on conflict(dedupe_key) do nothing;
  get diagnostics n = row_count; inserted_count := inserted_count+n;

  -- Daily overdue reminders, limited to one per item/user/local date.
  with recipients as (
    select hm.user_id,hm.household_id,coalesce(np.timezone,'Asia/Kolkata') tz,
      coalesce(np.reminder_time,'09:00'::time) reminder_time,
      coalesce((np.categories->>'bills')::boolean,true) bills_enabled,
      coalesce((np.categories->>'tasks')::boolean,true) tasks_enabled
    from public.household_members hm left join public.notification_preferences np on np.user_id=hm.user_id
    where coalesce(np.enabled,true)
  ), overdue as (
    select r.user_id,r.household_id,'bills'::text category,b.id entity_id,
      'Overdue bill: '||b.name title,'This bill is still unpaid.' body,
      '/?page=bills' target_url,r.tz,r.reminder_time
    from recipients r join public.bills b on b.household_id=r.household_id
    where r.bills_enabled and not b.is_paid and b.due_date < (now() at time zone r.tz)::date
    union all
    select r.user_id,r.household_id,'tasks',t.id,'Overdue task: '||t.name,
      'This household task is still incomplete.','/?page=tasks',r.tz,r.reminder_time
    from recipients r join public.household_tasks t on t.household_id=r.household_id
    where r.tasks_enabled and not t.is_done and t.due_date < (now() at time zone r.tz)::date
      and (t.assigned_to is null or t.assigned_to=r.user_id)
  )
  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select user_id,household_id,category,title,body,target_url,
    case when category='bills' then 'bill' else 'task' end,entity_id,
    ((now() at time zone tz)::date::timestamp+reminder_time) at time zone tz,
    'overdue:'||category||':'||entity_id::text||':'||user_id::text||':'||((now() at time zone tz)::date)::text
  from overdue on conflict(dedupe_key) do nothing;
  get diagnostics n = row_count; inserted_count := inserted_count+n;

  return inserted_count;
end;
$function$

CREATE OR REPLACE FUNCTION public.notify_household_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  hid uuid; eid uuid; event_title text; event_body text; event_url text; kind text;
  event_stamp text; target_user uuid; category_name text;
begin
  if tg_table_name='bills' then
    hid:=new.household_id; eid:=new.id; kind:='bill'; category_name:='bills'; event_url:='/?page=bills'; event_stamp:=new.created_at::text;
    if tg_op='INSERT' then
      event_title:='New shared bill added: '||new.name;
      event_body:='A household bill of ₹'||new.amount::text||' was added, due '||coalesce(new.due_date::text,'date not set')||'.';
    elsif tg_op='UPDATE' and old.is_paid is distinct from new.is_paid and new.is_paid then
      event_title:='Bill marked paid: '||new.name; event_body:='A household member marked this bill as paid.';
    else return new; end if;
  elsif tg_table_name='household_tasks' then
    hid:=new.household_id; eid:=new.id; kind:='task'; category_name:='tasks'; event_url:='/?page=tasks'; event_stamp:=new.created_at::text; target_user:=new.assigned_to;
    if tg_op='INSERT' then
      event_title:='New household task: '||new.name;
      event_body:='A household task was added'||case when new.due_date is not null then ', due '||new.due_date::text else '' end||'.';
    elsif tg_op='UPDATE' and old.is_done is distinct from new.is_done and new.is_done then
      event_title:='Task completed: '||new.name; event_body:='A household member completed this task.';
    else return new; end if;
  elsif tg_table_name='household_members' then
    hid:=new.household_id; eid:=new.household_id; kind:='family'; category_name:='family_activity'; event_stamp:=new.joined_at::text;
    event_title:='A new family member joined HomeBuddy'; event_body:='Your household has a new member.';
    event_url:='/?page=family'; actor:=new.user_id;
  else return new; end if;

  insert into public.notifications(user_id,household_id,category,title,body,target_url,entity_type,entity_id,scheduled_for,dedupe_key)
  select hm.user_id,hid,category_name,event_title,event_body,event_url,kind,
    case when kind='family' then null else eid end,now(),
    'activity:'||tg_table_name||':'||tg_op||':'||eid::text||':'||hm.user_id::text||':'||coalesce(event_stamp,now()::text)
  from public.household_members hm
  where hm.household_id=hid
    and hm.user_id<>coalesce(actor,'00000000-0000-0000-0000-000000000000'::uuid)
    and (kind<>'task' or tg_op<>'INSERT' or target_user is null or hm.user_id=target_user or hm.role='owner');
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.notification_secrets()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in ('homebuddy_vapid_private','homebuddy_vapid_public','homebuddy_vapid_subject','homebuddy_cron_secret');
$function$

revoke all on function public.generate_homebuddy_reminders() from public,anon,authenticated;
grant execute on function public.generate_homebuddy_reminders() to service_role;
revoke all on function public.notification_secrets() from public,anon,authenticated;
grant execute on function public.notification_secrets() to service_role;
revoke all on function public.notify_household_activity() from public,anon,authenticated;
drop trigger if exists notify_bill_activity_insert on public.bills;
create trigger notify_bill_activity_insert after insert on public.bills for each row execute function public.notify_household_activity();
drop trigger if exists notify_bill_paid_activity on public.bills;
create trigger notify_bill_paid_activity after update of is_paid on public.bills for each row execute function public.notify_household_activity();
drop trigger if exists notify_task_activity_insert on public.household_tasks;
create trigger notify_task_activity_insert after insert on public.household_tasks for each row execute function public.notify_household_activity();
drop trigger if exists notify_task_completed_activity on public.household_tasks;
create trigger notify_task_completed_activity after update of is_done on public.household_tasks for each row execute function public.notify_household_activity();
drop trigger if exists notify_family_member_joined on public.household_members;
create trigger notify_family_member_joined after insert on public.household_members for each row execute function public.notify_household_activity();
do $$
begin
 if not exists(select 1 from cron.job where jobname='homebuddy-push-every-minute') then
  perform cron.schedule('homebuddy-push-every-minute','* * * * *',$job$
   select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='homebuddy_project_url') || '/functions/v1/homebuddy-push',
    headers := jsonb_build_object('Content-Type','application/json','x-homebuddy-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='homebuddy_cron_secret')),
    body := '{"action":"process-due"}'::jsonb, timeout_milliseconds := 10000);
  $job$);
 end if;
end $$;
