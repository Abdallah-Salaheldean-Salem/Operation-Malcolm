import { Project, Task } from "../types";
import { DailyLog } from "./dailyLogs";
import { localToday } from "./notifications";

// Task timers: a running timer is stored on the task as
// timers[memberKey] = ISO start time, so it survives closing the app and can
// be stopped from another device. Each member runs at most one timer; stopping
// adds the time to the task's logged hours and produces a Daily Logs entry.

export interface RunningTimer {
  projectId: string;
  projectName: string;
  task: Task;
  startedAt: string;
}

export interface TimerResult {
  projects: Project[];
  logs: DailyLog[];
  stopped: { taskId: string; title: string; hours: number }[];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// Hours to 2 decimals (≈ to the minute); under a minute counts as 0.
export const hoursFromMs = (ms: number): number => (ms < 60000 ? 0 : Math.round(ms / 36000) / 100);

export const formatHours = (h: number): string => {
  const mins = Math.round(h * 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : `${mins}m`;
};

const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

export function myRunningTimers(projects: Project[], myKey: string | null): RunningTimer[] {
  if (!myKey) return [];
  const out: RunningTimer[] = [];
  for (const p of projects) {
    for (const t of p.tasks) {
      const startedAt = t.timers?.[myKey];
      if (startedAt) out.push({ projectId: p.id, projectName: p.name, task: t, startedAt });
    }
  }
  return out;
}

export function stopTimersFor(projects: Project[], myKey: string, me: string, now: number): TimerResult {
  const logs: DailyLog[] = [];
  const stopped: TimerResult["stopped"] = [];
  const next = projects.map((p) => {
    let changed = false;
    const tasks = p.tasks.map((t) => {
      const startedAt = t.timers?.[myKey];
      if (!startedAt) return t;
      changed = true;
      const { [myKey]: _done, ...rest } = t.timers || {};
      const start = new Date(startedAt);
      const hours = Number.isFinite(start.getTime()) ? hoursFromMs(now - start.getTime()) : 0;
      stopped.push({ taskId: t.id, title: t.title, hours });
      if (hours > 0) {
        logs.push({
          id: `log-${now}-${t.id}`,
          date: localToday(start),
          taskId: t.id,
          taskTitle: t.title,
          description: `⏱ Timer ${clock(start)} – ${clock(new Date(now))}`,
          status: t.status,
          time: clock(start),
          assignee: me,
          hours,
        });
      }
      return {
        ...t,
        timers: Object.keys(rest).length ? rest : undefined,
        actualHours: Math.round(((t.actualHours || 0) + hours) * 100) / 100,
      };
    });
    return changed ? { ...p, tasks } : p;
  });
  return { projects: next, logs, stopped };
}

// Start timing a task (stopping and logging any other timer this member has running).
export function startTimerFor(
  projects: Project[],
  projectId: string,
  taskId: string,
  myKey: string,
  me: string,
  now: number
): TimerResult {
  const res = stopTimersFor(projects, myKey, me, now);
  res.projects = res.projects.map((p) =>
    p.id !== projectId
      ? p
      : {
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, timers: { ...(t.timers || {}), [myKey]: new Date(now).toISOString() } } : t
          ),
        }
  );
  return res;
}
