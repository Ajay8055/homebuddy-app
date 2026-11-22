import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-homebuddy-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function secrets() {
  const { data, error } = await admin.rpc("notification_secrets");
  if (error || !data) throw new Error("Notification secrets are not configured");
  return data as Record<string, string>;
}
function configurePush(s: Record<string,string>) {
  webpush.setVapidDetails(s.homebuddy_vapid_subject, s.homebuddy_vapid_public, s.homebuddy_vapid_private);
}

async function sendExpoPush(tokens: string[], message: Record<string, unknown>) {
  if (!tokens.length) return { sent: 0, invalid: [] as string[] };
  const messages = tokens.map(to => ({ to, sound: "default", priority: "high", channelId: "homebuddy-reminders", ...message }));
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Expo push gateway error: " + response.status);
  const tickets = body?.data ?? [];
  const invalid: string[] = [];
  let sent = 0;
  for (let i=0;i<tickets.length;i++) {
    if (tickets[i]?.status === "ok") sent++;
    else if (["DeviceNotRegistered","InvalidCredentials"].includes(tickets[i]?.details?.error)) invalid.push(tokens[i]);
  }
  return { sent, invalid };
}

async function sendToSubscription(sub: any, payload: string) {
  return webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 60 * 60 * 12 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const s = await secrets();
    configurePush(s);

    const cronAuthorized = req.headers.get("x-homebuddy-cron-secret") === s.homebuddy_cron_secret;
    if (body.action === "process-due") {
      if (!cronAuthorized) return json({ error: "Unauthorized scheduler" }, 401);
      const { data: generated, error: genError } = await admin.rpc("generate_homebuddy_reminders");
      if (genError) throw genError;
      const { data: due, error } = await admin.from("notifications").select("*")
        .eq("status", "pending").lte("scheduled_for", new Date().toISOString()).order("scheduled_for").limit(100);
      if (error) throw error;
      let sent = 0, failed = 0, cancelled = 0;
      for (const item of due ?? []) {
        // Recheck mutable records before sending, so paid bills and completed tasks are suppressed.
        if (item.entity_type && item.entity_id) {
          const table = item.entity_type === "bill" ? "bills" : item.entity_type === "task" ? "household_tasks" : item.entity_type === "event" ? "household_events" : item.entity_type === "maintenance" ? "maintenance_reminders" : null;
          if (table) {
            const { data: entity } = await admin.from(table).select("*").eq("id", item.entity_id).maybeSingle();
            if (!entity || (item.entity_type === "bill" && entity.is_paid) || (item.entity_type === "task" && entity.is_done)) {
              await admin.from("notifications").update({ status: "cancelled" }).eq("id", item.id);
              cancelled++; continue;
            }
          }
        }
        const { data: pref } = await admin.from("notification_preferences").select("enabled,categories,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone").eq("user_id", item.user_id).maybeSingle();
        if (pref?.enabled === false || (pref?.categories && pref.categories[item.category] === false)) {
          await admin.from("notifications").update({ status: "cancelled" }).eq("id", item.id); cancelled++; continue;
        }
        const tz = pref?.timezone || "Asia/Kolkata";
        if (pref?.quiet_hours_enabled) {
          const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
          const [h,m] = local.split(":").map(Number), nowM = h*60+m;
          const [sh,sm] = (pref.quiet_hours_start || "22:00").slice(0,5).split(":").map(Number);
          const [eh,em] = (pref.quiet_hours_end || "08:00").slice(0,5).split(":").map(Number);
          const start=sh*60+sm, end=eh*60+em;
          const quiet = start > end ? (nowM >= start || nowM < end) : (nowM >= start && nowM < end);
          if (quiet) continue;
        }
        const { data: subs } = await admin.from("notification_subscriptions").select("*").eq("user_id", item.user_id).eq("active", true);
        const { data: nativeTokens } = await admin.from("native_push_tokens").select("token").eq("user_id", item.user_id).eq("active", true);
        if (!subs?.length && !nativeTokens?.length) continue;
        const deepLink = new URL(item.target_url || "/", url);
        if (item.entity_id) deepLink.searchParams.set("record", item.entity_id);
        const pushData = { url: deepLink.pathname + deepLink.search, notificationId: item.id, tag: item.dedupe_key };
        const payload = JSON.stringify({ title: item.title, body: item.body, ...pushData });
        let delivered = false, errors: string[] = [];
        for (const sub of (subs ?? [])) {
          try { await sendToSubscription(sub, payload); delivered = true; }
          catch (e) {
            const status = (e as any)?.statusCode;
            errors.push(String((e as Error).message || e));
            if (status === 404 || status === 410) await admin.from("notification_subscriptions").update({ active: false }).eq("id", sub.id);
          }
        }
        if (nativeTokens?.length) {
          try {
            const result = await sendExpoPush(nativeTokens.map((x:any)=>x.token), { title:item.title, body:item.body, data:pushData });
            if (result.sent) delivered = true;
            if (result.invalid.length) await admin.from("native_push_tokens").update({active:false}).in("token",result.invalid);
            if (!result.sent) errors.push("Expo gateway did not accept any native device tokens");
          } catch (e) { errors.push(String((e as Error).message || e)); }
        }
        await admin.from("notifications").update({
          status: delivered ? "sent" : ((item.attempts || 0) + 1 >= 3 ? "failed" : "pending"),
          scheduled_for: delivered ? item.scheduled_for : new Date(Date.now() + 5 * 60 * 1000 * ((item.attempts || 0) + 1)).toISOString(),
          delivered_at: delivered ? new Date().toISOString() : null,
          attempts: (item.attempts || 0) + 1,
          last_error: delivered ? null : errors.join("; ").slice(0,1000)
        }).eq("id", item.id);
        if (delivered) sent++; else failed++;
      }
      return json({ ok: true, generated: generated ?? 0, processed: due?.length ?? 0, sent, failed, cancelled });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in to test notifications" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Your session expired. Sign in again." }, 401);
    if (body.action !== "test") return json({ error: "Unsupported action" }, 400);
    const { data: subs, error: subError } = await admin.from("notification_subscriptions").select("*").eq("user_id", userData.user.id).eq("active", true);
    if (subError) throw subError;
    const { data: nativeTokens, error: nativeError } = await admin.from("native_push_tokens").select("token").eq("user_id",userData.user.id).eq("active",true);
    if (nativeError) throw nativeError;
    if (!subs?.length && !nativeTokens?.length) return json({ error: "No web or native device is registered for push notifications." }, 404);
    const payload = JSON.stringify({ title: "HomeBuddy is ready!", body: "Your notification setup is working on this device.", url: "/?page=reminders", tag: "homebuddy-test-" + Date.now() });
    const results = await Promise.allSettled((subs ?? []).map((sub: any) => sendToSubscription(sub, payload)));
    let delivered = results.filter(x => x.status === "fulfilled").length;
    for (let i=0;i<results.length;i++) if (results[i].status === "rejected") {
      const e=(results[i] as PromiseRejectedResult).reason;
      if ([404,410].includes(e?.statusCode)) await admin.from("notification_subscriptions").update({active:false}).eq("id",subs[i].id);
    }
    if (nativeTokens?.length) {
      const nativeResult = await sendExpoPush(nativeTokens.map((x:any)=>x.token), {title:"HomeBuddy is ready!",body:"Your notification setup is working on this device.",data:{url:"/?page=reminders"}});
      delivered += nativeResult.sent;
      if (nativeResult.invalid.length) await admin.from("native_push_tokens").update({active:false}).in("token",nativeResult.invalid);
    }
    if (!delivered) throw new Error("Push provider rejected the test notification.");
    return json({ ok: true, delivered, devices: (subs?.length ?? 0)+(nativeTokens?.length ?? 0) });
  } catch (e) {
    console.error("homebuddy-push error", e);
    return json({ error: (e as Error)?.message || "Notification service error" }, 500);
  }
});