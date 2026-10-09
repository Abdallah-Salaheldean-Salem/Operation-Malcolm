import { Project, Task } from "../types";
import { isCompletionColumn } from "./recurrence";
import { nameKey, sameName } from "./identity";
import { watcherNames } from "./notifications";

// ---- Change events (Phase 2) -------------------------------------------------
// When this device pushes an edited space, compare it with the last synced copy
// and address a notification to each affected member (never to the actor).

export type EventKind = "assigned" | "completed" | "comment" | "due-changed";

export interface NewNotification {
  recipient: string; // nameKey() of the member
  project_id: string;
  task_id: string | null;
  task_title: string;
  kind: EventKind;
  message: string;
  actor: string | null;
  dedupe_key: string;
}

// Collapse a burst of assignments (e.g. an import) into one notice per person.
const ASSIGN_BURST = 3;

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function diffTaskEvents(
  before: Project | undefined,
  after: Project,
  actor: string | null,
  today: string
): NewNotification[] {
  if (!before) return []; // brand-new or imported spaces don't notify
  const who = actor || "Someone";
  const prevById = new Map(before.tasks.map((t) => [t.id, t]));
  const colOf = (p: Project, t: Task) => p.columns.find((c) => c.id === t.status);
  const out: NewNotification[] = [];
  const assigned = new Map<string, { name: string; tasks: Task[] }>();

  const add = (name: string | undefined, t: Task | null, kind: EventKind, message: string, detail: string, title?: string) => {
    if (!name || name === "Unassigned" || sameName(name, actor)) return;
    const recipient = nameKey(name);
    out.push({
      recipient,
      project_id: after.id,
      task_id: t ? t.id : null,
      task_title: title ?? (t ? t.title : ""),
      kind,
      message,
      actor,
      dedupe_key: `${kind}:${after.id}:${t ? t.id : "-"}:${detail}:${recipient}`,
    });
  };

  for (const t of after.tasks) {
    const prev = prevById.get(t.id);

    if (t.assignee && t.assignee !== "Unassigned" && (!prev || !sameName(prev.assignee, t.assignee))) {
      const k = nameKey(t.assignee);
      const entry = assigned.get(k) || { name: t.assignee, tasks: [] };
      entry.tasks.push(t);
      assigned.set(k, entry);
    }
    if (!prev) continue;

    const watchers = watcherNames(t);

    if (!isCompletionColumn(colOf(before, prev)) && isCompletionColumn(colOf(after, t))) {
      watchers.forEach((w) => add(w, t, "completed", `${who} marked this task as done`, today));
    }

    const oldComments = new Set((prev.comments || []).map((c) => c.id));
    for (const c of t.comments || []) {
      if (oldComments.has(c.id)) continue;
      watchers
        .filter((w) => !sameName(w, c.author))
        .forEach((w) => add(w, t, "comment", `${c.author || who} commented: “${clip(c.text, 90)}”`, c.id));
    }

    if (isDate(prev.dueDate) && isDate(t.dueDate) && prev.dueDate !== t.dueDate) {
      watchers
        .filter((w) => !(t.assignee && sameName(w, t.assignee) && !sameName(prev.assignee, t.assignee))) // just-assigned already told
        .forEach((w) => add(w, t, "due-changed", `${who} moved the due date to ${fmt(t.dueDate)}`, t.dueDate));
    }
  }

  for (const { name, tasks } of assigned.values()) {
    if (tasks.length > ASSIGN_BURST) {
      add(name, tasks[0], "assigned", `${who} assigned you ${tasks.length} tasks`, `${today}:batch:${tasks.length}`, `${tasks.length} new tasks`);
    } else {
      tasks.forEach((t) => add(name, t, "assigned", `${who} assigned this task to you`, today));
    }
  }
  return out;
}
