import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, CheckCheck, Settings2, Smartphone, Clock3 } from 'lucide-react';

const VAPID_PUBLIC_KEY = 'BKz-YGts9T43SI6RDKhUovGUseQxsTlZIXD7zdy4LhtD3oGe6RHNybr8bK6M9xBC-JkNcbCB2DbeNRAEOFlkVYg';
const categories = [
  ['bills','Bills & payments','Due dates, overdue and payment updates'],
  ['tasks','Tasks & chores','Assignments, deadlines and completion'],
  ['calendar','Family calendar','Birthdays, anniversaries and events'],
  ['maintenance','Home maintenance','Service and maintenance reminders'],
  ['family_activity','Family activity','Shared household updates']
];
function applicationKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
export default function NotificationCenter({ supabase, session, household, notice }) {
  const [permission,setPermission] = useState(('Notification' in window) ? Notification.permission : 'unsupported');
  const [subscription,setSubscription] = useState(null);
  const [busy,setBusy] = useState(false);
  const [prefs,setPrefs] = useState({enabled:true,categories:{bills:true,tasks:true,calendar:true,maintenance:true,family_activity:true},reminder_time:'09:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata',quiet_hours_enabled:true,quiet_hours_start:'22:00',quiet_hours_end:'08:00',bill_reminder_days:[3,1,0],task_reminder_days:[1,0],maintenance_reminder_days:[7,1]});
  const [history,setHistory] = useState([]);
  const [unread,setUnread] = useState(0);
  const [support,setSupport] = useState('Checking this device…');
  const demo = !supabase || !session;
  const refresh = async () => {
    if (demo) { setSupport('Sign in and connect a household to sync notification settings across devices.'); return; }
    const {data:p} = await supabase.from('notification_preferences').select('*').eq('user_id',session.user.id).maybeSingle();
    if (p) setPrefs(v=>({...v,...p,categories:{...v.categories,...p.categories}}));
    const {data:s} = await supabase.from('notification_subscriptions').select('id,endpoint').eq('user_id',session.user.id).eq('active',true);
    setSubscription(s?.[0]||null);
    const {data:n} = await supabase.from('notifications').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(50);
    setHistory(n||[]); setUnread((n||[]).filter(x=>!x.read_at).length);
    setSupport(s?.length ? 'This device is registered for push notifications.' : 'This device is not registered yet.');
  };
  useEffect(()=>{ refresh(); },[session?.user?.id,household?.id]);
  const savePrefs = async patch => {
    const next={...prefs,...patch};
    setPrefs(next);
    if (demo) { notice('Demo mode: preferences are preview-only until you sign in.'); return; }
    const {error}=await supabase.from('notification_preferences').upsert({
      user_id:session.user.id, household_id:household?.id||null, enabled:next.enabled,
      categories:next.categories, reminder_time:next.reminder_time, timezone:next.timezone,
      quiet_hours_enabled:next.quiet_hours_enabled, quiet_hours_start:next.quiet_hours_start,
      quiet_hours_end:next.quiet_hours_end, bill_reminder_days:next.bill_reminder_days,
      task_reminder_days:next.task_reminder_days, maintenance_reminder_days:next.maintenance_reminder_days,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(error) notice('Could not save notification preferences: '+error.message);
  };
  const enable = async () => {
    if (!navigator.onLine) { notice('Connect to the internet to set up notifications.'); return; }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported'); notice('Push notifications are not supported by this browser.'); return;
    }
    if (Notification.permission === 'denied') { setPermission('denied'); notice('Notifications are blocked. Enable them in your browser or device settings, then return here.'); return; }
    setBusy(true);
    try {
      let current=Notification.permission;
      if(current==='default') current=await Notification.requestPermission();
      setPermission(current);
      if(current!=='granted') { notice(current==='denied'?'Notifications are blocked in browser/device settings.':'Notification permission was not granted.'); return; }
      const reg=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(VAPID_PUBLIC_KEY)});
      if(!demo) {
        const raw=sub.toJSON();
        const {error}=await supabase.from('notification_subscriptions').upsert({
          user_id:session.user.id,household_id:household?.id||null,endpoint:raw.endpoint,
          p256dh:raw.keys?.p256dh,auth:raw.keys?.auth,user_agent:navigator.userAgent,active:true,last_seen_at:new Date().toISOString()
        },{onConflict:'endpoint'});
        if(error) throw error;
        const {error:prefError}=await supabase.from('notification_preferences').upsert({user_id:session.user.id,household_id:household?.id||null,enabled:true,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata'},{onConflict:'user_id'});
        if(prefError) throw prefError;
        setSubscription({endpoint:raw.endpoint});
        const {data,error:testError}=await supabase.functions.invoke('homebuddy-push',{body:{action:'test'}});
        if(testError || data?.error) throw new Error(data?.error||testError.message);
        notice('Notifications are enabled. Test notification sent to '+(data?.delivered||1)+' device(s).');
      } else {
        await reg.showNotification('HomeBuddy notifications enabled',{body:'Permission is granted. Sign in to register this device for reminders.',icon:'/icon.svg',badge:'/icon.svg'});
        notice('Browser permission granted. Sign in to register this device for push reminders.');
      }
      await refresh();
    } catch(e) { notice('Notification setup failed: '+(e?.message||'Unknown error')); }
    finally { setBusy(false); }
  };
  const markRead = async item => {
    if(!demo) await supabase.from('notifications').update({read_at:new Date().toISOString(),status:'read'}).eq('id',item.id).eq('user_id',session.user.id);
    setHistory(v=>v.map(x=>x.id===item.id?{...x,read_at:new Date().toISOString(),status:'read'}:x));
    setUnread(v=>Math.max(0,v-(!item.read_at?1:0)));
    if(item.target_url) window.location.href=item.target_url;
  };
  const markAll = async () => {
    if(!demo) await supabase.from('notifications').update({read_at:new Date().toISOString(),status:'read'}).eq('user_id',session.user.id).is('read_at',null);
    setHistory(v=>v.map(x=>({...x,read_at:x.read_at||new Date().toISOString(),status:'read'}))); setUnread(0);
  };
  const toggleCategory = key => savePrefs({categories:{...prefs.categories,[key]:!prefs.categories[key]}});
  const statusText = permission==='granted' ? (subscription?'Push enabled on this device':'Permission granted · device registration needed') : permission==='denied'?'Blocked in browser/device settings':permission==='unsupported'?'Not supported in this browser':'Not enabled yet';
  return <div className="notification-centre">
    <section className="notification-card">
      <div className="notification-card-head"><div className="notification-symbol"><BellRing size={21}/></div><div className="notification-card-copy"><b>Device notifications</b><small>{statusText}</small></div><button className="primary" onClick={enable} disabled={busy||permission==='denied'&&false}>{busy?'Setting up…':permission==='granted'&&subscription?'Enabled':'Enable notifications'}</button></div>
      <p className="notification-support">{support}</p>
      {permission==='denied'&&<p className="notification-help">To change this, open your browser's site settings, allow notifications for HomeBuddy, then come back and refresh.</p>}
      {permission==='unsupported'&&<p className="notification-help">Use a supported browser. On iPhone/iPad, install HomeBuddy on the Home Screen and open it from its app icon before enabling push.</p>}
    </section>
    <section className="notification-card">
      <div className="notification-section-title"><div><h2>Notification preferences</h2><p>Choose which household updates reach this device.</p></div><label className="notification-toggle"><input type="checkbox" checked={prefs.enabled} onChange={e=>savePrefs({enabled:e.target.checked})}/><span>All notifications</span></label></div>
      {categories.map(([key,label,desc])=><div className="notification-setting" key={key}><div><b>{label}</b><small>{desc}</small></div><input aria-label={label} type="checkbox" checked={!!prefs.categories?.[key]} disabled={!prefs.enabled} onChange={()=>toggleCategory(key)}/></div>)}
      <div className="notification-grid">
        <label><Clock3 size={15}/> Default reminder time<input type="time" value={prefs.reminder_time?.slice(0,5)||'09:00'} onChange={e=>savePrefs({reminder_time:e.target.value})}/></label>
        <label>Timezone<input value={prefs.timezone||'Asia/Kolkata'} onChange={e=>savePrefs({timezone:e.target.value})}/></label>
        <label className="quiet-setting"><input type="checkbox" checked={!!prefs.quiet_hours_enabled} onChange={e=>savePrefs({quiet_hours_enabled:e.target.checked})}/> Quiet hours</label>
        <label>From<input type="time" value={prefs.quiet_hours_start?.slice(0,5)||'22:00'} onChange={e=>savePrefs({quiet_hours_start:e.target.value})}/></label>
        <label>Until<input type="time" value={prefs.quiet_hours_end?.slice(0,5)||'08:00'} onChange={e=>savePrefs({quiet_hours_end:e.target.value})}/></label>
      </div>
      <p className="notification-footnote">Defaults: bills 3 days, 1 day and due date; tasks 1 day and due date; maintenance 7 days and 1 day. Quiet hours defer delivery until the next allowed window.</p>
    </section>
    <section className="notification-card">
      <div className="notification-section-title"><div><h2>Notification history</h2><p>{unread} unread · latest 50 alerts</p></div><button className="secondary" onClick={markAll} disabled={!unread}><CheckCheck size={15}/> Mark all read</button></div>
      {history.length ? history.map(item=><button className={'notification-history-row '+(!item.read_at?'unread':'')} key={item.id} onClick={()=>markRead(item)}><span className="notification-history-icon"><BellRing size={16}/></span><span className="notification-history-copy"><b>{item.title}</b><small>{item.body}</small><em>{new Date(item.created_at).toLocaleString()}</em></span>{!item.read_at&&<i/>}</button>) : <p className="notification-empty"><BellOff size={22}/>No notifications yet. New reminders and family updates will appear here.</p>}
    </section>
  </div>;
}
