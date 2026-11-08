import { fetchAppState, saveAppState } from "./supabase-sync";

// One entry in the shared Daily Logs feed (app_state key "daily_logs").
export interface DailyLog {
  id: string;
  date: string;
  taskId: string;
  taskTitle: string;
  description: string;
  status: string;
  time: string;
  assignee: string;
  hours: number;
}

export const LOGS_STORAGE_KEY = "clickup_daily_logs";
export const LOGS_APPEND_EVENT = "daily-logs:append";

// Add a log from outside the Daily Logs view (e.g. when a timer stops). If the
// view is open it takes the entry and saves it through its normal sync;
// otherwise the entry is written to this device and to the shared feed.
export function appendDailyLog(log: DailyLog): void {
  const ev = new CustomEvent<DailyLog>(LOGS_APPEND_EVENT, { detail: log, cancelable: true });
  if (!window.dispatchEvent(ev)) return; // handled by a mounted Daily Logs view

  try {
    const local = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || "[]");
    if (Array.isArray(local) && !local.some((l: DailyLog) => l.id === log.id)) {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify([log, ...local]));
    }
  } catch {
    /* ignore */
  }
  fetchAppState("daily_logs").then((res) => {
    if (!res.ok) return;
    const remote = Array.isArray(res.value) ? (res.value as DailyLog[]) : [];
    if (remote.some((l) => l.id === log.id)) return;
    saveAppState("daily_logs", [log, ...remote]);
  });
}
