import { Task, ConstraintType } from "../types";

export const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  none: "As soon as possible",
  "start-no-earlier-than": "Start no earlier than",
  "start-no-later-than": "Start no later than",
  "must-start-on": "Must start on",
  "finish-no-later-than": "Finish no later than",
  "must-finish-on": "Must finish on",
};

// The finish date used for deadline/constraint checks (dueDate is the finish).
type Sched = Pick<Task, "startDate" | "dueDate" | "deadline" | "constraintType" | "constraintDate">;

// A deadline is missed when the task's finish (dueDate) falls after it.
// ISO YYYY-MM-DD strings compare correctly lexicographically.
export function isDeadlineMissed(task: Sched): boolean {
  if (!task.deadline || !task.dueDate) return false;
  return task.dueDate > task.deadline;
}

// Returns a human-readable warning when the current dates violate the
// constraint, or null when the constraint is satisfied / not set.
export function constraintWarning(task: Sched): string | null {
  const type = task.constraintType;
  const d = task.constraintDate;
  if (!type || type === "none" || !d) return null;
  const s = task.startDate;
  const f = task.dueDate;
  switch (type) {
    case "start-no-earlier-than":
      if (s && s < d) return `Starts ${s}, before its “no earlier than” date ${d}.`;
      break;
    case "start-no-later-than":
      if (s && s > d) return `Starts ${s}, after its “no later than” date ${d}.`;
      break;
    case "must-start-on":
      if (s && s !== d) return `Should start on ${d}, but starts ${s}.`;
      break;
    case "finish-no-later-than":
      if (f && f > d) return `Finishes ${f}, after its “no later than” date ${d}.`;
      break;
    case "must-finish-on":
      if (f && f !== d) return `Should finish on ${d}, but finishes ${f}.`;
      break;
  }
  return null;
}
