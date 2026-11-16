import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertOctagon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  FileSpreadsheet,
  Share2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Diamond,
  FileDown,
  Hourglass,
  MoreHorizontal,
  Presentation,
  Sparkles,
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
import { DailyLog, LOGS_STORAGE_KEY, LOGS_APPEND_EVENT } from "../lib/dailyLogs";
import { fetchAppState } from "../lib/supabase-sync";
import { weekBounds, weekLabel, weeklyReport, weeklyText } from "../lib/weekly";
import { GOAL_STATE_LABEL, goalStatus } from "../lib/modules";
import { baselineSummary, fmtSlip, variance } from "../lib/baseline";
import { buildInfographicData, buildInfographicHtml, infographicFileName, INFO_SECTIONS, InfoSection } from "../lib/infographic";

// Sections left out of the infographic, remembered per device. Stored as the
// excluded ones, so any section added later is included by default.
const INFO_EXCLUDED_KEY = "infographic_excluded_v1";
const loadExcluded = (): InfoSection[] => {
  try {
    const v = JSON.parse(localStorage.getItem(INFO_EXCLUDED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((k) => INFO_SECTIONS.some((s) => s.key === k)) : [];
  } catch {
    return [];
  }
};
import { ChartCard, LoadHeatmap, MeterList, ProgressChart, SegmentedBar, StatTile, TableData, WeekColumns } from "./dashboard/charts";

interface DashboardViewProps {
  projects: Project[]; // spaces this person can open (archived ones excluded)
  activeProject: Project;
  me: string | null;
  onUpdateProject: (project: Project) => void;
  onOpenTask: (projectId: string, task: Task) => void;
}

type Mode = "report" | "plan" | "weekly";
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
  const [mode, setMode] = usePersisted<Mode>("dash_mode", "report", ["report", "plan", "weekly"]);
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

  // ---- weekly report state ----------------------------------------------------------
  // The week shown: on Sundays (start of the week) the week just ended, otherwise this week.
  const defaultWeek = () => {
    const t = localToday();
    return new Date(t + "T00:00:00Z").getUTCDay() === 0 ? addDays(t, -7) : t;
  };
  const [weekAnchor, setWeekAnchor] = useState<string>(defaultWeek);
  // Deep link from the weekly push: /?view=dashboard&dash=weekly
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("dash") === "weekly") {
      setMode("weekly");
      if (q.get("week") === "last") setWeekAnchor(addDays(localToday(), -7));
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [logs, setLogs] = useState<DailyLog[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let alive = true;
    fetchAppState("daily_logs").then((res) => {
      if (alive && res.ok && Array.isArray(res.value)) setLogs(res.value as DailyLog[]);
    });
    const onAppend = (e: Event) => {
      const log = (e as CustomEvent<DailyLog>).detail;
      setLogs((prev) => (prev.some((l) => l.id === log.id) ? prev : [log, ...prev]));
    };
    window.addEventListener(LOGS_APPEND_EVENT, onAppend);
    return () => {
      alive = false;
      window.removeEventListener(LOGS_APPEND_EVENT, onAppend);
    };
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);
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
  const goals = useMemo(
    () => (effScope === "space" ? (activeProject.goals || []).map((g) => goalStatus(g, activeProject, today)) : []),
    [effScope, activeProject, today]
  );
  // Baseline variance for the tasks shown (respects the person filter).
  const bsum = useMemo(
    () => (effScope === "space" ? baselineSummary({ ...activeProject, tasks: rows.map((r) => r.task) }, today) : null),
    [effScope, activeProject, rows, today]
  );
  const slipped = useMemo(
    () =>
      bsum
        ? rows
            .filter((r) => !r.done && r.task.baseline)
            .map((r) => ({ r, v: variance(r.task, r.project, today)! }))
            .filter((x) => x.v && x.v.finishSlip > 0)
            .sort((a, b) => b.v.finishSlip - a.v.finishSlip)
        : [],
    [bsum, rows, today]
  );
  const load = useMemo(() => loadMatrix(rows, today, 6), [rows, today]);
  const accuracy = useMemo(() => estimateAccuracy(rows), [rows]);
  const spaces = useMemo(() => (effScope === "all" ? portfolio(scoped, today, person || null) : []), [effScope, scoped, today, person]);

  const W = useMemo(() => weeklyReport(scoped, logs, weekAnchor, today, person || null), [scoped, logs, weekAnchor, today, person]);
  const notesKey = `weekly_notes:${effScope === "all" ? "all" : activeProject.id}:${person || "everyone"}:${W.start}`;
  const [notes, setNotesState] = useState("");
  useEffect(() => {
    try {
      setNotesState(localStorage.getItem(notesKey) || "");
    } catch {
      setNotesState("");
    }
  }, [notesKey]);
  const setNotes = (v: string) => {
    setNotesState(v);
    try {
      if (v.trim()) localStorage.setItem(notesKey, v);
      else localStorage.removeItem(notesKey);
    } catch {
      /* ignore */
    }
  };
  const reportTitle = `${scopeName}${person ? ` — ${person}` : ""}`;
  const summaryText = () => weeklyText(W, reportTitle, notes, effScope === "all");
  const copySummary = async () => {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      setToast("Summary copied — paste it into an email or chat.");
    } catch {
      // Clipboard blocked (e.g. not https): fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setToast(ok ? "Summary copied — paste it into an email or chat." : "Couldn't copy on this device.");
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareSummary = async () => {
    try {
      await navigator.share({ title: `Weekly report — ${reportTitle}`, text: summaryText() });
    } catch {
      /* cancelled */
    }
  };
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const exportWeekXlsx = async () => {
    if (exportingXlsx) return;
    setExportingXlsx(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const sheet = (name: string, rows: Record<string, string | number>[], widths: number[]) => {
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Nothing this week" }]);
        ws["!cols"] = widths.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      const space = (r: Row) => (effScope === "all" ? { Space: r.project.name } : {});
      sheet(
        "Summary",
        [
          { Item: "Report", Value: reportTitle },
          { Item: "Week", Value: `${W.start} to ${W.end}${W.current ? " (so far)" : ""}` },
          { Item: "Status today", Value: `${W.health.label} — ${W.health.reason}` },
          { Item: "Tasks finished", Value: W.finished.length },
          { Item: "Tasks finished (previous week)", Value: W.prevFinished },
          { Item: "Checklist items ticked", Value: W.itemsDone.length },
          { Item: "Hours logged", Value: W.hours },
          { Item: "Hours logged (previous week)", Value: W.prevHours },
          { Item: "Due this week", Value: W.dueInWeek.length },
          { Item: "Due this week — done", Value: W.dueDone },
          { Item: "Slipped", Value: W.slipped.length },
          { Item: "Still overdue from earlier weeks", Value: W.carriedOver },
          ...(notes.trim() ? [{ Item: "Notes", Value: notes.trim() }] : []),
        ],
        [32, 80]
      );
      sheet(
        "Done",
        W.finished.map((r) => ({ Task: r.task.title, ...space(r), Assignee: assigneeOf(r.task), Finished: r.doneDate || "", Due: r.due || "", "Hours logged": Number(r.task.actualHours) || 0 })),
        [44, 14, 12, 12, 12]
      );
      sheet(
        "Checklist",
        W.itemsDone.map((i) => ({ Task: i.row.task.title, ...space(i.row), List: i.kind, Item: i.item.title, "Done date": i.item.completedAt || "" })),
        [40, 10, 50, 12]
      );
      sheet(
        "Slipped",
        W.slipped.map((r) => ({ Task: r.task.title, ...space(r), Assignee: assigneeOf(r.task), Due: r.due || "", Status: r.col?.title || "" })),
        [44, 14, 12, 14]
      );
      sheet(
        "Next week",
        W.nextWeek.map((r) => ({ Task: r.task.title, ...space(r), Assignee: assigneeOf(r.task), Due: r.due || "", Status: r.col?.title || "" })),
        [44, 14, 12, 14]
      );
      const taskTitle = new Map(scoped.flatMap((p) => p.tasks.map((t) => [t.id, t.title] as const)));
      const weekLogs = logs
        .filter((l) => l.date >= W.start && l.date <= W.end && taskTitle.has(l.taskId) && (!person || sameName(l.assignee || "", person)))
        .sort((a, b) => a.date.localeCompare(b.date));
      sheet(
        "Hours",
        weekLogs.map((l) => ({ Date: l.date, Person: l.assignee || "", Task: taskTitle.get(l.taskId) || l.taskTitle, Hours: Number(l.hours) || 0, Notes: l.description || "" })),
        [12, 14, 44, 8, 40]
      );
      const safe = (reportTitle.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)) || "report";
      XLSX.writeFile(wb, `${safe}_week_${W.start}.xlsx`);
    } catch (err) {
      console.error("Weekly export failed", err);
      setToast("Sorry — the Excel export failed.");
    } finally {
      setExportingXlsx(false);
    }
  };

  // ---- interactive infographic (standalone HTML file) -------------------------
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoExcluded, setInfoExcluded] = useState<InfoSection[]>(loadExcluded);
  // Only offer sections this export can actually show.
  const infoAvailable = INFO_SECTIONS.filter((s) => {
    if (s.key === "modules") return allRows.some((r) => r.task.moduleId || (r.project.modules || []).length);
    if (s.key === "goals") return goals.length > 0;
    if (s.key === "baseline") return effScope === "space" && allRows.some((r) => r.task.baseline);
    if (s.key === "notes") return mode === "weekly" && !!notes.trim();
    return true;
  });
  const infoChosen = infoAvailable.filter((s) => !infoExcluded.includes(s.key)).map((s) => s.key);
  const setInfoSection = (key: InfoSection, include: boolean) => {
    setInfoExcluded((prev) => {
      const next = include ? prev.filter((k) => k !== key) : Array.from(new Set([...prev, key]));
      try {
        localStorage.setItem(INFO_EXCLUDED_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
      return next;
    });
  };
  const setAllInfoSections = (include: boolean) => {
    const next = include ? infoExcluded.filter((k) => !infoAvailable.some((s) => s.key === k)) : Array.from(new Set([...infoExcluded, ...infoAvailable.map((s) => s.key)]));
    setInfoExcluded(next);
    try {
      localStorage.setItem(INFO_EXCLUDED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!infoOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-info-picker]")) setInfoOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setInfoOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [infoOpen]);

  const exportInfographic = () => {
    if (infoChosen.length === 0) return;
    setInfoOpen(false);
    try {
      const data = buildInfographicData({
        app: (typeof document !== "undefined" && document.title) || "Task tracker",
        title: scopeName,
        icon: effScope === "space" ? activeProject.icon || "" : "",
        rows: allRows, // every person: the file has its own Person filter
        projects: scoped,
        today,
        period,
        person: person || null,
        goals,
        baseline: effScope === "space" ? baselineSummary({ ...activeProject, tasks: allRows.map((r) => r.task) }, today) : null,
        notes: mode === "weekly" ? notes : "",
        sections: infoChosen,
        logs,
      });
      const html = buildInfographicHtml(data);
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = infographicFileName(scopeName, today);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setToast("Infographic downloaded — open it in any browser, or send it to your manager.");
    } catch (err) {
      console.error("Infographic export failed", err);
      setToast("Sorry — the infographic export failed.");
    }
  };

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
    document.title = mode === "weekly" ? `${reportTitle} – weekly report ${W.start}` : `${scopeName} – status report ${today}`;
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

        {(goals.length > 0 || bsum) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {goals.length > 0 && (
              <ChartCard
                className={bsum ? "lg:col-span-7" : "lg:col-span-12"}
                title={`Goals · ${goals.filter((g) => g.state === "done").length}/${goals.length} achieved`}
                subtitle="Progress comes from the tasks in each goal's modules"
              >
                <ul id="dash-goals" className="space-y-3">
                  {goals.map((g) => {
                    const color =
                      g.state === "overdue"
                        ? "var(--viz-late)"
                        : g.state === "at-risk"
                        ? "var(--viz-warning)"
                        : g.state === "done"
                        ? "var(--viz-done)"
                        : "var(--viz-accent)";
                    const when =
                      g.daysLeft !== null && g.state !== "done"
                        ? g.daysLeft < 0
                          ? `${-g.daysLeft} days past ${fmtDay(g.goal.timeBound)}`
                          : g.daysLeft === 0
                          ? "due today"
                          : `${g.daysLeft} days left · ${fmtDay(g.goal.timeBound)}`
                        : g.goal.timeBound
                        ? fmtDay(g.goal.timeBound)
                        : "no target date";
                    return (
                      <li key={g.goal.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 min-w-0">{g.goal.title || "Untitled goal"}</span>
                          <span className="text-[11px] tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-300">
                            <b className="text-slate-900 dark:text-white">{g.progress}%</b>
                          </span>
                        </div>
                        <div
                          className="relative mt-1 h-2 rounded-full overflow-hidden"
                          style={{ background: "var(--viz-accent-soft)" }}
                          role="img"
                          aria-label={`${g.goal.title}: ${g.progress}% done${g.expected !== null ? `, ${g.expected}% of the time used` : ""}`}
                        >
                          <div className="h-full rounded-full" style={{ width: `${g.progress}%`, background: color }} />
                          {g.expected !== null && g.state !== "done" && (
                            <span
                              className="absolute top-0 bottom-0 w-0.5"
                              style={{ left: `calc(${g.expected}% - 1px)`, background: "var(--viz-ink)" }}
                              title={`${g.expected}% of the time to the target date has passed`}
                            />
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <b className="font-semibold text-slate-700 dark:text-slate-200">{GOAL_STATE_LABEL[g.state]}</b> · {when}
                          {g.tasks ? ` · ${g.done}/${g.tasks} tasks` : " · progress set by hand"}
                          {g.modules.length ? ` · ${g.modules.map((m) => m.name).join(", ")}` : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {goals.some((g) => g.expected !== null && g.state !== "done") && (
                  <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">The thin mark on each bar is how much of the time to the target date has passed.</p>
                )}
              </ChartCard>
            )}
            {bsum && (
              <ChartCard
                className={goals.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}
                title="Against the baseline"
                subtitle={`Saved plan${bsum.setAt ? ` from ${fmtDay(bsum.setAt)}` : ""} vs the plan now · ${plural(bsum.baselined, "task")}`}
              >
                <div id="dash-baseline" className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { k: "Later", v: bsum.late },
                    { k: "On plan", v: bsum.onPlan },
                    { k: "Earlier", v: bsum.early },
                  ].map((x) => (
                    <div key={x.k} className="rounded-lg border border-slate-200 dark:border-[#1E222B] px-2.5 py-2">
                      <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{x.v}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{x.k}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                  Average slip <b className="text-slate-900 dark:text-white">{bsum.avgSlip > 0 ? "+" : ""}{bsum.avgSlip} days</b>
                  {bsum.baselineFinish && bsum.currentFinish && (
                    <>
                      {" "}· last finish {fmtDay(bsum.baselineFinish)} → <b className="text-slate-900 dark:text-white">{fmtDay(bsum.currentFinish)}</b> ({fmtSlip(bsum.finishSlip)})
                    </>
                  )}
                </p>
                {slipped.length > 0 ? (
                  <ul className="divide-y divide-slate-100 dark:divide-[#1A1E26] -my-1">
                    {slipped.slice(0, 5).map((x, i) => (
                      <li key={`${x.r.task.id}:${i}`}>{taskLine(x.r, { text: fmtSlip(x.v.finishSlip), tone: "late" })}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No open task is finishing later than planned.</p>
                )}
              </ChartCard>
            )}
          </div>
        )}
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

  // ---- WEEKLY ------------------------------------------------------------------------------
  const weekly = () => {
    const dueRate = W.dueInWeek.length ? Math.round((W.dueDone / W.dueInWeek.length) * 100) : null;
    const looseItems = W.itemsDone.filter((i) => !W.finished.includes(i.row));
    const byTask = new Map<Row, typeof looseItems>();
    looseItems.forEach((i) => byTask.set(i.row, [...(byTask.get(i.row) || []), i]));
    const maxH = Math.max(1, ...W.hoursByPerson.map((p) => p.hours));
    const finishedItems = (r: Row) => W.itemsDone.filter((i) => i.row === r).length;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile
            label="Tasks finished"
            value={W.finished.length}
            delta={W.finished.length - W.prevFinished}
            deltaLabel="vs previous week"
          />
          <StatTile label="Checklist items ticked" value={W.itemsDone.length} sub={W.itemsDone.length ? `across ${plural(new Set(W.itemsDone.map((i) => i.row)).size, "task")}` : "none with a done date"} />
          <StatTile
            label="Hours logged"
            value={hrs(W.hours)}
            delta={Math.round((W.hours - W.prevHours) * 10) / 10}
            deltaLabel="vs previous week"
          />
          <StatTile
            label="Due this week — done"
            value={W.dueInWeek.length ? `${W.dueDone}/${W.dueInWeek.length}` : "–"}
            meter={dueRate ?? undefined}
            sub={dueRate === null ? "nothing was due" : `${dueRate}% of what was due`}
          />
          <StatTile
            label="Slipped"
            value={W.slipped.length}
            sub={W.carriedOver ? `+ ${W.carriedOver} still late from earlier weeks` : W.slipped.length ? "due this week, not done" : "nothing slipped"}
          />
        </div>

        <ChartCard title="Notes for this report" subtitle={presenting ? undefined : "Highlights, blockers, decisions needed — included in the PDF, Excel and copied text"}>
          {presenting ? (
            notes.trim() ? (
              <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed" data-testid="weekly-notes-view">
                {notes.trim()}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">No notes this week.</p>
            )
          ) : (
            <textarea
              id="weekly-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Simulation model validated. Waiting on lab access for the bench test — need a decision on the FPGA board by Thursday."
              className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          )}
        </ChartCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {listCard({
            title: `Done · ${W.finished.length}`,
            subtitle: "Tasks finished this week, by finish date",
            items: W.finished,
            empty: "No tasks finished this week.",
            limit: 12,
            render: (r) => {
              const n = finishedItems(r);
              return taskLine(r, { text: fmtDay(r.doneDate!), tone: "plain" }, `${r.doneEstimated ? " · counted on its due date" : ""}${n ? ` · ${plural(n, "item")} ticked` : ""}`);
            },
          })}
          <ChartCard title={`Progress on open tasks · ${looseItems.length}`} subtitle="Checklist items and subtasks ticked this week">
            {byTask.size === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3">No checklist items ticked on open tasks.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...byTask.entries()].slice(0, 8).map(([row, items], i) => (
                  <li key={`${row.project.id}:${row.task.id}:${i}`}>
                    <button type="button" onClick={() => onOpenTask(row.project.id, row.task)} className="text-left text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                      {row.task.title}
                      {effScope === "all" ? <span className="font-normal text-slate-500 dark:text-slate-400"> · {row.project.name}</span> : null}
                    </button>
                    <ul className="mt-1 space-y-0.5">
                      {items.map((it, j) => (
                        <li key={`${it.item.id}:${j}`} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                          <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: "var(--viz-done)" }} />
                          <span className="min-w-0 flex-1 truncate">{it.item.title}</span>
                          <span className="text-slate-400 shrink-0">{fmtDay(it.item.completedAt!)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {listCard({
            title: `Slipped · ${W.slipped.length}`,
            subtitle: "Due this week and not done",
            items: W.slipped,
            empty: W.current ? "Nothing due so far this week has slipped." : "Nothing slipped this week.",
            limit: 8,
            render: (r) => taskLine(r, { text: `was ${fmtDay(r.due!)}`, tone: "late" }, r.col ? ` · ${r.col.title}` : ""),
          })}
          {W.current
            ? listCard({
                title: `Still due this week · ${W.stillDue.length}`,
                subtitle: `From today to ${fmtDay(W.end)}`,
                items: W.stillDue,
                empty: "Nothing else due this week.",
                limit: 8,
                render: (r) => taskLine(r, dueChip(r)),
              })
            : listCard({
                title: `Next week · ${W.nextWeek.length}`,
                subtitle: weekLabel(addDays(W.start, 7)),
                items: W.nextWeek,
                empty: "Nothing due next week.",
                limit: 8,
                render: (r) => taskLine(r, { text: fmtDay(r.due!), tone: "plain" }),
              })}
          <ChartCard title={`Hours by person · ${hrs(W.hours)}`} subtitle={`From ${plural(W.logEntries, "Daily Logs entry", "Daily Logs entries")} this week`}>
            <MeterList
              rows={W.hoursByPerson.map((p) => ({
                key: p.name,
                label: p.name,
                value: p.hours,
                max: maxH,
                note: plural(p.entries, "entry", "entries"),
                figure: <b className="text-slate-900 dark:text-white">{hrs(p.hours)}</b>,
              }))}
              empty="No hours logged in Daily Logs this week."
            />
          </ChartCard>
        </div>
        {W.current &&
          listCard({
            title: `Next week · ${W.nextWeek.length}`,
            subtitle: weekLabel(addDays(W.start, 7)),
            items: W.nextWeek,
            empty: "Nothing due next week.",
            limit: 8,
            render: (r) => taskLine(r, { text: fmtDay(r.due!), tone: "plain" }),
          })}
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
        <button type="button" id="dash-mode-weekly" className={segCls(mode === "weekly")} onClick={() => setMode("weekly")}>
          Weekly
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
      {mode === "weekly" && (
        <div className="flex items-center gap-1" role="group" aria-label="Week">
          <button type="button" aria-label="Previous week" onClick={() => setWeekAnchor(addDays(W.start, -7))} className="p-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C2027]">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span id="weekly-label" className="px-2 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap min-w-[8.5rem] text-center">
            {weekLabel(W.start)}
          </span>
          <button
            type="button"
            aria-label="Next week"
            disabled={W.current}
            onClick={() => setWeekAnchor(addDays(W.start, 7))}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C2027] disabled:opacity-40"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-0.5 p-0.5 ml-1 rounded-lg bg-slate-100 dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
            <button type="button" className={segCls(W.start === weekBounds(addDays(today, -7)).start)} onClick={() => setWeekAnchor(addDays(today, -7))}>
              Last week
            </button>
            <button type="button" className={segCls(W.current)} onClick={() => setWeekAnchor(today)}>
              This week
            </button>
          </div>
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
            {mode === "weekly" && (
              <>
                <button type="button" id="weekly-copy" onClick={copySummary} title="Copy a text summary for email or chat" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]">
                  <ClipboardCopy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy text</span><span className="sm:hidden">Copy</span>
                </button>
                {canShare && (
                  <button type="button" id="weekly-share" onClick={shareSummary} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
                <button type="button" id="weekly-excel" onClick={exportWeekXlsx} disabled={exportingXlsx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-60">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
              </>
            )}
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
            <div className="relative" data-info-picker>
              <button
                type="button"
                id="dash-infographic"
                onClick={() => setInfoOpen((o) => !o)}
                aria-expanded={infoOpen}
                aria-controls="dash-info-picker"
                title="Download an interactive infographic (.html) that opens in any browser"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222B] bg-white dark:bg-[#14171C] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2027]"
              >
                <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Infographic</span><span className="sm:hidden">HTML</span>
              </button>
              {infoOpen && (
                <div
                  id="dash-info-picker"
                  role="dialog"
                  aria-label="Choose what goes in the infographic"
                  className="fixed z-[60] left-3 right-3 bottom-[76px] sm:absolute sm:left-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[34rem] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-[#262B35] bg-white dark:bg-[#17191E] shadow-2xl p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Include in the infographic</span>
                    <button type="button" onClick={() => setAllInfoSections(true)} className="ml-auto text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      All
                    </button>
                    <button type="button" onClick={() => setAllInfoSections(false)} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                      None
                    </button>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5">
                    {infoAvailable.map((s) => (
                      <li key={s.key}>
                        <label className="flex items-start gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1C2027] cursor-pointer">
                          <input
                            type="checkbox"
                            data-section={s.key}
                            checked={!infoExcluded.includes(s.key)}
                            onChange={(e) => setInfoSection(s.key, e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{s.label}</span>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">{s.hint}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-[#262B35]">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {infoChosen.length} of {infoAvailable.length} sections
                    </span>
                    <button
                      type="button"
                      id="dash-info-download"
                      onClick={exportInfographic}
                      disabled={infoChosen.length === 0}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileDown className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>
              )}
            </div>
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

  const toastEl = toast && (
    <div role="status" className="no-print fixed z-[60] left-3 right-3 bottom-[76px] md:left-auto md:right-6 md:bottom-6 md:w-96 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl">
      {toast}
    </div>
  );

  const body = (
    <>
      {toastEl}
      {controls}
      {healthBar}
      {mode === "report" ? report() : mode === "plan" ? plan() : weekly()}
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
                {mode === "report" ? `Status report · ${pInfo.label}` : mode === "plan" ? "Planning view" : `Weekly report · ${weekLabel(W.start)}${W.current ? " (so far)" : ""}`}
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
