import { Project, Task, TaskBaseline } from "../types";
import { isDoneTask } from "./modules";

// Baseline = a frozen copy of each task's planned start/due, saved on the task
// itself (task.baseline) so it syncs with the rest of the space. Variance compares
// today's plan (or, for finished tasks, the actual finish day) with that copy.

const dayMs = 86400000;
const isISO = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const toDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / dayMs;
};
export const daysBetween = (a: string, b: string) => toDay(b) - toDay(a);

// A finished task is frozen at its actual finish, so a fresh baseline always
// starts at zero variance (the same rule MS Project uses).
export function snapshotOf(task: Task, setAt: string, project?: Project): TaskBaseline | null {
  const start = isISO(task.startDate) ? task.startDate : isISO(task.dueDate) ? task.dueDate : "";
  let due = isISO(task.dueDate) ? task.dueDate : start;
  if (project && isISO(task.completedAt) && isDoneTask(task, project)) due = task.completedAt;
  if (!start && !due) return null; // nothing planned yet: nothing to freeze
  return { start: start && start <= (due || start) ? start : due, due: due || start, setAt };
}

// mode "all" re-baselines every dated task; "missing" only freezes tasks that have
// no baseline yet (tasks added since the last baseline).
export function applyBaseline(project: Project, today: string, mode: "all" | "missing"): { project: Project; count: number } {
  let count = 0;
  const tasks = project.tasks.map((t) => {
    if (mode === "missing" && t.baseline) return t;
    const snap = snapshotOf(t, today, project);
    if (!snap) return t;
    count++;
    return { ...t, baseline: snap };
  });
  return { project: { ...project, tasks }, count };
}

export function clearBaseline(project: Project): Project {
  return {
    ...project,
    tasks: project.tasks.map((t) => {
      if (!t.baseline) return t;
      const { baseline: _drop, ...rest } = t;
      return rest as Task;
    }),
  };
}

export interface Variance {
  startSlip: number; // + = starts later than baselined
  finishSlip: number; // + = finishes later than baselined
  finish: string; // the finish compared: actual (done), or forecast (open)
  actual: boolean; // finish is an actual finish date
}

// Finish compared: the actual finish day for a finished task, otherwise the
// task's current planned finish. (Overdue-but-open tasks are flagged as late by
// the Dashboard; here we measure how far the plan itself has moved.)
export function variance(task: Task, project: Project, today: string): Variance | null {
  const b = task.baseline;
  if (!b || !isISO(b.due)) return null;
  const done = isDoneTask(task, project);
  const due = isISO(task.dueDate) ? task.dueDate : isISO(task.startDate) ? task.startDate : b.due;
  let finish: string;
  let actual = false;
  if (done && isISO(task.completedAt)) {
    finish = task.completedAt;
    actual = true;
  } else if (done) {
    finish = due;
  } else {
    finish = due;
  }
  const start = isISO(task.startDate) ? task.startDate : due;
  return {
    startSlip: isISO(b.start) ? daysBetween(b.start, start) : 0,
    finishSlip: daysBetween(b.due, finish),
    finish,
    actual,
  };
}

export interface BaselineSummary {
  setAt: string | null; // latest baseline date
  baselined: number;
  unbaselined: number; // dated tasks added since (no baseline)
  late: number;
  early: number;
  onPlan: number;
  avgSlip: number; // average finish slip across baselined tasks (days, 1dp)
  worst: { task: Task; slip: number } | null;
  // Project finish: latest baselined due vs latest current finish of the same tasks
  baselineFinish: string | null;
  currentFinish: string | null;
  finishSlip: number;
}

export function baselineSummary(project: Project, today: string): BaselineSummary | null {
  const withB = project.tasks.filter((t) => t.baseline && isISO(t.baseline.due));
  if (withB.length === 0) return null;
  let late = 0;
  let early = 0;
  let onPlan = 0;
  let sum = 0;
  let worst: BaselineSummary["worst"] = null;
  let baselineFinish: string | null = null;
  let currentFinish: string | null = null;
  let setAt: string | null = null;
  for (const t of withB) {
    const v = variance(t, project, today)!;
    if (v.finishSlip > 0) late++;
    else if (v.finishSlip < 0) early++;
    else onPlan++;
    sum += v.finishSlip;
    if (v.finishSlip > 0 && (!worst || v.finishSlip > worst.slip)) worst = { task: t, slip: v.finishSlip };
    if (!baselineFinish || t.baseline!.due > baselineFinish) baselineFinish = t.baseline!.due;
    if (!currentFinish || v.finish > currentFinish) currentFinish = v.finish;
    if (isISO(t.baseline!.setAt) && (!setAt || t.baseline!.setAt > setAt)) setAt = t.baseline!.setAt;
  }
  const unbaselined = project.tasks.filter((t) => !t.baseline && (isISO(t.dueDate) || isISO(t.startDate))).length;
  return {
    setAt,
    baselined: withB.length,
    unbaselined,
    late,
    early,
    onPlan,
    avgSlip: Math.round((sum / withB.length) * 10) / 10,
    worst,
    baselineFinish,
    currentFinish,
    finishSlip: baselineFinish && currentFinish ? daysBetween(baselineFinish, currentFinish) : 0,
  };
}

export const fmtSlip = (n: number) => (n === 0 ? "on plan" : `${n > 0 ? "+" : "−"}${Math.abs(n)}d`);
