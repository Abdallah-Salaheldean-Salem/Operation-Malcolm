import { BoardColumn, Project, Task } from "../types";
import { moduleIdOf } from "./modules";
import { isCompletionColumn } from "./recurrence";
import { isDeadlineMissed } from "./scheduling";
import { sameName } from "./identity";

// Dashboard maths. Everything here is pure (projects in, numbers out) so the
// Report and Plan views, the PDF and the tests all read the same figures.

// ---- dates (local "YYYY-MM-DD" strings) --------------------------------------

export const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toUTC = (iso: string) => Date.parse(iso + "T00:00:00Z");
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => fromUTC(toUTC(iso) + n * 86400000);
export const diffDays = (from: string, to: string): number => Math.round((toUTC(to) - toUTC(from)) / 86400000);
// Weeks start on Sunday, like the Calendar tab.
export const weekStart = (iso: string): string => addDays(iso, -new Date(toUTC(iso)).getUTCDay());
export const fmtDay = (iso: string, withYear = false): string =>
  new Date(toUTC(iso)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
export const fmtLongDay = (iso: string): string =>
  new Date(toUTC(iso)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// ---- status categories ---------------------------------------------------------
// Spaces name their columns freely; the dashboard groups them into four states.

export type StatusCat = "done" | "progress" | "blocked" | "todo";
export const CAT_ORDER: StatusCat[] = ["done", "progress", "blocked", "todo"];
export const CAT_LABEL: Record<StatusCat, string> = {
  done: "Done",
  progress: "In progress",
  blocked: "Blocked",
  todo: "Not started",
};

export const isDoneColumn = (col?: BoardColumn): boolean =>
  !!col && (isCompletionColumn(col) || /finish/i.test(col.title));

export function statusCategory(col?: BoardColumn): StatusCat {
  if (!col) return "todo";
  if (isDoneColumn(col)) return "done";
  const t = col.title.toLowerCase();
  if (/block|hold|wait|stuck/.test(t)) return "blocked";
  if (/progress|going|active|doing|review|test|wip/.test(t)) return "progress";
  return "todo";
}

// ---- completion dates ----------------------------------------------------------

// When a task moves into a "done" column it is stamped with the day it was
// finished; moving it back out clears the stamp. A task that was already done
// before this was recorded keeps no stamp (its date is unknown).
export function stampCompletion(prev: Project | undefined, next: Project, today: string): Project {
  const prevById = new Map((prev?.tasks || []).map((t) => [t.id, t]));
  const colDone = (p: Project, t: Task) => isDoneColumn(p.columns.find((c) => c.id === t.status));
  let changed = false;
  const tasks = next.tasks.map((t) => {
    const done = colDone(next, t);
    if (!done) {
      if (t.completedAt === undefined) return t;
      changed = true;
      const { completedAt: _drop, ...rest } = t;
      return rest as Task;
    }
    if (isISODate(t.completedAt)) return t;
    const before = prevById.get(t.id);
    if (before && prev && colDone(prev, before)) return t; // done already, date unknown
    changed = true;
    // A task created straight into "done" (e.g. logged work) finished on its own date.
    const day = !before && isISODate(t.dueDate) && t.dueDate <= today ? t.dueDate : today;
    return { ...t, completedAt: day };
  });
  return changed ? { ...next, tasks } : next;
}

// Best known finish date for a done task. `estimated` marks tasks finished
// before finish dates were recorded: they are counted on their due date.
export function completionDate(task: Task, today: string): { date: string; estimated: boolean } {
  if (isISODate(task.completedAt)) return { date: task.completedAt, estimated: false };
  if (isISODate(task.dueDate) && task.dueDate <= today) return { date: task.dueDate, estimated: true };
  if (isISODate(task.startDate) && task.startDate <= today) return { date: task.startDate, estimated: true };
  const created = typeof task.createdAt === "string" ? task.createdAt.slice(0, 10) : "";
  if (isISODate(created) && created <= today) return { date: created, estimated: true };
  return { date: today, estimated: true };
}

// ---- rows ----------------------------------------------------------------------

export interface Row {
  task: Task;
  project: Project;
  col?: BoardColumn;
  cat: StatusCat;
  done: boolean;
  doneDate: string | null;
  doneEstimated: boolean;
  due: string | null;
  start: string | null;
  waitingOn: string[]; // titles of unfinished predecessor tasks
}

export const UNASSIGNED = "Unassigned";
export const assigneeOf = (t: Task): string => (t.assignee && t.assignee.trim() ? t.assignee.trim() : UNASSIGNED);

export function buildRows(projects: Project[], today: string, person: string | null = null): Row[] {
  const rows: Row[] = [];
  for (const project of projects) {
    if (project.archived) continue;
    const colById = new Map(project.columns.map((c) => [c.id, c]));
    const taskById = new Map(project.tasks.map((t) => [t.id, t]));
    for (const task of project.tasks) {
      if (person && !sameName(assigneeOf(task), person)) continue;
      const col = colById.get(task.status);
      const cat = statusCategory(col);
      const done = cat === "done";
      const cd = done ? completionDate(task, today) : null;
      const waitingOn = done
        ? []
        : (task.dependencies || [])
            .map((id) => taskById.get(id))
            .filter((d): d is Task => !!d && !isDoneColumn(colById.get(d.status)))
            .map((d) => d.title);
      rows.push({
        task,
        project,
        col,
        cat,
        done,
        doneDate: cd ? cd.date : null,
        doneEstimated: cd ? cd.estimated : false,
        due: isISODate(task.dueDate) ? task.dueDate : null,
        start: isISODate(task.startDate) ? task.startDate : null,
        waitingOn,
      });
    }
  }
  return rows;
}

// ---- reporting period ----------------------------------------------------------

export type PeriodKey = "7d" | "30d" | "90d" | "all";
export const PERIODS: { key: PeriodKey; label: string; short: string; days: number | null }[] = [
  { key: "7d", label: "Last 7 days", short: "Week", days: 7 },
  { key: "30d", label: "Last 30 days", short: "Month", days: 30 },
  { key: "90d", label: "Last 90 days", short: "Quarter", days: 90 },
  { key: "all", label: "All time", short: "All", days: null },
];
export const periodInfo = (key: PeriodKey) => PERIODS.find((p) => p.key === key) || PERIODS[1];

const inRange = (d: string | null, from: string | null, to: string) => !!d && d <= to && (from === null || d >= from);
const round1 = (n: number) => Math.round(n * 10) / 10;
// The day a task's logged hours are counted on.
const workDate = (r: Row): string | null => (r.done ? r.doneDate : r.due || r.start);

// ---- headline numbers ----------------------------------------------------------

export type HealthLevel = "ok" | "risk" | "off" | "none";
export interface Health {
  level: HealthLevel;
  label: string;
  reason: string;
  late: number;
  dueSoFar: number;
}

export interface Summary {
  total: number;
  done: number;
  open: number;
  pct: number;
  byCat: Record<StatusCat, number>;
  overdue: Row[]; // open, due before today — oldest first
  dueThisWeek: Row[]; // open, due today … +6 days
  blocked: Row[]; // in a blocked column, or waiting on an unfinished task
  unassigned: Row[]; // open, nobody assigned
  inProgress: Row[]; // longest-running first
  hoursLogged: number;
  hoursEstimated: number;
  completedInPeriod: Row[]; // newest first
  completedPrev: number | null;
  hoursInPeriod: number;
  hoursPrev: number | null;
  estimatedDates: number; // done tasks counted on their due date (no recorded finish)
  health: Health;
  nextMilestone: Row | null;
  lateMilestones: Row[];
}

export function summarize(rows: Row[], today: string, period: PeriodKey): Summary {
  const days = periodInfo(period).days;
  const from = days === null ? null : addDays(today, -(days - 1));
  const prevTo = from === null ? null : addDays(from, -1);
  const prevFrom = from === null || days === null ? null : addDays(from, -days);

  const byCat: Record<StatusCat, number> = { done: 0, progress: 0, blocked: 0, todo: 0 };
  rows.forEach((r) => (byCat[r.cat] += 1));
  const open = rows.filter((r) => !r.done);

  const overdue = open.filter((r) => r.due && r.due < today).sort((a, b) => a.due!.localeCompare(b.due!));
  const dueThisWeek = open
    .filter((r) => r.due && r.due >= today && r.due <= addDays(today, 6))
    .sort((a, b) => a.due!.localeCompare(b.due!));
  // Waiting on an unfinished task only counts once this task should have started;
  // a plan where each week follows the last isn't "blocked" ahead of time.
  const blocked = open.filter(
    (r) => r.cat === "blocked" || (r.waitingOn.length > 0 && !!(r.start || r.due) && (r.start || r.due)! <= today)
  );
  const unassigned = open
    .filter((r) => assigneeOf(r.task) === UNASSIGNED)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const inProgress = open
    .filter((r) => r.cat === "progress")
    .sort((a, b) => (a.start || a.due || "9999").localeCompare(b.start || b.due || "9999"));

  const doneRows = rows.filter((r) => r.done);
  const completedInPeriod = doneRows
    .filter((r) => inRange(r.doneDate, from, today))
    .sort((a, b) => b.doneDate!.localeCompare(a.doneDate!));
  const completedPrev = prevTo === null ? null : doneRows.filter((r) => inRange(r.doneDate, prevFrom, prevTo)).length;
  const hoursIn = (f: string | null, t: string) =>
    round1(rows.filter((r) => inRange(workDate(r), f, t)).reduce((s, r) => s + (Number(r.task.actualHours) || 0), 0));

  // Schedule health, derived from the dates (never set by hand): the share of
  // tasks that should be finished by now and are not.
  const dueSoFar = rows.filter((r) => r.due && r.due < today).length;
  const late = overdue.length;
  const share = dueSoFar ? late / dueSoFar : 0;
  const milestones = rows.filter((r) => r.task.isMilestone);
  const lateMilestones = milestones.filter((r) => !r.done && r.due && r.due < today);
  const missedDeadlines = open.filter((r) => isDeadlineMissed(r.task)).length;
  let level: HealthLevel = "ok";
  if (rows.length === 0) level = "none";
  else if (share > 0.2) level = "off";
  else if (share > 0.1 || blocked.length > 0 || lateMilestones.length > 0 || missedDeadlines > 0) level = "risk";
  const pctLate = Math.round(share * 100);
  const reasons: string[] = [];
  if (late > 0) reasons.push(`${late} of ${dueSoFar} tasks due so far ${late === 1 ? "is" : "are"} late (${pctLate}%)`);
  if (lateMilestones.length) reasons.push(`${lateMilestones.length} milestone${lateMilestones.length === 1 ? "" : "s"} late`);
  if (blocked.length) reasons.push(`${blocked.length} blocked`);
  if (missedDeadlines && !late) reasons.push(`${missedDeadlines} past a hard deadline`);
  const health: Health = {
    level,
    label: level === "ok" ? "On track" : level === "risk" ? "At risk" : level === "off" ? "Off track" : "No tasks yet",
    reason:
      level === "none"
        ? "Add tasks with due dates to see schedule health."
        : reasons.length
        ? reasons.join(" · ")
        : "Nothing is overdue or blocked.",
    late,
    dueSoFar,
  };

  const nextMilestone =
    milestones.filter((r) => !r.done && r.due && r.due >= today).sort((a, b) => a.due!.localeCompare(b.due!))[0] || null;

  return {
    total: rows.length,
    done: byCat.done,
    open: open.length,
    pct: rows.length ? Math.round((byCat.done / rows.length) * 100) : 0,
    byCat,
    overdue,
    dueThisWeek,
    blocked,
    unassigned,
    inProgress,
    hoursLogged: round1(rows.reduce((s, r) => s + (Number(r.task.actualHours) || 0), 0)),
    hoursEstimated: round1(rows.reduce((s, r) => s + (Number(r.task.estimatedHours) || 0), 0)),
    completedInPeriod,
    completedPrev,
    hoursInPeriod: hoursIn(from, today),
    hoursPrev: prevTo === null ? null : hoursIn(prevFrom, prevTo),
    estimatedDates: doneRows.filter((r) => r.doneEstimated).length,
    health,
    nextMilestone,
    lateMilestones,
  };
}

export function comingUp(rows: Row[], today: string, horizonDays: number): Row[] {
  const to = addDays(today, horizonDays);
  return rows
    .filter((r) => !r.done && r.due && r.due >= today && r.due <= to)
    .sort((a, b) => a.due!.localeCompare(b.due!));
}

// ---- progress against the plan ---------------------------------------------------

export interface ProgressPoint {
  date: string;
  planned: number; // tasks due on or before this day
  actual: number | null; // tasks finished on or before this day (null after today)
}
export interface Forecast {
  perWeek: number; // finished per week over the last 4 weeks
  remaining: number;
  finish: string | null; // projected finish at that pace (null = no recent completions)
  planEnd: string; // last due date in the plan
  weeksLate: number | null; // projected finish vs plan end, in weeks (negative = early)
}
export interface ProgressSeries {
  points: ProgressPoint[];
  total: number; // tasks with a due date
  undated: number; // tasks left out because they have no due date
  doneToday: number;
  plannedToday: number;
  forecast: Forecast | null;
}

export function progressSeries(rows: Row[], today: string): ProgressSeries {
  const dated = rows.filter((r) => r.due);
  const undated = rows.length - dated.length;
  if (dated.length === 0) return { points: [], total: 0, undated, doneToday: 0, plannedToday: 0, forecast: null };

  let first = today;
  let planEnd = dated[0].due!;
  for (const r of dated) {
    const s = r.start && r.start < r.due! ? r.start : r.due!;
    if (s < first) first = s;
    if (r.doneDate && r.doneDate < first) first = r.doneDate;
    if (r.due! > planEnd) planEnd = r.due!;
  }
  first = addDays(first, -1); // start the curves at zero

  const doneRows = dated.filter((r) => r.done);
  const doneToday = doneRows.filter((r) => r.doneDate! <= today).length;
  const recent = doneRows.filter((r) => r.doneDate! > addDays(today, -28) && r.doneDate! <= today).length;
  const remaining = dated.length - doneToday;
  const perWeek = round1(recent / 4);
  let forecast: Forecast | null = null;
  if (remaining > 0) {
    const finish = recent > 0 ? addDays(today, Math.ceil(remaining / (recent / 28))) : null;
    forecast = {
      perWeek,
      remaining,
      finish,
      planEnd,
      weeksLate: finish ? Math.round(diffDays(planEnd, finish) / 7) : null,
    };
  }

  // Show the plan to its end, and the forecast if it lands within a reasonable distance.
  let last = planEnd > today ? planEnd : today;
  const span = Math.max(14, diffDays(first, last));
  if (forecast?.finish) {
    const cap = addDays(last, Math.round(span * 0.6));
    last = forecast.finish < cap ? forecast.finish : cap;
  }
  last = addDays(last, 1);

  const n = diffDays(first, last) + 1;
  const plannedAdd = new Array(n).fill(0);
  const actualAdd = new Array(n).fill(0);
  for (const r of dated) {
    plannedAdd[Math.min(n - 1, Math.max(0, diffDays(first, r.due!)))] += 1;
    if (r.done && r.doneDate! <= today) actualAdd[Math.max(0, diffDays(first, r.doneDate!))] += 1;
  }
  const points: ProgressPoint[] = [];
  let p = 0;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const date = addDays(first, i);
    p += plannedAdd[i];
    a += actualAdd[i];
    points.push({ date, planned: p, actual: date <= today ? a : null });
  }
  return {
    points,
    total: dated.length,
    undated,
    doneToday,
    plannedToday: dated.filter((r) => r.due! <= today).length,
    forecast,
  };
}

// ---- weekly output -----------------------------------------------------------------

export interface WeekBucket {
  start: string; // Sunday
  completed: number;
  hours: number;
  current: boolean;
}

export function weeklyOutput(rows: Row[], today: string, weeks: number): WeekBucket[] {
  const thisWeek = weekStart(today);
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push({ start: addDays(thisWeek, -7 * i), completed: 0, hours: 0, current: i === 0 });
  }
  const index = new Map(out.map((w, i) => [w.start, i]));
  for (const r of rows) {
    if (r.done && r.doneDate && r.doneDate <= today) {
      const i = index.get(weekStart(r.doneDate));
      if (i !== undefined) out[i].completed += 1;
    }
    const wd = workDate(r);
    const hrs = Number(r.task.actualHours) || 0;
    if (wd && wd <= today && hrs > 0) {
      const i = index.get(weekStart(wd));
      if (i !== undefined) out[i].hours += hrs;
    }
  }
  out.forEach((w) => (w.hours = round1(w.hours)));
  return out;
}

export function weeksForPeriod(rows: Row[], today: string, period: PeriodKey): number {
  if (period === "7d" || period === "30d") return 12;
  if (period === "90d") return 13;
  let first = today;
  for (const r of rows) {
    const d = r.doneDate || r.due;
    if (d && d < first) first = d;
  }
  return Math.max(12, Math.min(26, Math.ceil((diffDays(weekStart(first), today) + 1) / 7)));
}

// ---- people & modules ----------------------------------------------------------------

export interface PersonStat {
  name: string;
  total: number;
  done: number;
  open: number;
  overdue: number;
  hoursLogged: number;
  hoursRemaining: number; // estimate still to burn on open tasks
}

export function peopleStats(rows: Row[], today: string): PersonStat[] {
  const map = new Map<string, PersonStat>();
  for (const r of rows) {
    const name = assigneeOf(r.task);
    const key = name.toLowerCase();
    const s = map.get(key) || { name, total: 0, done: 0, open: 0, overdue: 0, hoursLogged: 0, hoursRemaining: 0 };
    s.total += 1;
    s.hoursLogged += Number(r.task.actualHours) || 0;
    if (r.done) s.done += 1;
    else {
      s.open += 1;
      if (r.due && r.due < today) s.overdue += 1;
      s.hoursRemaining += Math.max(0, (Number(r.task.estimatedHours) || 0) - (Number(r.task.actualHours) || 0));
    }
    map.set(key, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, hoursLogged: round1(s.hoursLogged), hoursRemaining: round1(s.hoursRemaining) }))
    .sort((a, b) => Number(a.name === UNASSIGNED) - Number(b.name === UNASSIGNED) || b.total - a.total);
}

export interface ModuleStat {
  id: string;
  name: string;
  total: number;
  done: number;
}

export function moduleStats(project: Project, rows: Row[]): ModuleStat[] {
  const mods = project.modules || [];
  if (mods.length === 0) return [];
  return mods
    .map((m) => {
      const mine = rows.filter((r) => r.project.id === project.id && moduleIdOf(r.task, mods) === m.id);
      return { id: m.id, name: m.name, total: mine.length, done: mine.filter((r) => r.done).length };
    })
    .filter((m) => m.total > 0);
}

// ---- workload by week (planning) ---------------------------------------------------

export interface LoadCell {
  count: number;
  hours: number; // estimate still to burn
  titles: string[];
}
export interface LoadMatrix {
  columns: { key: string; label: string; sub: string }[];
  rows: { name: string; cells: LoadCell[]; total: number }[];
  max: number; // largest cell count
}

export function loadMatrix(rows: Row[], today: string, weeks = 6): LoadMatrix {
  const w0 = weekStart(today);
  const columns = [{ key: "overdue", label: "Late", sub: "before today" }];
  for (let i = 0; i < weeks; i++) {
    const s = addDays(w0, 7 * i);
    columns.push({ key: s, label: i === 0 ? "This wk" : i === 1 ? "Next wk" : fmtDay(s), sub: `${fmtDay(s)} – ${fmtDay(addDays(s, 6))}` });
  }
  const open = rows.filter((r) => !r.done && r.due);
  const lastDay = addDays(w0, 7 * weeks - 1);
  const names = new Map<string, string>();
  open.forEach((r) => names.set(assigneeOf(r.task).toLowerCase(), assigneeOf(r.task)));
  let max = 0;
  const out = [...names.entries()].map(([key, name]) => {
    const cells: LoadCell[] = columns.map(() => ({ count: 0, hours: 0, titles: [] }));
    for (const r of open) {
      if (assigneeOf(r.task).toLowerCase() !== key) continue;
      let ci: number;
      if (r.due! < today) ci = 0;
      else if (r.due! > lastDay) continue;
      else ci = 1 + Math.floor(diffDays(w0, r.due!) / 7);
      const c = cells[ci];
      c.count += 1;
      c.hours += Math.max(0, (Number(r.task.estimatedHours) || 0) - (Number(r.task.actualHours) || 0));
      c.titles.push(r.task.title);
    }
    cells.forEach((c) => {
      c.hours = round1(c.hours);
      if (c.count > max) max = c.count;
    });
    return { name, cells, total: cells.reduce((s, c) => s + c.count, 0) };
  });
  out.sort((a, b) => Number(a.name === UNASSIGNED) - Number(b.name === UNASSIGNED) || b.total - a.total);
  return { columns, rows: out.filter((r) => r.total > 0), max };
}

// ---- estimates ---------------------------------------------------------------------

// How finished work compared with its estimate (only tasks that have both).
export function estimateAccuracy(rows: Row[]): { tasks: number; estimated: number; actual: number; ratio: number | null } {
  const both = rows.filter((r) => r.done && (Number(r.task.estimatedHours) || 0) > 0 && (Number(r.task.actualHours) || 0) > 0);
  const estimated = round1(both.reduce((s, r) => s + Number(r.task.estimatedHours), 0));
  const actual = round1(both.reduce((s, r) => s + Number(r.task.actualHours), 0));
  return { tasks: both.length, estimated, actual, ratio: estimated > 0 ? actual / estimated : null };
}

// ---- portfolio (all spaces) -----------------------------------------------------------

export interface SpaceStat {
  project: Project;
  total: number;
  done: number;
  pct: number;
  overdue: number;
  health: Health;
  nextDue: string | null;
}

export function portfolio(projects: Project[], today: string, person: string | null): SpaceStat[] {
  return projects
    .filter((p) => !p.archived)
    .map((project) => {
      const rows = buildRows([project], today, person);
      const s = summarize(rows, today, "all");
      const next = rows.filter((r) => !r.done && r.due && r.due >= today).sort((a, b) => a.due!.localeCompare(b.due!))[0];
      return { project, total: s.total, done: s.done, pct: s.pct, overdue: s.overdue.length, health: s.health, nextDue: next?.due || null };
    });
}
