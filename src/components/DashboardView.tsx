import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Diamond,
  FileDown,
  Hourglass,
  MoreHorizontal,
  Presentation,
  UserX,
  X,
} from "lucide-react";
import { Project, Task } from "../types";
import { localToday } from "../lib/notifications";
import { sameName } from "../lib/identity";
import { checkDoneGate } from "../lib/checklist";
import { shouldSpawnOnMove, spawnNextOccurrence } from "../lib/recurrence";
import {
  CAT_LABEL,
  CAT_ORDER,
  PERIODS,
  PeriodKey,
  Row,
  StatusCat,
  UNASSIGNED,
  addDays,
  assigneeOf,
  buildRows,
  comingUp,
  diffDays,
  estimateAccuracy,
  fmtDay,
  fmtLongDay,
  isDoneColumn,
  loadMatrix,
  moduleStats,
  peopleStats,
  periodInfo,
  portfolio,
  progressSeries,
  summarize,
  weekStart,
  weeklyOutput,
  weeksForPeriod,
} from "../lib/dashboard";
import { ChartCard, LoadHeatmap, MeterList, ProgressChart, SegmentedBar, StatTile, TableData, WeekColumns } from "./dashboard/charts";

interface DashboardViewProps {
  projects: Project[]; // spaces this person can open (archived ones excluded)
  activeProject: Project;
  me: string | null;
  onUpdateProject: (project: Project) => void;
  onOpenTask: (projectId: string, task: Task) => void;
}

type Mode = "report" | "plan";
type Scope = "space" | "all";
type QueueTab = "overdue" | "week" | "blocked" | "unassigned" | "progress";

const usePersisted = <T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] => {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      return s && allowed.includes(s) ? s : initial;
    } catch {
      return initial;
    }
  });
  return [
    v,
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, nv);
      } catch {
        /* ignore */
      }
    },
  ];
};

const CAT_COLOR: Record<StatusCat, { color: string; ink: string }> = {
  done: { color: "var(--viz-done)", ink: "#ffffff" },
  progress: { color: "var(--viz-progress)", ink: "#ffffff" },
  blocked: { color: "var(--viz-blocked)", ink: "#ffffff" },
  todo: { color: "var(--viz-todo)", ink: "var(--viz-todo-ink)" },
};

const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

const SEG =
  "px-2.5 py-1 rounded-md text-xs font-bold transition-colors whitespace-nowrap";
const segCls = (on: boolean) =>
  `${SEG} ${on ? "bg-white dark:bg-[#1E222B] text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`;
const SELECT =
  "bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[11rem]";

export default function DashboardView({ projects, activeProject, me, onUpdateProject, onOpenTask }: DashboardViewProps) {
  const [mode, setMode] = usePersisted<Mode>("dash_mode", "report", ["report", "plan"]);
  const [period, setPeriod] = usePersisted<PeriodKey>("dash_period", "30d", ["7d", "30d", "90d", "all"]);
  const [scope, setScope] = usePersisted<Scope>("dash_scope", "space", ["space", "all"]);
  const [person, setPerson] = useState<string>("");
  const [queueTab, setQueueTab] = useState<QueueTab>("overdue");
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [printQueued, setPrintQueued] = useState(false);

  // "Today" follows the clock (the tab may stay open overnight).
  const [today, setToday] = useState(() => localToday());
  useEffect(() => {
    const tick = () => setToday(localToday());
    const id = window.setInterval(tick, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const multi = projects.length > 1;
  const effScope: Scope = multi ? scope : "space";
  const scoped = useMemo(
    () => (effScope === "all" ? projects : projects.filter((p) => p.id === activeProject.id).concat(projects.some((p) => p.id === activeProject.id) ? [] : [activeProject])),
    [effScope, projects, activeProject]
  );
  const scopeName = effScope === "all" ? "All spaces" : activeProject.name;

  const allRows = useMemo(() => buildRows(scoped, today), [scoped, today]);
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    allRows.forEach((r) => seen.set(assigneeOf(r.task).toLowerCase(), assigneeOf(r.task)));
    return [...seen.values()].sort((a, b) => Number(a === UNASSIGNED) - Number(b === UNASSIGNED) || a.localeCompare(b));
  }, [allRows]);
  const rows = useMemo(() => (person ? allRows.filter((r) => sameName(assigneeOf(r.task), person)) : allRows), [allRows, person]);

  const S = useMemo(() => summarize(rows, today, period), [rows, today, period]);
  const progress = useMemo(() => progressSeries(rows, today), [rows, today]);
  const weeks = useMemo(() => weeklyOutput(rows, today, weeksForPeriod(rows, today, period)), [rows, today, period]);
  const pInfo = periodInfo(period);
  const horizon = period === "7d" ? 7 : period === "30d" ? 14 : 30;
  const upcoming = useMemo(() => comingUp(rows, today, horizon), [rows, today, horizon]);
  const pstats = useMemo(() => peopleStats(rows, today), [rows, today]);
  const mods = useMemo(() => (effScope === "space" ? moduleStats(activeProject, rows) : []), [effScope, activeProject, rows]);
  const load = useMemo(() => loadMatrix(rows, today, 6), [rows, today]);
  const accuracy = useMemo(() => estimateAccuracy(rows), [rows]);
  const spaces = useMemo(() => (effScope === "all" ? portfolio(scoped, today, person || null) : []), [effScope, scoped, today, person]);

  // ---- quick actions on a task (Plan view) ------------------------------------
  const patchTask = (row: Row, patch: Partial<Task>, extra: Task[] = []) => {
    const project = projects.find((p) => p.id === row.project.id) || row.project;
    onUpdateProject({
      ...project,
      tasks: project.tasks.map((t) => (t.id === row.task.id ? { ...t, ...patch } : t)).concat(extra),
    });
  };
  const reschedule = (row: Row, to: string) => {
    const length = row.start && row.due && row.start <= row.due ? diffDays(row.start, row.due) : 0;
    patchTask(row, { dueDate: to, startDate: row.start ? addDays(to, -length) : row.task.startDate });
  };
  const markDone = (row: Row, when: "today" | "due") => {
    const doneCol = row.project.columns.find((c) => isDoneColumn(c));
    if (!doneCol) return setNotice(`“${row.project.name}” has no Done column to move this task to.`);
    const reason = checkDoneGate(row.task, doneCol);
    if (reason) return setNotice(reason);
    const day = when === "due" && row.due && row.due <= today ? row.due : today;
    const spawned =
      shouldSpawnOnMove(row.task, row.task.status, doneCol, row.project.columns) &&
      spawnNextOccurrence({ ...row.task, status: doneCol.id }, row.project.columns);
    patchTask(row, { status: doneCol.id, completedAt: day }, spawned ? [spawned] : []);
  };

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-row-menu]")) setMenuFor(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuFor]);

  // ---- present / PDF --------------------------------------------------------------
  const restoreRef = useRef<(() => void) | null>(null);
  const endPrint = () => {
    restoreRef.current?.();
    restoreRef.current = null;
  };
  const startPrint = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    const title = document.title;
    html.classList.remove("dark"); // print on white
    document.body.classList.add("dash-printing");
    document.title = `${scopeName} – status report ${today}`;
    restoreRef.current = () => {
      if (wasDark) html.classList.add("dark");
      document.body.classList.remove("dash-printing");
      document.title = title;
      window.removeEventListener("afterprint", endPrint);
    };
    window.addEventListener("afterprint", endPrint);
    // The page is restored on "afterprint" (or when leaving the presentation),
    // never on a timer: on phones print() returns before the PDF is made.
    window.setTimeout(() => window.print(), 250);
  };
  useEffect(() => {
    if (presenting && printQueued) {
      setPrintQueued(false);
      startPrint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, printQueued]);
  const exitPresent = () => {
    endPrint();
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && exitPresent();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);
  useEffect(() => () => endPrint(), []);

  // ---- small pieces -----------------------------------------------------------------
  const HealthIcon = S.health.level === "ok" ? CheckCircle2 : S.health.level === "risk" ? AlertTriangle : S.health.level === "off" ? AlertOctagon : CircleDashed;
  const healthColor =
    S.health.level === "ok" ? "var(--viz-good)" : S.health.level === "risk" ? "var(--viz-warning)" : S.health.level === "off" ? "var(--viz-critical)" : "var(--viz-muted)";

  const dueChip = (r: Row): { text: string; tone: "late" | "soon" | "plain" } => {
    if (!r.due) return { text: "No date", tone: "plain" };
    const d = diffDays(today, r.due);
    if (d < 0) return { text: `${-d}d late`, tone: "late" };
    if (d === 0) return { text: "Today", tone: "soon" };
    if (d === 1) return { text: "Tomorrow", tone: "soon" };
    return { text: fmtDay(r.due), tone: "plain" };
  };
  const chipCls = (tone: "late" | "soon" | "plain") =>
    tone === "late"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25"
      : tone === "soon"
      ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25"
      : "bg-slate-100 dark:bg-[#1C2027] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#2A303B]";

  const taskLine = (r: Row, chip?: { text: string; tone: "late" | "soon" | "plain" }, extra?: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onOpenTask(r.project.id, r.task)}
      className="w-full flex items-center gap-2.5 py-1.5 text-left group min-w-0"
      title="Open task"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLOR[r.cat].color }} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
          {r.task.isMilestone && <Diamond className="inline w-3 h-3 mr-1 -mt-0.5" style={{ color: "var(--viz-accent)" }} />}
          {r.task.title}
        </span>
        <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
          {assigneeOf(r.task)}
          {effScope === "all" ? ` · ${r.project.name}` : ""}
          {extra}
        </span>
      </span>
      {chip && <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-bold ${chipCls(chip.tone)}`}>{chip.text}</span>}
    </button>
  );

  const listCard = ({
    title,
    subtitle,
    items,
    render,
    empty,
    limit = 6,
  }: {
    title: string;
    subtitle?: string;
    items: Row[];
    render: (r: Row) => React.ReactNode;
    empty: string;
    limit?: number;
  }) => (
    <ChartCard title={title} subtitle={subtitle}>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 py-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#1A1E26] -my-1">
          {items.slice(0, limit).map((r, i) => (
            // Index in the key: task ids are not guaranteed unique within a space.
            <li key={`${r.project.id}:${r.task.id}:${i}`}>{render(r)}</li>
          ))}
        </ul>
      )}
      {items.length > limit && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">+ {items.length - limit} more</p>}
    </ChartCard>
  );

  // ---- tables behind the charts --------------------------------------------------------
  const progressTable: TableData = useMemo(() => {
    const out: (string | number)[][] = [];
    progress.points.forEach((p, i) => {
      if (new Date(p.date + "T00:00:00Z").getUTCDay() === 6 || i === progress.points.length - 1) {
        out.push([`Week to ${fmtDay(p.date)}`, p.planned, p.actual === null ? "–" : p.actual]);
      }
    });
    return { head: ["Week", "Planned by then", "Done"], rows: out };
  }, [progress]);
  const weekTable: TableData = { head: ["Week of", "Tasks finished", "Hours logged"], rows: weeks.map((w) => [fmtDay(w.start), w.completed, w.hours]) };

  // ---- REPORT ------------------------------------------------------------------------------
  const report = () => {
    const f = progress.forecast;
    const oldest = S.overdue[0];
    const attention = [...S.overdue, ...S.blocked.filter((r) => !(r.due && r.due < today))];
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="col-span-2 lg:col-span-1 grid">
            <StatTile hero label="Overall progress" value={`${S.pct}%`} meter={S.pct} sub={`${S.done} of ${plural(S.total, "task")} done`} />
          </div>
          <StatTile
            label={`Finished · ${pInfo.label.toLowerCase()}`}
            value={S.completedInPeriod.length}
            delta={S.completedPrev === null ? null : S.completedInPeriod.length - S.completedPrev}
            deltaLabel={pInfo.days ? `vs the ${pInfo.days} days before` : undefined}
            sub={S.completedPrev === null ? "tasks finished in total" : undefined}
          />
          <StatTile
            label={`Hours logged · ${pInfo.label.toLowerCase()}`}
            value={hrs(S.hoursInPeriod)}
            delta={S.hoursPrev === null ? null : Math.round((S.hoursInPeriod - S.hoursPrev) * 10) / 10}
            deltaLabel={pInfo.days ? `vs the ${pInfo.days} days before` : undefined}
            sub={S.hoursPrev === null ? `of ${hrs(S.hoursEstimated)} estimated` : undefined}
          />
          <StatTile
            label="Overdue now"
            value={S.overdue.length}
            sub={oldest ? `Oldest is ${plural(diffDays(oldest.due!, today), "day")} late` : "Nothing is late"}
          />
          {S.nextMilestone ? (
            <StatTile
              label="Next milestone"
              value={<span className="text-base leading-tight block truncate">{S.nextMilestone.task.title}</span>}
              sub={`${fmtDay(S.nextMilestone.due!)} · in ${plural(diffDays(today, S.nextMilestone.due!), "day")}`}
            />
          ) : (
            <StatTile label="Due in the next 7 days" value={S.dueThisWeek.length} sub={S.dueThisWeek[0] ? `Next: ${S.dueThisWeek[0].task.title}` : "Nothing due this week"} />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <ChartCard
            className="lg:col-span-7"
            title="Progress against the plan"
            subtitle={`Tasks finished, against the number due by each date · whole plan${person ? ` · ${person}` : ""}`}
            table={progressTable}
          >
            <ProgressChart series={progress} today={today} />
            <div className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 space-y-0.5">
              {progress.total > 0 && (
                <p data-testid="forecast-note">
                  {!f
                    ? "Every planned task is done."
                    : !f.finish
                    ? `${plural(f.remaining, "task")} left. Nothing was finished in the last 4 weeks, so there is no pace to project.`
                    : `At the recent pace (${f.perWeek} tasks a week), the ${f.remaining} remaining ${f.remaining === 1 ? "task finishes" : "tasks finish"} around ${fmtDay(f.finish, true)}${
                        f.weeksLate === null || f.weeksLate === 0
                          ? ", in line with the planned end"
                          : f.weeksLate > 0
                          ? ` — ${plural(f.weeksLate, "week")} after the planned end (${fmtDay(f.planEnd, true)})`
                          : ` — ${plural(-f.weeksLate, "week")} before the planned end (${fmtDay(f.planEnd, true)})`
                      }.`}
                </p>
              )}
              {S.estimatedDates > 0 && (
                <p className="text-slate-500 dark:text-slate-400">
                  {plural(S.estimatedDates, "finished task")} {S.estimatedDates === 1 ? "has" : "have"} no recorded finish date and {S.estimatedDates === 1 ? "is" : "are"} counted on{" "}
                  {S.estimatedDates === 1 ? "its" : "their"} due date.
                </p>
              )}
              {progress.undated > 0 && <p className="text-slate-500 dark:text-slate-400">{plural(progress.undated, "task")} without a due date {progress.undated === 1 ? "is" : "are"} left out.</p>}
            </div>
          </ChartCard>

          <ChartCard className="lg:col-span-5" title="Weekly output" subtitle={`Last ${weeks.length} weeks · weeks start on Sunday`} table={weekTable}>
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">Tasks finished</div>
            <WeekColumns weeks={weeks} pick={(w) => w.completed} format={(v) => String(v)} unit="Tasks finished" />
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mt-3 mb-0.5">Hours logged</div>
            <WeekColumns weeks={weeks} pick={(w) => w.hours} format={hrs} unit="Hours logged" />
          </ChartCard>
        </div>

        {effScope === "all" && (
          <ChartCard title="Spaces" subtitle="One row per space · health is worked out from due dates">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[520px]">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#1E222B]">
                    <th className="py-1.5 pr-3 font-semibold">Space</th>
                    <th className="py-1.5 pr-3 font-semibold">Health</th>
                    <th className="py-1.5 pr-3 font-semibold w-[32%]">Progress</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Overdue</th>
                    <th className="py-1.5 font-semibold text-right">Next due</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((sp) => (
                    <tr key={sp.project.id} className="border-b border-slate-100 dark:border-[#1A1E26] last:border-0">
                      <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {sp.project.icon || "📂"} {sp.project.name}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        <HealthDot level={sp.health.level} /> {sp.health.label}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--viz-accent-soft)" }}>
                            <div className="h-full rounded-full" style={{ width: `${sp.pct}%`, background: "var(--viz-accent)" }} />
                          </div>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {sp.done}/{sp.total}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{sp.overdue}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{sp.nextDue ? fmtDay(sp.nextDue) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {listCard({
            title: "Finished",
            subtitle: pInfo.label,
            items: S.completedInPeriod,
            empty: "Nothing finished in this period.",
            render: (r) => taskLine(r, { text: fmtDay(r.doneDate!), tone: "plain" }),
          })}
          {listCard({
            title: "Coming up",
            subtitle: `Due in the next ${horizon} days`,
            items: upcoming,
            empty: "Nothing due in this window.",
            render: (r) => taskLine(r, dueChip(r)),
          })}
          {listCard({
            title: "Needs attention",
            subtitle: "Late or blocked, oldest first",
            items: attention,
            empty: "Nothing is late or blocked.",
            render: (r) =>
              taskLine(
                r,
                r.due && r.due < today ? dueChip(r) : { text: "Blocked", tone: "soon" },
                r.waitingOn.length ? ` · waiting on ${r.waitingOn[0]}` : ""
              ),
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <ChartCard className="lg:col-span-5" title="Where the work stands" subtitle={`${plural(S.total, "task")} by state`}>
            <SegmentedBar
              parts={CAT_ORDER.map((c) => ({
                key: c,
                label: CAT_LABEL[c],
                value: S.byCat[c],
                color: CAT_COLOR[c].color,
                ink: CAT_COLOR[c].ink,
                detail: [...new Set(rows.filter((r) => r.cat === c && r.col).map((r) => r.col!.title))].join(", "),
              }))}
            />
            {mods.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#1A1E26]">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">By module</div>
                <MeterList rows={mods.map((m) => ({ key: m.id, label: m.name, value: m.done, max: m.total, figure: `${m.done}/${m.total}` }))} />
              </div>
            )}
          </ChartCard>
          <ChartCard className="lg:col-span-7" title="By person" subtitle="Tasks finished out of those assigned · hours logged">
            <MeterList
              rows={pstats.map((p) => ({
                key: p.name,
                label: p.name,
                value: p.done,
                max: p.total,
                note: p.overdue ? `${p.overdue} overdue` : p.open ? `${p.open} open` : "all done",
                figure: (
                  <>
                    <b className="text-slate-900 dark:text-white">
                      {p.done}/{p.total}
                    </b>{" "}
                    · {hrs(p.hoursLogged)}
                  </>
                ),
              }))}
              empty="No tasks yet."
            />
          </ChartCard>
        </div>
      </div>
    );
  };

  // ---- PLAN ---------------------------------------------------------------------------------
  const queues: Record<QueueTab, { label: string; rows: Row[]; empty: string }> = {
    overdue: { label: "Overdue", rows: S.overdue, empty: "Nothing is overdue." },
    week: { label: "Due this week", rows: S.dueThisWeek, empty: "Nothing due in the next 7 days." },
    blocked: { label: "Blocked", rows: S.blocked, empty: "Nothing is blocked or waiting." },
    unassigned: { label: "Unassigned", rows: S.unassigned, empty: "Every open task has an owner." },
    progress: { label: "In progress", rows: S.inProgress, empty: "Nothing is in progress." },
  };
  const plan = () => {
    const q = queues[queueTab];
    const shown = showAllQueue ? q.rows : q.rows.slice(0, 8);
    const maxLeft = Math.max(1, ...pstats.map((p) => p.hoursRemaining));
    const f = progress.forecast;
    const nextMon = addDays(weekStart(today), 8); // Monday of next week
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(
            [
              ["overdue", "Overdue", <AlertTriangle key="i" className="w-3.5 h-3.5" />, S.overdue[0] ? `oldest ${diffDays(S.overdue[0].due!, today)}d late` : "all on time"],
              ["week", "Due this week", <CalendarClock key="i" className="w-3.5 h-3.5" />, "today + 6 days"],
              ["blocked", "Blocked", <AlertOctagon key="i" className="w-3.5 h-3.5" />, "blocked or waiting"],
              ["unassigned", "Unassigned", <UserX key="i" className="w-3.5 h-3.5" />, "open, no owner"],
              ["progress", "In progress", <Hourglass key="i" className="w-3.5 h-3.5" />, S.inProgress[0]?.start ? `longest ${Math.max(0, diffDays(S.inProgress[0].start, today))}d` : "started work"],
            ] as [QueueTab, string, React.ReactNode, string][]
          ).map(([key, label, icon, sub]) => (
            <StatTile
              key={key}
              label={label}
              icon={icon}
              value={queues[key].rows.length}
              sub={sub}
              active={queueTab === key}
              onClick={() => {
                setQueueTab(key);
                setShowAllQueue(false);
              }}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          <ChartCard
            className="lg:col-span-7"
            title={`${q.label} · ${q.rows.length}`}
            subtitle={queueTab === "progress" ? "Longest-running first · open ⋯ to reschedule, finish or assign" : "Oldest first · open ⋯ to reschedule, finish or assign"}
          >
            {notice && (
              <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {q.rows.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">{q.empty}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-[#1A1E26] -my-1">
                {shown.map((r, i) => {
                  const id = `${r.project.id}:${r.task.id}:${i}`;
                  const chip =
                    queueTab === "progress" && r.start
                      ? { text: `${Math.max(0, diffDays(r.start, today))}d running`, tone: "plain" as const }
                      : dueChip(r);
                  return (
                    <li key={id} className="flex items-center gap-1" data-testid="queue-row">
                      <div className="min-w-0 flex-1">
                        {taskLine(r, chip, r.waitingOn.length ? ` · waiting on ${r.waitingOn[0]}` : r.col ? ` · ${r.col.title}` : "")}
                      </div>
                      <div className="relative shrink-0 no-print" data-row-menu>
                        <button
                          type="button"
                          aria-label="Task actions"
                          onClick={() => setMenuFor(menuFor === id ? null : id)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuFor === id && (
                          <div className="absolute right-0 top-8 z-20 w-52 rounded-lg border border-slate-200 dark:border-[#2A303B] bg-white dark:bg-[#1C1F26] shadow-2xl py-1 text-xs text-slate-700 dark:text-slate-200">
                            <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Move due date to</div>
                            {(
                              [
                                ["Today", today],
                                ["Tomorrow", addDays(today, 1)],
                                [`Next Monday (${fmtDay(nextMon)})`, nextMon],
                                ["A week from today", addDays(today, 7)],
                              ] as [string, string][]
                            ).map(([label, to]) => (
                              <button key={label} type="button" className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#262B35]" onClick={() => { reschedule(r, to); setMenuFor(null); }}>
                                {label}
                              </button>
                            ))}
                            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100 dark:border-[#2A303B] mt-1">Mark as done</div>
                            <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#262B35]" onClick={() => { markDone(r, "today"); setMenuFor(null); }}>
                              Finished today
                            </button>
                            {r.due && r.due < today && (
                              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#262B35]" onClick={() => { markDone(r, "due"); setMenuFor(null); }}>
                                Finished on its due date ({fmtDay(r.due)})
                              </button>
                            )}
                            {me && !sameName(assigneeOf(r.task), me) && (
                              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#262B35] border-t border-slate-100 dark:border-[#2A303B] mt-1" onClick={() => { patchTask(r, { assignee: me }); setMenuFor(null); }}>
                                Assign to me
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {q.rows.length > 8 && (
              <button type="button" onClick={() => setShowAllQueue((v) => !v)} className="no-print mt-2 block text-left text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                {showAllQueue ? "Show fewer" : `Show all ${q.rows.length}`}
              </button>
            )}
          </ChartCard>

          <div className="lg:col-span-5 space-y-3 min-w-0">
            <ChartCard title="Load by week" subtitle="Open tasks by the week they are due · darker means more">
              <LoadHeatmap matrix={load} />
            </ChartCard>
            <ChartCard title="Work left by person" subtitle="Estimated hours still to do on open tasks">
              <MeterList
                rows={pstats
                  .filter((p) => p.open > 0)
                  .map((p) => ({
                    key: p.name,
                    label: p.name,
                    value: p.hoursRemaining,
                    max: maxLeft,
                    note: `${plural(p.open, "open task")}${p.overdue ? ` · ${p.overdue} late` : ""}`,
                    figure: <b className="text-slate-900 dark:text-white">{hrs(p.hoursRemaining)}</b>,
                  }))}
                empty="No open tasks."
              />
            </ChartCard>
            <ChartCard title="Pace and estimates" subtitle="For planning what fits in a week">
              <dl className="grid grid-cols-3 gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <div>
                  <dt>Recent pace</dt>
                  <dd className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{f ? f.perWeek : "–"}</dd>
                  <dd>tasks a week (last 4 weeks)</dd>
                </div>
                <div>
                  <dt>Finish at this pace</dt>
                  <dd className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{f?.finish ? fmtDay(f.finish, true) : f ? "–" : "Done"}</dd>
                  <dd>{f ? `${plural(f.remaining, "task")} left · plan ends ${fmtDay(f.planEnd, true)}` : "nothing left"}</dd>
                </div>
                <div>
                  <dt>Actual vs estimate</dt>
                  <dd className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{accuracy.ratio === null ? "–" : `${Math.round(accuracy.ratio * 100)}%`}</dd>
                  <dd>{accuracy.ratio === null ? "no finished tasks with both" : `${hrs(accuracy.actual)} logged of ${hrs(accuracy.estimated)} estimated on ${plural(accuracy.tasks, "finished task")}`}</dd>
                </div>
              </dl>
            </ChartCard>
          </div>
        </div>
      </div>
    );
  };

  // ---- frame -----------------------------------------------------------------------------
  const healthBar = (
    <div className="viz-card flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] px-4 py-2.5" data-testid="health-bar">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-white"
        style={{ background: `color-mix(in srgb, ${healthColor} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${healthColor} 45%, transparent)` }}
      >
        <HealthIcon className="w-3.5 h-3.5" style={{ color: healthColor }} />
        {S.health.label}
      </span>
      <span className="text-xs text-slate-700 dark:text-slate-200 min-w-0">{S.health.reason}</span>
      <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">As of {fmtLongDay(today)}</span>
    </div>
  );

  const controls = (
    <div className="no-print flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
        <button type="button" id="dash-mode-report" className={segCls(mode === "report")} onClick={() => setMode("report")}>
          Report
        </button>
        <button type="button" id="dash-mode-plan" className={segCls(mode === "plan")} onClick={() => setMode("plan")}>
          Plan
        </button>
      </div>
      {multi && (
        <select aria-label="Scope" value={effScope} onChange={(e) => setScope(e.target.value as Scope)} className={SELECT}>
          <option value="space">This space</option>
          <option value="all">All spaces ({projects.length})</option>
        </select>
      )}
      {mode === "report" && (
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]" role="group" aria-label="Reporting period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" title={p.label} className={segCls(period === p.key)} onClick={() => setPeriod(p.key)}>
              {p.short}
            </button>
          ))}
        </div>
      )}
      <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} className={SELECT}>
        <option value="">Everyone</option>
        {people.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-2">
        {presenting ? (
          <>
            <button type="button" onClick={startPrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]">
              <FileDown className="w-3.5 h-3.5" /> Save as PDF
            </button>
            <button type="button" id="dash-exit-present" onClick={exitPresent} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold">
              <X className="w-3.5 h-3.5" /> Exit
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              id="dash-present"
              onClick={() => {
                setPresenting(true);
                document.documentElement.requestFullscreen?.().catch(() => {});
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]"
            >
              <Presentation className="w-3.5 h-3.5" /> Present
            </button>
            <button
              type="button"
              id="dash-pdf"
              onClick={() => {
                setPresenting(true);
                setPrintQueued(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
          </>
        )}
      </div>
    </div>
  );

  const body = (
    <>
      {controls}
      {healthBar}
      {mode === "report" ? report() : plan()}
    </>
  );

  if (presenting) {
    return createPortal(
      <div id="dash-present-layer" className="viz-root fixed inset-0 z-[45] overflow-y-auto bg-slate-50 dark:bg-[#0F1115] p-4 md:p-8">
        <div className="max-w-[1500px] mx-auto space-y-3">
          <div className="flex items-end justify-between gap-4 pb-1">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {effScope === "space" && activeProject.icon ? `${activeProject.icon} ` : ""}
                {scopeName}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {mode === "report" ? `Status report · ${pInfo.label}` : "Planning view"}
                {person ? ` · ${person}` : ""} · {fmtLongDay(today)}
              </p>
            </div>
          </div>
          {body}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div id="dashboard-view-root" className="viz-root h-full overflow-y-auto bg-slate-50 dark:bg-[#0F1115] p-3 md:p-6">
      <div className="max-w-[1500px] mx-auto space-y-3">{body}</div>
    </div>
  );
}

function HealthDot({ level }: { level: string }) {
  const Icon = level === "ok" ? CheckCircle2 : level === "risk" ? AlertTriangle : level === "off" ? AlertOctagon : CircleDashed;
  const color = level === "ok" ? "var(--viz-good)" : level === "risk" ? "var(--viz-warning)" : level === "off" ? "var(--viz-critical)" : "var(--viz-muted)";
  return <Icon className="inline w-3.5 h-3.5 -mt-0.5 mr-1" style={{ color }} />;
}
