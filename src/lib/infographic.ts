import { Project } from "../types";
import { assigneeOf, CAT_LABEL, PeriodKey, Row } from "./dashboard";
import { isDeadlineMissed } from "./scheduling";
import { moduleOfTask, GoalStatus, GOAL_STATE_LABEL } from "./modules";
import { BaselineSummary, variance } from "./baseline";
import pageScript from "./infographicPage.js?raw";
import pageStyle from "./infographicPage.css?raw";

// A self-contained, interactive HTML infographic of the Dashboard: one file that
// opens in any browser (no internet needed), with filters, hover details, chart
// tables, a task explorer, light/dark and print. The data is a snapshot taken
// when the file is made; the page does its own sums so the filters work offline.

export interface InfoTask {
  t: string; // title
  s: string; // space
  a: string; // assignee
  st: string; // status (column title)
  c: "done" | "progress" | "blocked" | "todo";
  sd: string | null; // start
  d: string | null; // due
  dd: string | null; // done date
  e: number; // estimate (h)
  h: number; // hours logged
  m: string | null; // module
  ms: boolean; // milestone
  bl: boolean; // blocked (or waiting on unfinished work that should have started)
  dm: boolean; // past a hard deadline
  w: string | null; // waiting on (first unfinished predecessor)
  bd: string | null; // baseline due
  sl: number | null; // finish slip vs baseline (days)
}

export interface InfoData {
  v: 1;
  app: string;
  title: string;
  icon: string;
  multi: boolean; // more than one space in the snapshot
  asOf: string; // YYYY-MM-DD
  generated: string; // ISO time
  period: PeriodKey;
  person: string | null;
  catLabel: Record<string, string>;
  tasks: InfoTask[];
  goals: {
    title: string;
    progress: number;
    expected: number | null;
    state: string;
    stateLabel: string;
    daysLeft: number | null;
    target: string;
    done: number;
    total: number;
    modules: string[];
  }[];
  baseline: { setAt: string | null; late: number; onPlan: number; early: number; avgSlip: number; baselineFinish: string | null; currentFinish: string | null; finishSlip: number } | null;
  notes: string;
}

export function buildInfographicData(opts: {
  app: string;
  title: string;
  icon: string;
  rows: Row[]; // every row in scope (not person-filtered: the page filters)
  projects: Project[];
  today: string;
  period: PeriodKey;
  person: string | null;
  goals: GoalStatus[];
  baseline: BaselineSummary | null;
  notes?: string;
}): InfoData {
  const { rows, today } = opts;
  const byProject = new Map(opts.projects.map((p) => [p.id, p]));
  const tasks: InfoTask[] = rows.map((r) => {
    const p = byProject.get(r.project.id) || r.project;
    const v = r.task.baseline ? variance(r.task, p, today) : null;
    const startedOrDue = r.start || r.due;
    return {
      t: r.task.title || "Untitled",
      s: r.project.name,
      a: assigneeOf(r.task),
      st: r.col?.title || "",
      c: r.cat,
      sd: r.start,
      d: r.due,
      dd: r.done ? r.doneDate : null,
      e: Number(r.task.estimatedHours) || 0,
      h: Number(r.task.actualHours) || 0,
      m: moduleOfTask(r.task, p.modules)?.name || null,
      ms: !!r.task.isMilestone,
      bl: !r.done && (r.cat === "blocked" || (r.waitingOn.length > 0 && !!startedOrDue && startedOrDue <= today)),
      dm: !r.done && isDeadlineMissed(r.task),
      w: r.waitingOn[0] || null,
      bd: r.task.baseline?.due || null,
      sl: v ? v.finishSlip : null,
    };
  });
  return {
    v: 1,
    app: opts.app,
    title: opts.title,
    icon: opts.icon,
    multi: new Set(rows.map((r) => r.project.id)).size > 1,
    asOf: today,
    generated: new Date().toISOString(),
    period: opts.period,
    person: opts.person,
    catLabel: { ...CAT_LABEL },
    tasks,
    goals: opts.goals.map((g) => ({
      title: g.goal.title || "Untitled goal",
      progress: g.progress,
      expected: g.expected,
      state: g.state,
      stateLabel: GOAL_STATE_LABEL[g.state],
      daysLeft: g.daysLeft,
      target: g.goal.timeBound || "",
      done: g.done,
      total: g.tasks,
      modules: g.modules.map((m) => m.name),
    })),
    baseline: opts.baseline
      ? {
          setAt: opts.baseline.setAt,
          late: opts.baseline.late,
          onPlan: opts.baseline.onPlan,
          early: opts.baseline.early,
          avgSlip: opts.baseline.avgSlip,
          baselineFinish: opts.baseline.baselineFinish,
          currentFinish: opts.baseline.currentFinish,
          finishSlip: opts.baseline.finishSlip,
        }
      : null,
    notes: opts.notes || "",
  };
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// JSON that is safe inside <script>: no "</script", no U+2028/2029 surprises.
const scriptJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029");

export function buildInfographicHtml(data: InfoData): string {
  const title = `${data.title} — status infographic ${data.asOf}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escHtml(title)}</title>
<style>${pageStyle}</style>
</head>
<body>
<div id="app" aria-live="polite"><noscript>This report needs JavaScript to draw its charts.</noscript></div>
<div id="tip" role="tooltip" hidden></div>
<script type="application/json" id="report-data">${scriptJson(data)}</script>
<script>${pageScript}</script>
</body>
</html>
`;
}

export function infographicFileName(title: string, today: string): string {
  const safe = title.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "report";
  return `${safe}_infographic_${today}.html`;
}
