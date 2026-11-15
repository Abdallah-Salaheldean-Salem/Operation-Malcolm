import { Task } from "../types";

// Next free "TASK-n" id in a space: one past the highest existing number.
// (Daily Logs used to pick a random number from 100–999, which repeated once a
// space had a hundred-odd tasks and left two tasks sharing one id.)
export function nextTaskId(tasks: Pick<Task, "id">[]): string {
  let max = 99;
  for (const t of tasks) {
    const m = /^TASK-(\d+)$/.exec(t.id || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TASK-${max + 1}`;
}
