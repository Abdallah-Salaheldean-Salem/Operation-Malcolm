import { Project, Task } from "../types";
import { isCompletionColumn } from "./recurrence";
import { sameName } from "./identity";

// ---- Watching ("Notify me") -------------------------------------------------
// A member watches a task if they ticked "Notify me" (watchers), or if the task
// is assigned to them and they haven't unticked it (muted).

type WatchFields = Pick<Task, "assignee" | "watchers" | "muted">;

export function isWatching(task: WatchFields, me: string | null | undefined): boolean {
  if (!me) return false;
  if ((task.watchers || []).some((w) => sameName(w, me))) return true;
  return sameName(task.assignee, me) && !(task.muted || []).some((w) => sameName(w, me));
}

// New watchers/muted lists after `me` explicitly turns "Notify me" on or off.
export function setWatching(task: WatchFields, me: string, on: boolean): { watchers: string[]; muted: string[] } {
  const watchers = (task.watchers || []).filter((w) => !sameName(w, me));
  const muted = (task.muted || []).filter((w) => !sameName(w, me));
  if (on) watchers.push(me);
  else if (sameName(task.assignee, me)) muted.push(me);
  return { watchers, muted };
}

// Everyone currently watching a task (explicit watchers + un-muted assignee).
export function watcherNames(task: WatchFields): string[] {
  const names = [...(task.watchers || [])];
  const a = task.assignee;
  if (a && a !== "Unassigned" && !(task.muted || []).some((m) => sameName(m, a)) && !names.some((n) => sameName(n, a))) {
    names.push(a);
  }
  return names;
}

// ---- Date alerts for watched tasks -------------------------------------------

export const DUE_SOON_DAYS = 2;

export type AlertKind =
  | "overdue" | "due-today" | "due-soon" | "deadline-passed" | "deadline-soon" | "starts-today" // date reminders
  | "assigned" | "completed" | "comment" | "due-changed"; // change events from teammates
export type AlertSeverity = "danger" | "warn" | "info" | "event";

export interface TaskAlert {
  key: string; // stable per (kind, task, date) — used for read/popped state
  kind: AlertKind;
  severity: AlertSeverity;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  message: string;
  date: string;
  source?: "date" | "event"; // event = shared notification from the database
  eventId?: string;
  createdAt?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localToday = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

const SEVERITY_RANK: Record<AlertSeverity, number> = { danger: 0, warn: 1, info: 2, event: 3 };

export function computeAlerts(
  projects: Project[],
  me: string | null | undefined,
  today: string,
  canSee: (p: Project) => boolean
): TaskAlert[] {
  if (!me) return [];
  const out: TaskAlert[] = [];
  for (const p of projects) {
    if (p.archived || !canSee(p)) continue;
    for (const t of p.tasks) {
      if (!isWatching(t, me)) continue;
      const col = p.columns.find((c) => c.id === t.status);
      if (isCompletionColumn(col)) continue; // finished work never alerts
      const push = (kind: AlertKind, date: string, message: string, severity: AlertSeverity) =>
        out.push({ key: `${kind}:${p.id}:${t.id}:${date}`, kind, severity, projectId: p.id, projectName: p.name, taskId: t.id, taskTitle: t.title, message, date, source: "date" });

      if (isDate(t.dueDate)) {
        const d = dayDiff(today, t.dueDate);
        const what = t.isMilestone ? "Milestone" : "Due";
        if (d < 0) push("overdue", t.dueDate, `Overdue by ${days(-d)} (was due ${fmt(t.dueDate)})`, "danger");
        else if (d === 0) push("due-today", t.dueDate, `${what} today`, "warn");
        else if (d <= DUE_SOON_DAYS) push("due-soon", t.dueDate, `${what} ${d === 1 ? "tomorrow" : `in ${days(d)}`} (${fmt(t.dueDate)})`, "warn");
      }
      if (isDate(t.deadline) && t.deadline !== t.dueDate) {
        const d = dayDiff(today, t.deadline);
        if (d < 0) push("deadline-passed", t.deadline, `Deadline passed ${days(-d)} ago (${fmt(t.deadline)})`, "danger");
        else if (d <= DUE_SOON_DAYS) push("deadline-soon", t.deadline, `Deadline ${d === 0 ? "is today" : d === 1 ? "tomorrow" : `in ${days(d)}`} (${fmt(t.deadline)})`, "warn");
      }
      if (isDate(t.startDate) && t.startDate === today && t.startDate !== t.dueDate) {
        push("starts-today", t.startDate, "Starts today", "info");
      }
    }
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.date.localeCompare(b.date));
}

// ---- Per-device read / popped state ------------------------------------------

export const READ_KEY = "workspace_notif_read_v1";
export const POPPED_KEY = "workspace_notif_popped_v1";
const MAX_KEYS = 600;

export function loadKeySet(storageKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveKeySet(storageKey: string, set: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set].slice(-MAX_KEYS)));
  } catch {
    /* ignore */
  }
}

// ---- System (OS) pop-ups -----------------------------------------------------

export const popupsSupported = () => typeof window !== "undefined" && "Notification" in window;

export async function showSystemNotification(title: string, body: string, tag: string): Promise<void> {
  if (!popupsSupported() || Notification.permission !== "granted") return;
  const options = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/" } };
  try {
    // Android/installed PWAs require notifications to go through the service worker.
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch (err) {
    console.warn("Notification failed", err);
  }
}
