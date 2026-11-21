-- Family activity notifications and their database triggers.
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
$function$;
CREATE OR REPLACE FUNCTION public.notification_secrets()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in ('homebuddy_vapid_private','homebuddy_vapid_public','homebuddy_vapid_subject','homebuddy_cron_secret');
$function$;
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
revoke all on function public.notification_secrets() from public,anon,authenticated;
grant execute on function public.notification_secrets() to service_role;
