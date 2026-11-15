import { Project, SubTask } from "../types";
import { DailyLog } from "./dailyLogs";
import { sameName } from "./identity";
import { Health, Row, addDays, assigneeOf, buildRows, fmtDay, isISODate, summarize, weekStart } from "./dashboard";

// Weekly report: what happened in one Sunday–Saturday week. Pure, so the
// Dashboard, the PDF, the Excel file and the text summary all agree.

export interface ItemDone {
  row: Row; // the task the item belongs to
  item: SubTask;
  kind: "Checklist" | "Subtask";
}

export interface PersonHours {
  name: string;
  hours: number;
  entries: number;
}

export interface WeeklyReport {
  start: string; // Sunday
  end: string; // Saturday
  current: boolean; // the week containing today
  asOf: string; // the day the figures are as of (end of week, or today)
  finished: Row[]; // tasks finished in the week, by finish date
  itemsDone: ItemDone[]; // checklist items / subtasks ticked in the week
  dueInWeek: Row[]; // tasks due in the week (any state)
  dueDone: number; // of those, finished
  slipped: Row[]; // due in the week (before as-of), not finished
  stillDue: Row[]; // current week only: due from today to Saturday, open
  nextWeek: Row[]; // open, due in the following week
  carriedOver: number; // open tasks due before the week started
  hours: number; // logged in the week (Daily Logs)
  hoursByPerson: PersonHours[];
  logEntries: number;
  prevFinished: number;
  prevHours: number;
  health: Health; // today (the project's state now, not a historical snapshot)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function weekBounds(anyDay: string): { start: string; end: string } {
  const start = weekStart(anyDay);
  return { start, end: addDays(start, 6) };
}

export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const y = end.slice(0, 4);
  return sameMonth
    ? `${fmtDay(start)} – ${Number(end.slice(8, 10))}, ${y}`
    : `${fmtDay(start)} – ${fmtDay(end)}, ${y}`;
}

function logsIn(logs: DailyLog[], rows: Row[], from: string, to: string, person: string | null) {
  // Only logs for tasks in the spaces being reported on.
  const ids = new Set(rows.map((r) => `${r.task.id}`));
  return logs.filter(
    (l) =>
      isISODate(l.date) &&
      l.date >= from &&
      l.date <= to &&
      ids.has(l.taskId) &&
      (!person || sameName(l.assignee || "", person))
  );
}

export function weeklyReport(
  projects: Project[],
  logs: DailyLog[],
  anyDayInWeek: string,
  today: string,
  person: string | null = null
): WeeklyReport {
  const { start, end } = weekBounds(anyDayInWeek);
  const current = today >= start && today <= end;
  const asOf = current ? today : end < today ? end : start;
  const rows = buildRows(projects, today, person);
  const inWeek = (d: string | null | undefined) => !!d && d >= start && d <= end && d <= today;

  const finished = rows.filter((r) => r.done && inWeek(r.doneDate)).sort((a, b) => a.doneDate!.localeCompare(b.doneDate!));

  const itemsDone: ItemDone[] = [];
  for (const row of rows) {
    for (const [kind, items] of [
      ["Checklist", row.task.checklist],
      ["Subtask", row.task.subtasks],
    ] as const) {
      for (const item of items || []) {
        if (item.completed && isISODate(item.completedAt) && inWeek(item.completedAt)) itemsDone.push({ row, item, kind });
      }
    }
  }
  itemsDone.sort((a, b) => a.item.completedAt!.localeCompare(b.item.completedAt!));

  const dueInWeek = rows.filter((r) => r.due && r.due >= start && r.due <= end).sort((a, b) => a.due!.localeCompare(b.due!));
  const slipped = dueInWeek.filter((r) => !r.done && r.due! < (current ? today : addDays(end, 1)));
  const stillDue = current ? dueInWeek.filter((r) => !r.done && r.due! >= today) : [];
  const nextStart = addDays(start, 7);
  const nextWeek = rows
    .filter((r) => !r.done && r.due && r.due >= nextStart && r.due <= addDays(nextStart, 6))
    .sort((a, b) => a.due!.localeCompare(b.due!));
  const carriedOver = rows.filter((r) => !r.done && r.due && r.due < start).length;

  const weekLogs = logsIn(logs, rows, start, end < today ? end : today, person);
  const byPerson = new Map<string, PersonHours>();
  for (const l of weekLogs) {
    const name = (l.assignee || "").trim() || "Unassigned";
    const key = name.toLowerCase();
    const p = byPerson.get(key) || { name, hours: 0, entries: 0 };
    p.hours += Number(l.hours) || 0;
    p.entries += 1;
    byPerson.set(key, p);
  }
  const hoursByPerson = [...byPerson.values()]
    .map((p) => ({ ...p, hours: round1(p.hours) }))
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);
  const prevFinished = rows.filter((r) => r.done && r.doneDate && r.doneDate >= prevStart && r.doneDate <= prevEnd).length;
  const prevHours = round1(logsIn(logs, rows, prevStart, prevEnd, person).reduce((s, l) => s + (Number(l.hours) || 0), 0));

  return {
    start,
    end,
    current,
    asOf,
    finished,
    itemsDone,
    dueInWeek,
    dueDone: dueInWeek.filter((r) => r.done).length,
    slipped,
    stillDue,
    nextWeek,
    carriedOver,
    hours: round1(weekLogs.reduce((s, l) => s + (Number(l.hours) || 0), 0)),
    hoursByPerson,
    logEntries: weekLogs.length,
    prevFinished,
    prevHours,
    health: summarize(rows, today, "all").health,
  };
}

// ---- plain-text summary (email / WhatsApp / Teams) --------------------------------

const hrs = (n: number) => `${round1(n)}h`;

export function weeklyText(r: WeeklyReport, title: string, notes: string, multiSpace: boolean): string {
  const L: string[] = [];
  const where = (row: Row) => (multiSpace ? ` [${row.project.name}]` : "");
  const who = (row: Row) => (assigneeOf(row.task) === "Unassigned" ? "" : ` — ${assigneeOf(row.task)}`);
  L.push(`Weekly report — ${title}`);
  L.push(`Week of ${weekLabel(r.start)}${r.current ? ` (so far, as of ${fmtDay(r.asOf)})` : ""}`);
  L.push("");
  L.push(`Status today: ${r.health.label} — ${r.health.reason}`);
  L.push(
    `• Finished: ${r.finished.length} task${r.finished.length === 1 ? "" : "s"} (previous week ${r.prevFinished})` +
      (r.itemsDone.length ? ` · ${r.itemsDone.length} checklist item${r.itemsDone.length === 1 ? "" : "s"} ticked` : "")
  );
  L.push(
    `• Hours logged: ${hrs(r.hours)} (previous week ${hrs(r.prevHours)})` +
      (r.hoursByPerson.length > 1 ? ` — ${r.hoursByPerson.map((p) => `${p.name} ${hrs(p.hours)}`).join(", ")}` : "")
  );
  if (r.dueInWeek.length) {
    L.push(`• Due this week: ${r.dueInWeek.length} — ${r.dueDone} done${r.slipped.length ? `, ${r.slipped.length} slipped` : ""}${r.stillDue.length ? `, ${r.stillDue.length} still to come` : ""}`);
  }
  if (r.carriedOver) L.push(`• Still overdue from earlier weeks: ${r.carriedOver}`);
  if (notes.trim()) {
    L.push("");
    L.push("Notes");
    notes.trim().split(/\r?\n/).forEach((line) => L.push(line.trim() ? line : ""));
  }
  if (r.finished.length) {
    L.push("");
    L.push("Done");
    r.finished.forEach((row) => L.push(`- ${row.task.title}${who(row)} (${fmtDay(row.doneDate!)})${where(row)}`));
  }
  const looseItems = r.itemsDone.filter((i) => !r.finished.includes(i.row));
  if (looseItems.length) {
    L.push("");
    L.push("Progress on open tasks");
    const byTask = new Map<Row, ItemDone[]>();
    looseItems.forEach((i) => byTask.set(i.row, [...(byTask.get(i.row) || []), i]));
    byTask.forEach((items, row) => {
      L.push(`- ${row.task.title}${where(row)}: ${items.map((i) => i.item.title).join("; ")}`);
    });
  }
  if (r.slipped.length) {
    L.push("");
    L.push("Slipped (due this week, not done)");
    r.slipped.forEach((row) => L.push(`- ${row.task.title}${who(row)} (was due ${fmtDay(row.due!)})${where(row)}`));
  }
  if (r.nextWeek.length) {
    L.push("");
    L.push(`Next week (${weekLabel(addDays(r.start, 7))})`);
    r.nextWeek.forEach((row) => L.push(`- ${row.task.title}${who(row)} (${fmtDay(row.due!)})${where(row)}`));
  }
  return L.join("\n");
}
