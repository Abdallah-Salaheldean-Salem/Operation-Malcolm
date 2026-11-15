import { Project, ProjectModule, SmartGoal, Task } from "../types";

// One place that answers "which module is this task in?" so every tab agrees.
// A task belongs to its explicit moduleId if that module still exists, otherwise
// to the first module whose name matches one of the task's tags.

export const NO_MODULE = "__none__"; // filter value: tasks with no module

export function moduleOfTask(task: Task, modules: ProjectModule[] | undefined): ProjectModule | undefined {
  const mods = modules || [];
  if (mods.length === 0) return undefined;
  if (task.moduleId) {
    const m = mods.find((x) => x.id === task.moduleId);
    if (m) return m;
  }
  const tags = (task.tags || []).map((t) => t.toLowerCase());
  if (tags.length === 0) return undefined;
  return mods.find((m) => tags.includes(m.name.toLowerCase()));
}

export function moduleIdOf(task: Task, modules: ProjectModule[] | undefined): string | undefined {
  return moduleOfTask(task, modules)?.id;
}

// Global "Module" filter: "all" (or empty) = everything, NO_MODULE = tasks with
// no module, otherwise one module id.
export function matchesModule(task: Task, modules: ProjectModule[] | undefined, filter?: string): boolean {
  if (!filter || filter === "all") return true;
  const id = moduleIdOf(task, modules);
  return filter === NO_MODULE ? !id : id === filter;
}

const DONE_RE = /(done|complete|finish|closed|shipped)/i;
export function isDoneTask(task: Task, project: Project): boolean {
  const col = project.columns.find((c) => c.id === task.status);
  return DONE_RE.test(col ? col.title : task.status || "") || task.progress === 100;
}

// ---- goals -----------------------------------------------------------------------

export interface GoalStatus {
  goal: SmartGoal;
  modules: ProjectModule[];
  tasks: number;
  done: number;
  derived: number | null; // % of linked modules' tasks done (null if no linked tasks)
  progress: number; // what to show: derived when there are linked tasks, else the manual slider
  daysLeft: number | null; // to timeBound (negative = past)
  expected: number | null; // % of time elapsed between the earliest linked task start and timeBound
  state: "done" | "overdue" | "at-risk" | "on-track" | "no-date";
}

const dayMs = 86400000;
const toDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / dayMs;
};
const isISO = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function goalStatus(goal: SmartGoal, project: Project, today: string): GoalStatus {
  const mods = (project.modules || []).filter((m) => (goal.moduleIds || []).includes(m.id));
  const ids = new Set(mods.map((m) => m.id));
  const tasks = ids.size ? project.tasks.filter((t) => ids.has(moduleIdOf(t, project.modules) || "")) : [];
  const done = tasks.filter((t) => isDoneTask(t, project)).length;
  const derived = tasks.length ? Math.round((done / tasks.length) * 100) : null;
  const progress = derived ?? Math.max(0, Math.min(100, Number(goal.progress) || 0));

  let daysLeft: number | null = null;
  let expected: number | null = null;
  if (isISO(goal.timeBound)) {
    daysLeft = toDay(goal.timeBound) - toDay(today);
    const starts = tasks.map((t) => t.startDate).filter(isISO).sort();
    if (starts.length && starts[0] < goal.timeBound) {
      const span = toDay(goal.timeBound) - toDay(starts[0]);
      const gone = toDay(today) - toDay(starts[0]);
      expected = Math.round(Math.max(0, Math.min(1, gone / span)) * 100);
    }
  }

  let state: GoalStatus["state"];
  if (progress >= 100) state = "done";
  else if (daysLeft === null) state = "no-date";
  else if (daysLeft < 0) state = "overdue";
  // Behind schedule by more than 15 points, or under two weeks left and under 75% done.
  else if ((expected !== null && expected - progress > 15) || (daysLeft <= 14 && progress < 75)) state = "at-risk";
  else state = "on-track";

  return { goal, modules: mods, tasks: tasks.length, done, derived, progress, daysLeft, expected, state };
}

export const GOAL_STATE_LABEL: Record<GoalStatus["state"], string> = {
  done: "Achieved",
  overdue: "Past target date",
  "at-risk": "At risk",
  "on-track": "On track",
  "no-date": "No target date",
};

// Goals that a task contributes to (through its module).
export function goalsOfTask(task: Task, project: Project): SmartGoal[] {
  const id = moduleIdOf(task, project.modules);
  if (!id) return [];
  return (project.goals || []).filter((g) => (g.moduleIds || []).includes(id));
}
