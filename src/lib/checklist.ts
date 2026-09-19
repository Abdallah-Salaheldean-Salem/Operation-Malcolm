import { Task, BoardColumn } from "../types";

// True when a task has at least one subtask and every subtask is completed.
export function isChecklistComplete(task: Pick<Task, "subtasks">): boolean {
  const subs = task.subtasks || [];
  return subs.length > 0 && subs.every((s) => s.completed);
}

// Definition-of-Done gate. Returns null when a task is allowed to enter the
// target column, or a human-readable reason when the move should be blocked.
export function checkDoneGate(
  task: Pick<Task, "subtasks">,
  targetColumn: BoardColumn | undefined
): string | null {
  if (!targetColumn?.requireChecklist) return null;
  const subs = task.subtasks || [];
  if (subs.length === 0) {
    return `“${targetColumn.title}” needs a completed checklist first. Add checklist items and tick them all off.`;
  }
  const remaining = subs.filter((s) => !s.completed).length;
  if (remaining > 0) {
    return `“${targetColumn.title}” requires all ${subs.length} checklist item${
      subs.length === 1 ? "" : "s"
    } done — ${remaining} still open.`;
  }
  return null;
}
