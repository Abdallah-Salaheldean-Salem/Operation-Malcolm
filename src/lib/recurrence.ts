import { Task, BoardColumn, RecurrenceFrequency } from "../types";

// Advance an ISO date (YYYY-MM-DD) by `interval` periods of `frequency`.
export function advanceDate(date: string, frequency: RecurrenceFrequency, interval: number): string {
  if (!date) return date;
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  const n = Math.max(1, Math.floor(interval || 1));
  if (frequency === "daily") d.setDate(d.getDate() + n);
  else if (frequency === "weekly") d.setDate(d.getDate() + n * 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

// A column counts as "completion" when its title reads like a done state.
export function isCompletionColumn(col?: BoardColumn): boolean {
  if (!col) return false;
  return /\b(done|complete|completed|shipped|closed)\b/i.test(col.title);
}

// Produce the next occurrence of a recurring task: a fresh task placed back in
// the first column, dates advanced, checklist reset, progress/log cleared.
// Returns null when the task has no recurrence rule.
export function spawnNextOccurrence(task: Task, columns: BoardColumn[]): Task | null {
  const rec = task.recurrence;
  if (!rec) return null;
  const firstCol = columns[0]?.id || task.status;
  const adv = (dt?: string) => (dt ? advanceDate(dt, rec.frequency, rec.interval) : dt || "");
  const now = Date.now();
  return {
    ...task,
    id: `task-${now}-${Math.floor(Math.random() * 1000)}`,
    status: firstCol,
    progress: 0,
    actualHours: 0,
    subtasks: (task.subtasks || []).map((s, i) => ({
      id: `sub-${now}-${i}`,
      title: s.title,
      completed: false,
    })),
    checklist: (task.checklist || []).map((s, i) => ({
      id: `chk-${now}-${i}`,
      title: s.title,
      completed: false,
    })),
    comments: [],
    startDate: adv(task.startDate),
    dueDate: adv(task.dueDate),
    deadline: task.deadline ? adv(task.deadline) : task.deadline,
    constraintDate: task.constraintDate ? adv(task.constraintDate) : task.constraintDate,
    createdAt: new Date().toISOString().split("T")[0],
  };
}

// True when a move from `fromStatus` into `toCol` should spawn the next
// occurrence (task recurs, is entering completion, and wasn't already there).
export function shouldSpawnOnMove(
  task: Task,
  fromStatus: string,
  toCol: BoardColumn | undefined,
  columns: BoardColumn[]
): boolean {
  if (!task.recurrence) return false;
  if (!isCompletionColumn(toCol)) return false;
  const fromCol = columns.find((c) => c.id === fromStatus);
  return !isCompletionColumn(fromCol);
}
