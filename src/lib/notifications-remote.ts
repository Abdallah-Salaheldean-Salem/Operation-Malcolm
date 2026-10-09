import { supabase, isSupabaseConfigured } from "./supabase";
import { NewNotification, EventKind } from "./notificationEvents";

// Shared notifications (Phase 2) — see supabase-schema.sql for the tables.

export interface RemoteNotification {
  id: string;
  recipient: string;
  project_id: string;
  task_id: string | null;
  task_title: string;
  kind: EventKind;
  message: string;
  actor: string | null;
  read_at: string | null;
  created_at: string;
}

const COLUMNS = "id,recipient,project_id,task_id,task_title,kind,message,actor,read_at,created_at";
const KEEP_DAYS = 30;

export async function fetchNotifications(recipient: string): Promise<RemoteNotification[] | null> {
  if (!isSupabaseConfigured) return null;
  const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .eq("recipient", recipient)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.warn("Supabase notifications fetch failed", error);
    return null;
  }
  return data as RemoteNotification[];
}

export async function insertNotifications(rows: NewNotification[]): Promise<void> {
  if (!isSupabaseConfigured || rows.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) console.warn("Supabase notifications insert failed", error);
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured || ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) console.warn("Supabase notifications mark-read failed", error);
}

// Read state for date reminders, shared across a member's devices.
export async function fetchAlertReads(recipient: string): Promise<string[] | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("notification_reads")
    .select("alert_key")
    .eq("recipient", recipient)
    .limit(1000);
  if (error) {
    console.warn("Supabase notification_reads fetch failed", error);
    return null;
  }
  return (data || []).map((r: { alert_key: string }) => r.alert_key);
}

export async function saveAlertReads(recipient: string, keys: string[]): Promise<void> {
  if (!isSupabaseConfigured || keys.length === 0) return;
  const { error } = await supabase
    .from("notification_reads")
    .upsert(keys.map((alert_key) => ({ recipient, alert_key })), { onConflict: "recipient,alert_key", ignoreDuplicates: true });
  if (error) console.warn("Supabase notification_reads save failed", error);
}

// Live inserts/updates for one recipient. Returns an unsubscribe function.
export function subscribeNotifications(
  recipient: string,
  onChange: (row: RemoteNotification) => void
): () => void {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel(`notifications-${recipient}-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
      const row = payload.new as RemoteNotification | undefined;
      if (row && row.id && row.recipient === recipient) onChange(row);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
