import { Project, Task, SubTask, ProjectModule, TaskPriority, ConstraintType } from "../types";

// Import file format (JSON):
//   { "tasks": Task[], "modules"?: ProjectModule[], "tags"?: string[] }
// A bare array of tasks is also accepted. Import is a merge: tasks and modules
// whose id already exists in the space are skipped, so re-importing the same
// file never duplicates anything.

export interface ImportSummary {
  added: number;
  skipped: number;
  invalid: number;
  modulesAdded: number;
  tagsAdded: number;
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
const CONSTRAINTS: ConstraintType[] = [
  "none", "start-no-earlier-than", "start-no-later-than", "must-start-on", "finish-no-later-than", "must-finish-on",
];
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

function normalizeItems(raw: unknown, prefix: string): SubTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === "object" && typeof (it as any).title === "string" && (it as any).title.trim())
    .map((it: any, i) => ({
      id: typeof it.id === "string" && it.id ? it.id : `${prefix}-${i + 1}`,
      title: it.title.trim(),
      completed: it.completed === true,
    }));
}

// Coerce one imported task into a valid Task for this space, or null if unusable.
export function normalizeTask(raw: unknown, project: Project, index: number, stamp: number): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (typeof r.title !== "string" || !r.title.trim()) return null;
  const today = new Date().toISOString().slice(0, 10);
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `task-imp-${stamp}-${index}`;
  const colIds = project.columns.map((c) => c.id);
  const startDate = isDate(r.startDate) ? r.startDate : isDate(r.dueDate) ? r.dueDate : today;
  const dueDate = isDate(r.dueDate) ? r.dueDate : startDate;
  const task: Task = {
    id,
    title: r.title.trim(),
    description: str(r.description),
    status: colIds.includes(r.status) ? r.status : colIds[0],
    priority: PRIORITIES.includes(r.priority) ? r.priority : "medium",
    startDate,
    dueDate,
    assignee: str(r.assignee, "Unassigned") || "Unassigned",
    tags: strArr(r.tags),
    estimatedHours: Number(r.estimatedHours) || 0,
    actualHours: Number(r.actualHours) || 0,
    subtasks: normalizeItems(r.subtasks, `sub-${id}`),
    checklist: normalizeItems(r.checklist, `chk-${id}`),
    comments: Array.isArray(r.comments) ? r.comments : [],
    createdAt: isDate(r.createdAt) ? r.createdAt : today,
  };
  if (isDate(r.deadline)) task.deadline = r.deadline;
  if (CONSTRAINTS.includes(r.constraintType)) task.constraintType = r.constraintType;
  if (isDate(r.constraintDate)) task.constraintDate = r.constraintDate;
  if (r.isMilestone === true) task.isMilestone = true;
  if (typeof r.progress === "number") task.progress = Math.max(0, Math.min(100, r.progress));
  if (typeof r.moduleId === "string") task.moduleId = r.moduleId;
  if (Array.isArray(r.dependencies)) task.dependencies = strArr(r.dependencies);
  if (r.recurrence && typeof r.recurrence === "object") task.recurrence = r.recurrence;
  return task;
}

// Merge parsed import data into a space. Throws on an unrecognised file shape.
export function mergeImport(project: Project, data: unknown): { project: Project; summary: ImportSummary } {
  const payload = Array.isArray(data) ? { tasks: data } : (data as Record<string, any>);
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.tasks)) {
    throw new Error('This file has no "tasks" list — it is not a task import file.');
  }
  const stamp = Date.now();
  const existingIds = new Set(project.tasks.map((t) => t.id));
  const added: Task[] = [];
  let skipped = 0;
  let invalid = 0;
  payload.tasks.forEach((raw: unknown, i: number) => {
    const t = normalizeTask(raw, project, i, stamp);
    if (!t) { invalid++; return; }
    if (existingIds.has(t.id)) { skipped++; return; }
    existingIds.add(t.id);
    added.push(t);
  });

  const modules: ProjectModule[] = [...(project.modules || [])];
  const moduleIds = new Set(modules.map((m) => m.id));
  let modulesAdded = 0;
  if (Array.isArray(payload.modules)) {
    payload.modules.forEach((m: any) => {
      if (m && typeof m.id === "string" && typeof m.name === "string" && !moduleIds.has(m.id)) {
        modules.push(m as ProjectModule);
        moduleIds.add(m.id);
        modulesAdded++;
      }
    });
  }

  const tags = [...(project.tags || [])];
  let tagsAdded = 0;
  const wanted = [...strArr(payload.tags), ...added.flatMap((t) => t.tags)];
  wanted.forEach((tag) => {
    if (!tags.includes(tag)) { tags.push(tag); tagsAdded++; }
  });

  return {
    project: { ...project, tasks: [...project.tasks, ...added], modules, tags },
    summary: { added: added.length, skipped, invalid, modulesAdded, tagsAdded },
  };
}
