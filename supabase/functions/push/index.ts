// Web Push sender for task notifications (Phase 3) — works when the app is closed.
//
// Actions (POST JSON { action, ... }):
//   vapid        -> { publicKey }  (keys are generated once and kept in push_config,
//                                   which only this function's service role can read)
//   subscribe    -> store a device's push subscription for a member
//   unsubscribe  -> remove a device
//   test         -> send a test push to one device
//   event        -> push a new row from public.notifications (called by a DB trigger)
//   daily        -> morning digest of date reminders (called hourly by pg_cron;
//                   each device gets it once a day at 08:00 in its own timezone)
//
// No action accepts message text from the caller: everything pushed is read from
// the database, and event/daily are idempotent, so calling them again is harmless.
// Deploy with verify_jwt disabled (the app uses a publishable key, not a JWT).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DIGEST_HOUR = 8;
const DUE_SOON_DAYS = 2;

// ---- VAPID keys ----------------------------------------------------------------
let vapidReady: Promise<string> | null = null;
function vapid(): Promise<string> {
  if (!vapidReady) {
    vapidReady = (async () => {
      let { data } = await db.from("push_config").select("public_key,private_key").eq("id", 1).maybeSingle();
      if (!data) {
        const keys = webpush.generateVAPIDKeys();
        await db.from("push_config").upsert(
          { id: 1, public_key: keys.publicKey, private_key: keys.privateKey },
          { onConflict: "id", ignoreDuplicates: true },
        );
        ({ data } = await db.from("push_config").select("public_key,private_key").eq("id", 1).single());
      }
      webpush.setVapidDetails(SUPABASE_URL, data!.public_key, data!.private_key);
      return data!.public_key as string;
    })().catch((e) => {
      vapidReady = null;
      throw e;
    });
  }
  return vapidReady;
}

// ---- Sending -----------------------------------------------------------------
interface Sub { endpoint: string; recipient: string; p256dh: string; auth: string; tz: string; last_digest_date: string | null }
interface Payload { title: string; body: string; tag: string; url?: string }

async function send(sub: Sub, payload: Payload): Promise<boolean> {
  await vapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ url: "/", ...payload }),
      { TTL: 60 * 60 * 24, urgency: "normal" },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); // device unsubscribed
    } else {
      console.warn("push failed", status, (err as Error).message);
    }
    return false;
  }
}

async function subsFor(recipient: string): Promise<Sub[]> {
  const { data } = await db.from("push_subscriptions").select("*").eq("recipient", recipient);
  return (data || []) as Sub[];
}

// ---- Shared helpers (mirror src/lib/notifications.ts) ---------------------------
const key = (n?: string | null) => (n || "").trim().toLowerCase();
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const isDoneColumn = (title?: string) => !!title && /\b(done|complete|completed|shipped|closed)\b/i.test(title);

// deno-lint-ignore no-explicit-any
type Json = any;

const isMember = (project: Json, recipient: string) =>
  (project.members || []).some((m: Json) => key(m?.name) === recipient);

function watching(t: Json, me: string): boolean {
  if ((t.watchers || []).some((w: string) => key(w) === me)) return true;
  return key(t.assignee) === me && !(t.muted || []).some((w: string) => key(w) === me);
}

interface Alert { key: string; severity: number; title: string; message: string; project: string; date: string }

function alertsFor(projects: Json[], me: string, today: string): Alert[] {
  const out: Alert[] = [];
  for (const p of projects) {
    if (p.archived || !isMember(p, me)) continue;
    for (const t of p.tasks || []) {
      if (!watching(t, me)) continue;
      const col = (p.columns || []).find((c: Json) => c.id === t.status);
      if (isDoneColumn(col?.title)) continue;
      const push = (kind: string, date: string, message: string, severity: number) =>
        out.push({ key: `${kind}:${p.id}:${t.id}:${date}`, severity, title: t.title, message, project: p.name, date });
      if (isDate(t.dueDate)) {
        const d = dayDiff(today, t.dueDate);
        const what = t.isMilestone ? "Milestone" : "Due";
        if (d < 0) push("overdue", t.dueDate, `Overdue by ${days(-d)} (was due ${fmt(t.dueDate)})`, 0);
        else if (d === 0) push("due-today", t.dueDate, `${what} today`, 1);
        else if (d <= DUE_SOON_DAYS) push("due-soon", t.dueDate, `${what} ${d === 1 ? "tomorrow" : `in ${days(d)}`} (${fmt(t.dueDate)})`, 1);
      }
      if (isDate(t.deadline) && t.deadline !== t.dueDate) {
        const d = dayDiff(today, t.deadline);
        if (d < 0) push("deadline-passed", t.deadline, `Deadline passed ${days(-d)} ago (${fmt(t.deadline)})`, 0);
        else if (d <= DUE_SOON_DAYS) push("deadline-soon", t.deadline, `Deadline ${d === 0 ? "is today" : d === 1 ? "tomorrow" : `in ${days(d)}`} (${fmt(t.deadline)})`, 1);
      }
      if (isDate(t.startDate) && t.startDate === today && t.startDate !== t.dueDate) {
        push("starts-today", t.startDate, "Starts today", 2);
      }
    }
  }
  return out.sort((a, b) => a.severity - b.severity || a.date.localeCompare(b.date));
}

function localNow(tz: string): { date: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  } catch {
    return localNow("UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

// ---- Actions -----------------------------------------------------------------
async function handleEvent(id: string) {
  // Claim the row so it is pushed exactly once.
  const { data: row } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .select("*")
    .maybeSingle();
  if (!row) return { sent: 0 };
  const { data: project } = await db.from("projects").select("name,members,archived").eq("id", row.project_id).maybeSingle();
  if (!project || project.archived || !isMember(project, row.recipient)) return { sent: 0 };
  let sent = 0;
  for (const sub of await subsFor(row.recipient)) {
    if (await send(sub, { title: row.task_title || "Task update", body: `${row.message} · ${project.name}`, tag: `evt:${row.id}` })) sent++;
  }
  return { sent };
}

async function handleDaily() {
  const { data: subs } = await db.from("push_subscriptions").select("*");
  const due = ((subs || []) as Sub[])
    .map((s) => ({ s, now: localNow(s.tz || "UTC") }))
    .filter(({ s, now }) => now.hour === DIGEST_HOUR && s.last_digest_date !== now.date);
  if (due.length === 0) return { sent: 0 };

  const { data: projects } = await db.from("projects").select("id,name,columns,tasks,members,archived");
  const readCache = new Map<string, Set<string>>();
  let sent = 0;
  for (const { s, now } of due) {
    await db.from("push_subscriptions").update({ last_digest_date: now.date }).eq("endpoint", s.endpoint);
    if (!readCache.has(s.recipient)) {
      const { data: reads } = await db.from("notification_reads").select("alert_key").eq("recipient", s.recipient).limit(2000);
      readCache.set(s.recipient, new Set((reads || []).map((r: Json) => r.alert_key)));
    }
    const read = readCache.get(s.recipient)!;
    const alerts = alertsFor(projects || [], s.recipient, now.date).filter((a) => !read.has(a.key));
    if (alerts.length === 0) continue;
    const payload: Payload =
      alerts.length === 1
        ? { title: alerts[0].title, body: `${alerts[0].message} · ${alerts[0].project}`, tag: alerts[0].key }
        : {
            title: `${alerts.length} task reminders today`,
            body: alerts.slice(0, 4).map((a) => `• ${a.title} — ${a.message}`).join("\n") + (alerts.length > 4 ? `\n+${alerts.length - 4} more` : ""),
            tag: `daily:${now.date}`,
          };
    if (await send(s, payload)) sent++;
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: Json = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  try {
    switch (body.action) {
      case "vapid":
        return json({ publicKey: await vapid() });
      case "subscribe": {
        const sub = body.subscription;
        const recipient = key(body.recipient);
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !recipient) return json({ error: "bad subscription" }, 400);
        if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000 || recipient.length > 120) return json({ error: "bad subscription" }, 400);
        const tz = typeof body.tz === "string" && body.tz.length < 64 ? body.tz : "UTC";
        const { error } = await db.from("push_subscriptions").upsert(
          { endpoint: sub.endpoint, recipient, p256dh: sub.keys.p256dh, auth: sub.keys.auth, tz, user_agent: String(body.userAgent || "").slice(0, 300), updated_at: new Date().toISOString() },
          { onConflict: "endpoint" },
        );
        return error ? json({ error: error.message }, 500) : json({ ok: true });
      }
      case "unsubscribe": {
        if (!body.endpoint) return json({ error: "endpoint required" }, 400);
        await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
        return json({ ok: true });
      }
      case "test": {
        const { data } = await db.from("push_subscriptions").select("*").eq("endpoint", body.endpoint || "").maybeSingle();
        if (!data) return json({ error: "not subscribed" }, 404);
        const ok = await send(data as Sub, { title: "Notifications are on", body: "You'll get task updates here, even when the app is closed.", tag: "push-test" });
        return json({ ok });
      }
      case "event":
        return json(await handleEvent(String(body.id || "")));
      case "daily":
        return json(await handleDaily());
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
