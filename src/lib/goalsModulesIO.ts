import { ModuleReadiness, Project, ProjectModule, SmartGoal, Task } from "../types";
import { moduleOfTask } from "./modules";

// Goals & Modules round trip with an AI assistant:
//   1. buildGoalsModulesGuide() → a Markdown brief (rules + this space's tasks)
//   2. the AI answers with a JSON file in the format below
//   3. planGoalsModulesImport() validates it and works out the changes, which
//      the user reviews before they are applied.
//
// File format:
//   {
//     "kind": "goals-modules",
//     "modules": [{ id, name, icon?, color?, owner?, readiness?, dependsOn?, description?, tags? }],
//     "goals":   [{ id, title, specific?, measurable?, achievable?, relevant?, timeBound?, progress?, moduleIds?, tags? }],
//     "taskModules": [{ taskId, moduleId }]
//   }
// Modules and goals are matched to existing ones by id, then by name/title, so
// importing the same file twice updates rather than duplicates.

const FENCE = "```";
const READINESS: ModuleReadiness[] = ["design", "prototype", "bench-test", "integrated", "done"];
const COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#ec4899", "#8b5cf6"];
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim()) : [];
const cell = (s: string) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const norm = (s: string) => s.trim().toLowerCase();
const slug = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "X";

// ---- guide ------------------------------------------------------------------------

export function buildGoalsModulesGuide(project: Project, appName: string, today: string): string {
  const modules = project.modules || [];
  const goals = project.goals || [];
  const members = (project.members || []).map((m) => m.name).filter((n) => n && n !== "Unassigned");
  const tasks = project.tasks;
  const MAX_TASKS = 400;
  const shown = tasks.slice(0, MAX_TASKS);
  const sampleTasks = tasks.slice(0, 3);
  const colTitle = (id: string) => project.columns.find((c) => c.id === id)?.title || id;

  const example = {
    kind: "goals-modules",
    modules: [
      {
        id: "MOD-RESEARCH",
        name: "Research",
        icon: "📚",
        color: "#6366f1",
        owner: members[0] || "",
        readiness: "design",
        dependsOn: [],
        description: "Literature review and problem definition.",
        tags: ["Research"],
      },
      {
        id: "MOD-BUILD",
        name: "Build",
        icon: "🔨",
        color: "#10b981",
        readiness: "design",
        dependsOn: ["MOD-RESEARCH"],
        description: "Design, implement and test the solution.",
        tags: [],
      },
    ],
    goals: [
      {
        id: "GOAL-1",
        title: "Submit a working prototype by the end of the term",
        specific: "A prototype that runs the three core scenarios end to end.",
        measurable: "All three scenarios pass the acceptance test; demo recorded.",
        achievable: "Two people, 10 h a week each, tools already available.",
        relevant: "The prototype is the main deliverable the supervisor grades.",
        timeBound: "2026-12-20",
        moduleIds: ["MOD-RESEARCH", "MOD-BUILD"],
        tags: [],
      },
    ],
    taskModules: sampleTasks.map((t, i) => ({ taskId: t.id, moduleId: i === 0 ? "MOD-RESEARCH" : "MOD-BUILD" })),
  };

  const L: string[] = [];
  L.push("# Goals & Modules — Guide for an AI assistant");
  L.push("");
  L.push(`**App:** ${appName}  `);
  L.push(`**Space:** ${project.name}  `);
  L.push(`**Generated:** ${today}`);
  L.push("");
  L.push(
    "This file explains how to write a JSON file that the app's **Modules & Goals → Import from AI** button accepts. It lists this space's existing tasks so the assistant can group them into modules and tie the modules to goals."
  );
  L.push("");

  L.push("## 1. How to use");
  L.push("");
  L.push("1. Give this whole file to an AI assistant (ChatGPT, Claude, Gemini, …).");
  L.push("2. Paste the prompt from section 2. Add anything the AI should know: what the project is for, deadlines, who does what.");
  L.push("3. Save the AI's reply as a file ending in **`.json`** (for example `goals-modules.json`).");
  L.push(`4. In the app, open the **${project.name}** space → **Modules & Goals** tab → **Import from AI** → choose the file.`);
  L.push("5. Check the preview (what will be added, updated and linked), then press **Apply**. Importing the same file again updates the same modules and goals instead of duplicating them.");
  L.push("");

  L.push("## 2. Prompt to paste into the AI");
  L.push("");
  L.push(FENCE + "text");
  L.push("Using the guide in this file, read the task list in section 6 and design Modules and SMART Goals for this project.");
  L.push("- Group the tasks into 3–8 modules (workstreams, phases or subsystems). Every task that clearly belongs to one should be linked in taskModules.");
  L.push("- Write 1–5 SMART goals. Each goal lists the modules that deliver it in moduleIds. Give every goal a timeBound date.");
  L.push("- Keep the ids of modules and goals that already exist (section 6) if you are changing them.");
  L.push("- Reply with ONLY the JSON (no explanation, no markdown fences), in the format of section 4, so I can save it as a .json file.");
  L.push("");
  L.push("About the project:");
  L.push("<add a few lines here: purpose, final deadline, team, anything that matters>");
  L.push(FENCE);
  L.push("");

  L.push("## 3. What modules and goals are in this app");
  L.push("");
  L.push(
    "- **Module** — a group of related tasks: a workstream, phase, subsystem or chapter. Each task belongs to at most one module. A module has a readiness stage and can depend on other modules (it cannot really start until they are integrated)."
  );
  L.push(
    "- **Goal** — a SMART objective (Specific, Measurable, Achievable, Relevant, Time-bound). A goal is delivered by one or more modules. The app works out the goal's progress from the tasks in those modules and warns when a goal falls behind its target date."
  );
  L.push("- Modules appear as a filter and a group-by on every tab (Spreadsheet, Board, Calendar, Gantt) and on the Dashboard; goals appear on the Dashboard.");
  L.push("");

  L.push("## 4. File format");
  L.push("");
  L.push("One JSON object with up to three lists. All lists are optional; leave out what you are not changing.");
  L.push("");
  L.push("### modules");
  L.push("");
  L.push("| Field | Type | Required | Notes |");
  L.push("|---|---|---|---|");
  L.push("| id | string | yes | Short and stable, e.g. `MOD-RESEARCH`. Reuse an existing id to update that module. |");
  L.push("| name | string | yes | Shown everywhere; keep it short (1–3 words). |");
  L.push("| icon | string | no | One emoji, e.g. `📚`. |");
  L.push(`| color | string | no | Hex colour; one of ${COLORS.map((c) => `\`${c}\``).join(", ")}. |`);
  L.push(`| owner | string | no | Person responsible${members.length ? `; one of: ${members.map((m) => `\`${m}\``).join(", ")}` : ""}. |`);
  L.push(`| readiness | string | no | One of ${READINESS.map((r) => `\`${r}\``).join(", ")}. Use \`design\` for work not started. |`);
  L.push("| dependsOn | string[] | no | Ids of modules this one waits for. No cycles. |");
  L.push("| description | string | no | One or two sentences. |");
  L.push("| tags | string[] | no | Optional labels. |");
  L.push("");
  L.push("### goals");
  L.push("");
  L.push("| Field | Type | Required | Notes |");
  L.push("|---|---|---|---|");
  L.push("| id | string | yes | e.g. `GOAL-1`. Reuse an existing id to update that goal. |");
  L.push("| title | string | yes | The goal in one sentence. |");
  L.push("| specific | string | no | S — exactly what will be accomplished. |");
  L.push("| measurable | string | no | M — how you will know it is done (numbers, tests, sign-off). |");
  L.push("| achievable | string | no | A — the time, people and tools that make it realistic. |");
  L.push("| relevant | string | no | R — why it matters. |");
  L.push("| timeBound | string | recommended | T — target date, `YYYY-MM-DD`. |");
  L.push("| moduleIds | string[] | recommended | Ids of the modules that deliver this goal. |");
  L.push("| progress | number | no | 0–100. Only used when the goal has no linked tasks; otherwise the app calculates it. |");
  L.push("| tags | string[] | no | Optional labels. |");
  L.push("");
  L.push("### taskModules");
  L.push("");
  L.push("| Field | Type | Required | Notes |");
  L.push("|---|---|---|---|");
  L.push("| taskId | string | yes | An id from the task list in section 6. Do not invent task ids. |");
  L.push("| moduleId | string | yes | A module id from this file or from section 6. |");
  L.push("");
  L.push("New tasks are not created by this file — use the Spreadsheet tab's task import guide for that.");
  L.push("");

  L.push("## 5. Rules");
  L.push("");
  L.push("- Output must be valid JSON: double quotes, no comments, no trailing commas.");
  L.push("- Dates are `YYYY-MM-DD`.");
  L.push(`- Today is ${today}. Target dates should be in the future unless the goal is already finished.`);
  L.push("- Every id in `dependsOn`, `moduleIds` and `taskModules.moduleId` must exist (in this file or already in the space).");
  L.push("- A task can be in only one module; if a task appears twice in `taskModules`, the last one wins.");
  L.push("- Prefer a few clear modules over many tiny ones. A module with no tasks is fine if work is planned for it.");
  L.push("");

  L.push("## 6. This space today");
  L.push("");
  L.push("### Existing modules");
  L.push("");
  if (modules.length === 0) L.push("None yet.");
  else {
    L.push("| id | name | readiness | depends on |");
    L.push("|---|---|---|---|");
    modules.forEach((m) => L.push(`| ${cell(m.id)} | ${cell(m.name)} | ${cell(m.readiness || "")} | ${cell((m.dependsOn || []).join(", "))} |`));
  }
  L.push("");
  L.push("### Existing goals");
  L.push("");
  if (goals.length === 0) L.push("None yet.");
  else {
    L.push("| id | title | target date | modules |");
    L.push("|---|---|---|---|");
    goals.forEach((g) => L.push(`| ${cell(g.id)} | ${cell(g.title)} | ${cell(g.timeBound || "")} | ${cell((g.moduleIds || []).join(", "))} |`));
  }
  L.push("");
  if (members.length) {
    L.push(`### People`);
    L.push("");
    L.push(members.join(", "));
    L.push("");
  }
  L.push(`### Tasks (${tasks.length}${tasks.length > MAX_TASKS ? `, first ${MAX_TASKS} shown` : ""})`);
  L.push("");
  if (shown.length === 0) L.push("No tasks yet — you can still create modules and goals.");
  else {
    L.push("| id | title | status | start | due | tags | module now |");
    L.push("|---|---|---|---|---|---|---|");
    shown.forEach((t) =>
      L.push(
        `| ${cell(t.id)} | ${cell(t.title)} | ${cell(colTitle(t.status))} | ${t.startDate || ""} | ${t.dueDate || ""} | ${cell(
          (t.tags || []).join(", ")
        )} | ${cell(moduleOfTask(t, modules)?.id || "")} |`
      )
    );
  }
  L.push("");

  L.push("## 7. Example");
  L.push("");
  L.push(FENCE + "json");
  L.push(JSON.stringify(example, null, 2));
  L.push(FENCE);
  L.push("");
  L.push("## 8. Before you answer");
  L.push("");
  L.push('- [ ] The reply is only the JSON object, starting with `{` and with `"kind": "goals-modules"`.');
  L.push("- [ ] Every module and goal has an id; every goal has a timeBound date.");
  L.push("- [ ] Every taskId comes from section 6.");
  L.push("- [ ] Every moduleId / dependsOn id exists.");
  L.push("");
  return L.join("\n");
}

// ---- import -----------------------------------------------------------------------

export interface GoalsModulesPlan {
  project: Project; // the space with the changes applied
  modulesAdded: string[];
  modulesUpdated: string[];
  goalsAdded: string[];
  goalsUpdated: string[];
  tasksLinked: number; // tasks whose module changes
  unknownTasks: string[]; // taskIds that don't exist here
  warnings: string[];
}

// Accept the raw text an AI produced: plain JSON, or JSON wrapped in ``` fences
// or with a sentence before/after it.
export function parseLooseJson(text: string): unknown {
  const t = text.replace(/^﻿/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (fenced) return JSON.parse(fenced[1]);
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new SyntaxError("not JSON");
  }
}

export function planGoalsModulesImport(project: Project, data: unknown): GoalsModulesPlan {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("This file is not a Goals & Modules file (expected a JSON object with modules, goals or taskModules).");
  }
  const d = data as Record<string, unknown>;
  const rawModules = Array.isArray(d.modules) ? d.modules : [];
  const rawGoals = Array.isArray(d.goals) ? d.goals : [];
  const rawLinks = Array.isArray(d.taskModules) ? d.taskModules : [];
  if (!rawModules.length && !rawGoals.length && !rawLinks.length) {
    if (Array.isArray(d.tasks)) throw new Error("This looks like a task import file — use Import tasks on the Spreadsheet tab for it.");
    throw new Error('This file has no "modules", "goals" or "taskModules" list.');
  }

  const warnings: string[] = [];
  const modules: ProjectModule[] = (project.modules || []).map((m) => ({ ...m }));
  const modulesAdded: string[] = [];
  const modulesUpdated: string[] = [];
  // Map every id / name the file may use → the module's real id.
  const alias = new Map<string, string>();
  modules.forEach((m) => {
    alias.set(norm(m.id), m.id);
    alias.set(norm(m.name), m.id);
  });
  const fileIds = new Map<string, string>(); // file id → real id (for dependsOn resolved after all modules exist)
  const pendingDeps: { mod: ProjectModule; deps: string[] }[] = [];

  rawModules.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (!name) {
      warnings.push(`Module #${i + 1} has no name — skipped.`);
      return;
    }
    const fileId = str(r.id);
    const existing = modules.find((m) => (fileId && m.id === fileId) || norm(m.name) === norm(name));
    const patch: Partial<ProjectModule> = { name };
    if (str(r.icon)) patch.icon = str(r.icon).slice(0, 8);
    if (/^#[0-9a-f]{6}$/i.test(str(r.color))) patch.color = str(r.color);
    if (typeof r.owner === "string") patch.owner = str(r.owner);
    if (READINESS.includes(r.readiness as ModuleReadiness)) patch.readiness = r.readiness as ModuleReadiness;
    else if (r.readiness !== undefined) warnings.push(`Module “${name}”: readiness “${String(r.readiness)}” isn't one of ${READINESS.join(", ")} — ignored.`);
    if (typeof r.description === "string") patch.description = str(r.description);
    if (Array.isArray(r.tags)) patch.tags = strArr(r.tags);
    let mod: ProjectModule;
    if (existing) {
      Object.assign(existing, patch);
      mod = existing;
      if (!modulesUpdated.includes(mod.name)) modulesUpdated.push(mod.name);
    } else {
      let id = fileId || `MOD-${slug(name)}`;
      while (modules.some((m) => m.id === id)) id = `${id}-2`;
      mod = {
        id,
        readiness: "design",
        color: COLORS[(modules.length + modulesAdded.length) % COLORS.length],
        tags: [],
        ...patch,
        name,
      } as ProjectModule;
      modules.push(mod);
      modulesAdded.push(name);
    }
    alias.set(norm(mod.id), mod.id);
    alias.set(norm(mod.name), mod.id);
    if (fileId) fileIds.set(norm(fileId), mod.id);
    if (Array.isArray(r.dependsOn)) pendingDeps.push({ mod, deps: strArr(r.dependsOn) });
  });
  const resolveModule = (ref: string) => fileIds.get(norm(ref)) || alias.get(norm(ref));

  pendingDeps.forEach(({ mod, deps }) => {
    const ids: string[] = [];
    deps.forEach((ref) => {
      const id = resolveModule(ref);
      if (!id) warnings.push(`Module “${mod.name}” depends on “${ref}”, which doesn't exist — ignored.`);
      else if (id !== mod.id && !ids.includes(id)) ids.push(id);
    });
    mod.dependsOn = ids;
  });
  // Break dependency cycles (keep the first edges, drop the one that closes a loop).
  const byId = new Map(modules.map((m) => [m.id, m]));
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (byId.get(from)?.dependsOn || []).some((n) => reaches(n, to, seen));
  };
  modules.forEach((m) => {
    const kept: string[] = [];
    (m.dependsOn || []).forEach((dep) => {
      m.dependsOn = kept;
      if (reaches(dep, m.id)) warnings.push(`Dependency “${m.name}” → “${byId.get(dep)?.name}” would make a loop — dropped.`);
      else kept.push(dep);
    });
    m.dependsOn = kept;
  });

  // Goals
  const goals: SmartGoal[] = (project.goals || []).map((g) => ({ ...g }));
  const goalsAdded: string[] = [];
  const goalsUpdated: string[] = [];
  rawGoals.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    if (!title) {
      warnings.push(`Goal #${i + 1} has no title — skipped.`);
      return;
    }
    const fileId = str(r.id);
    const existing = goals.find((g) => (fileId && g.id === fileId) || norm(g.title) === norm(title));
    const patch: Partial<SmartGoal> = { title };
    (["specific", "measurable", "achievable", "relevant"] as const).forEach((k) => {
      if (typeof r[k] === "string") patch[k] = str(r[k]);
    });
    if (isDate(r.timeBound)) patch.timeBound = r.timeBound;
    else if (r.timeBound) warnings.push(`Goal “${title}”: target date “${String(r.timeBound)}” isn't YYYY-MM-DD — ignored.`);
    if (typeof r.progress === "number" && isFinite(r.progress)) patch.progress = Math.round(Math.max(0, Math.min(100, r.progress)));
    if (Array.isArray(r.tags)) patch.tags = strArr(r.tags);
    if (Array.isArray(r.moduleIds)) {
      const ids: string[] = [];
      strArr(r.moduleIds).forEach((ref) => {
        const id = resolveModule(ref);
        if (!id) warnings.push(`Goal “${title}” links module “${ref}”, which doesn't exist — ignored.`);
        else if (!ids.includes(id)) ids.push(id);
      });
      patch.moduleIds = ids;
    }
    if (existing) {
      Object.assign(existing, patch);
      if (!goalsUpdated.includes(existing.title)) goalsUpdated.push(existing.title);
    } else {
      let id = fileId || `goal-${Date.now()}-${i}`;
      while (goals.some((g) => g.id === id)) id = `${id}-2`;
      goals.push({
        id,
        specific: "",
        measurable: "",
        achievable: "",
        relevant: "",
        timeBound: "",
        progress: 0,
        moduleIds: [],
        tags: [],
        ...patch,
        title,
      } as SmartGoal);
      goalsAdded.push(title);
    }
  });

  // Task → module links
  const links = new Map<string, string>();
  const unknownTasks: string[] = [];
  const taskIds = new Set(project.tasks.map((t) => t.id));
  rawLinks.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const taskId = str(r.taskId);
    const ref = str(r.moduleId);
    if (!taskId || !ref) return;
    if (!taskIds.has(taskId)) {
      if (!unknownTasks.includes(taskId)) unknownTasks.push(taskId);
      return;
    }
    const id = resolveModule(ref);
    if (!id) {
      warnings.push(`Task ${taskId} → module “${ref}”, which doesn't exist — ignored.`);
      return;
    }
    links.set(taskId, id);
  });
  let tasksLinked = 0;
  const tasks: Task[] = project.tasks.map((t) => {
    const id = links.get(t.id);
    // Already in that module (explicitly or by tag): leave the task alone.
    if (!id || t.moduleId === id || moduleOfTask(t, modules)?.id === id) return t;
    tasksLinked++;
    return { ...t, moduleId: id };
  });

  const newTags = [...modules.flatMap((m) => m.tags || []), ...goals.flatMap((g) => g.tags || [])];
  const tags = Array.from(new Set([...(project.tags || []), ...newTags]));

  return {
    project: { ...project, modules, goals, tasks, tags },
    modulesAdded,
    modulesUpdated,
    goalsAdded,
    goalsUpdated,
    tasksLinked,
    unknownTasks,
    warnings,
  };
}

// The space's current goals & modules in the same format, so they can be
// edited elsewhere (or by an AI) and imported back.
export function exportGoalsModules(project: Project) {
  const modules = project.modules || [];
  return {
    kind: "goals-modules",
    modules: modules.map(({ id, name, icon, color, owner, readiness, dependsOn, description, tags }) => ({
      id,
      name,
      icon,
      color,
      owner,
      readiness,
      dependsOn: dependsOn || [],
      description: description || "",
      tags: tags || [],
    })),
    goals: (project.goals || []).map((g) => ({ ...g, moduleIds: g.moduleIds || [] })),
    taskModules: project.tasks
      .map((t) => ({ taskId: t.id, moduleId: moduleOfTask(t, modules)?.id }))
      .filter((x): x is { taskId: string; moduleId: string } => !!x.moduleId),
  };
}
