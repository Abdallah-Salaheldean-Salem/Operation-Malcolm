import { Project } from "../types";

// Builds a Markdown "template + guide" for the task importer (see
// importTasks.ts). It is meant to be handed to an AI assistant together with
// the user's plan, so the AI can produce a JSON file that imports cleanly.
// Space-specific values (column ids, members, tags, modules) are embedded so
// the generated tasks land in the right columns.

const FENCE = "```";
const cell = (s: string) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// A small, valid import file using this space's real column ids.
export function buildTemplateExample(project: Project) {
  const today = new Date().toISOString().slice(0, 10);
  const cols = project.columns;
  const first = cols[0]?.id || "col-todo";
  const second = cols[1]?.id || first;
  const assignee = project.members?.find((m) => m.name && m.name !== "Unassigned")?.name || "Unassigned";
  return {
    tags: ["Example"],
    modules: [
      {
        id: "MOD-PHASE-1",
        name: "Phase 1 — Research",
        icon: "📚",
        color: "#6366f1",
        readiness: "design",
        description: "Groups the tasks of the first phase.",
        tags: ["Example"],
      },
    ],
    tasks: [
      {
        id: "IMP-001",
        title: "Week 1 — Literature review",
        description: "Key deliverable: 10 papers summarised in a table.",
        status: second,
        priority: "high",
        assignee,
        startDate: today,
        dueDate: addDays(today, 6),
        deadline: addDays(today, 7),
        estimatedHours: 12,
        actualHours: 0,
        progress: 0,
        tags: ["Example"],
        moduleId: "MOD-PHASE-1",
        checklist: [
          { title: "Search IEEE Xplore with the agreed keywords", completed: true },
          { title: "Summarise 10 papers in the gap table", completed: false },
        ],
        subtasks: [{ title: "Install Zotero and the browser connector", completed: false }],
      },
      {
        id: "IMP-002",
        title: "🎯 Milestone — Literature review signed off",
        description: "Pass criteria: supervisor approves the gap table.",
        status: first,
        priority: "high",
        startDate: addDays(today, 7),
        dueDate: addDays(today, 7),
        isMilestone: true,
        dependencies: ["IMP-001"],
        moduleId: "MOD-PHASE-1",
        tags: ["Example"],
      },
      {
        id: "IMP-003",
        title: "Weekly supervisor sync",
        description: "Short status meeting; repeats every week.",
        status: first,
        priority: "medium",
        startDate: today,
        dueDate: today,
        recurrence: { frequency: "weekly", interval: 1 },
        constraintType: "must-start-on",
        constraintDate: today,
        tags: ["Example"],
      },
    ],
  };
}

export function buildImportGuide(project: Project, appName: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const cols = project.columns;
  const members = (project.members || []).map((m) => m.name).filter(Boolean);
  const tags = project.tags || [];
  const modules = project.modules || [];
  const example = JSON.stringify(buildTemplateExample(project), null, 2);
  const colIds = cols.map((c) => `"${c.id}"`).join(", ");

  const L: string[] = [];
  L.push(`# Task Import — Template & Guide`);
  L.push("");
  L.push(`**App:** ${appName}  `);
  L.push(`**Space:** ${project.name}  `);
  L.push(`**Generated:** ${today}`);
  L.push("");
  L.push("This file explains how to write a JSON file that the app's **Import tasks** button accepts, and ends with a ready-to-fill template. It is written so you can hand it straight to an AI assistant.");
  L.push("");

  L.push("## 1. How to use");
  L.push("");
  L.push("1. Give this whole file to an AI assistant (ChatGPT, Claude, Gemini, …) together with your plan, notes or checklist.");
  L.push("2. Paste the prompt from section 2 and add your plan underneath it.");
  L.push("3. Save the AI's reply as a file ending in **`.json`** (for example `my-plan.json`).");
  L.push(`4. In the app, open the **${project.name}** space → **Spreadsheet** tab → **Import tasks** → choose the file.`);
  L.push("5. A green banner confirms how many tasks were imported. Importing the same file again is safe — tasks that already exist are skipped.");
  L.push("");

  L.push("## 2. Prompt to paste into the AI");
  L.push("");
  L.push(FENCE + "text");
  L.push("Convert the plan below into a JSON import file for my task tracker.");
  L.push("Follow sections 3–7 of the attached \"Task Import — Template & Guide\" exactly,");
  L.push("use the column ids, member names and module ids listed in section 4, and use");
  L.push("the template in section 9 as the shape of the output.");
  L.push("Reply with ONLY the JSON — no explanation and no markdown code fences — so I can");
  L.push("save your reply directly as a .json file.");
  L.push("");
  L.push("My plan:");
  L.push("<paste your plan here>");
  L.push(FENCE);
  L.push("");

  L.push("## 3. Output rules (for the AI)");
  L.push("");
  L.push("- Output a single, valid JSON object — UTF-8, no comments, no trailing commas, no text before or after it.");
  L.push('- Top-level keys: `"tasks"` (required, array), `"modules"` (optional, array), `"tags"` (optional, array of strings).');
  L.push('- Every task needs a unique `"id"` and a non-empty `"title"`. Use one short prefix and a running number, e.g. `"IMP-001"`, `"IMP-002"`. An id that already exists in the space is skipped on import, so pick a fresh prefix for each new plan.');
  L.push("- All dates are strings in **`YYYY-MM-DD`** format (e.g. `\"" + today + "\"`).");
  L.push(`- \`"status"\` must be one of this space's column ids: ${colIds || "(no columns)"}.`);
  L.push('- `"priority"` must be one of `"low"`, `"medium"`, `"high"`, `"urgent"`.');
  L.push("- `\"assignee\"` should be one of the member names in section 4 (exact spelling), or `\"Unassigned\"`.");
  L.push("- `\"moduleId\"` must match the `id` of a module — either an existing one (section 4) or one you define in `\"modules\"`.");
  L.push("- `\"dependencies\"` lists the ids of tasks that must finish first (ids from the same file or already in the space).");
  L.push("- Put \"definition of done\" / acceptance items in `\"checklist\"`, and smaller work steps in `\"subtasks\"`. Each item is `{ \"title\": \"…\", \"completed\": false }`.");
  L.push("- Keep titles short (under ~90 characters); put details in `\"description\"`. Use `\\n` for line breaks inside strings.");
  L.push("");

  L.push("## 4. Values specific to this space");
  L.push("");
  L.push("**Columns (use the id in `status`):**");
  L.push("");
  L.push("| Column id | Shown as | Notes |");
  L.push("|---|---|---|");
  cols.forEach((c, i) => {
    const notes = [i === 0 ? "default if status is missing/unknown" : "", c.requireChecklist ? "Definition-of-Done gate: tasks can only move here when every checklist item is ticked" : ""]
      .filter(Boolean)
      .join("; ");
    L.push(`| \`${cell(c.id)}\` | ${cell(c.title)} | ${cell(notes)} |`);
  });
  L.push("");
  L.push(`**Members (use in \`assignee\`):** ${members.length ? members.map((m) => `\`${m}\``).join(", ") : "none yet — use `\"Unassigned\"`"}`);
  L.push("");
  L.push(`**Existing tags:** ${tags.length ? tags.map((t) => `\`${t}\``).join(", ") : "none"} — you can also introduce new ones.`);
  L.push("");
  if (modules.length) {
    L.push("**Existing modules (use the id in `moduleId`):**");
    L.push("");
    L.push("| Module id | Name |");
    L.push("|---|---|");
    modules.forEach((m) => L.push(`| \`${cell(m.id)}\` | ${cell(m.name)} |`));
  } else {
    L.push("**Existing modules:** none yet — define them in `\"modules\"` if you want to group tasks (e.g. one module per phase).");
  }
  L.push("");
  L.push(`This space currently has ${project.tasks.length} task${project.tasks.length === 1 ? "" : "s"}.`);
  L.push("");

  L.push("## 5. Task fields");
  L.push("");
  L.push("| Field | Type | Required | Meaning / allowed values |");
  L.push("|---|---|---|---|");
  const tf: [string, string, string, string][] = [
    ["id", "string", "yes", "Unique, stable id, e.g. `IMP-001`"],
    ["title", "string", "yes", "Short task name"],
    ["description", "string", "no", "Details, key deliverable, notes"],
    ["status", "string", "no", `One of: ${colIds || "—"} (default: first column)`],
    ["priority", "string", "no", "`low` · `medium` · `high` · `urgent` (default `medium`)"],
    ["assignee", "string", "no", "A member name from section 4, or `Unassigned`"],
    ["startDate", "YYYY-MM-DD", "no", "When work starts (default: dueDate, else today)"],
    ["dueDate", "YYYY-MM-DD", "no", "When it should end (default: startDate)"],
    ["deadline", "YYYY-MM-DD", "no", "Hard deadline; the task shows a **Late** flag if dueDate is after it"],
    ["estimatedHours", "number", "no", "Planned hours"],
    ["actualHours", "number", "no", "Hours already logged"],
    ["progress", "number 0–100", "no", "Completion percentage"],
    ["tags", "string[]", "no", "Labels for filtering"],
    ["moduleId", "string", "no", "Groups the task under a module (phase/subsystem)"],
    ["isMilestone", "boolean", "no", "`true` for a milestone diamond on the Gantt (give it the same start and due date)"],
    ["dependencies", "string[]", "no", "Ids of tasks that must be finished first"],
    ["checklist", "array", "no", "Definition-of-done items: `[{ \"title\": \"…\", \"completed\": false }]`"],
    ["subtasks", "array", "no", "Work steps: `[{ \"title\": \"…\", \"completed\": false }]`"],
    ["constraintType", "string", "no", "`start-no-earlier-than` · `start-no-later-than` · `must-start-on` · `finish-no-later-than` · `must-finish-on`"],
    ["constraintDate", "YYYY-MM-DD", "no", "Date used by constraintType"],
    ["recurrence", "object", "no", "`{ \"frequency\": \"daily\" | \"weekly\" | \"monthly\", \"interval\": 1 }` — completing the task creates the next one"],
  ];
  tf.forEach(([a, b, c, d]) => L.push(`| \`${a}\` | ${b} | ${c} | ${d} |`));
  L.push("");

  L.push("## 6. Module fields (optional `\"modules\"` array)");
  L.push("");
  L.push("| Field | Type | Required | Meaning / allowed values |");
  L.push("|---|---|---|---|");
  const mf: [string, string, string, string][] = [
    ["id", "string", "yes", "Unique id, e.g. `MOD-PHASE-1`; tasks point to it with `moduleId`"],
    ["name", "string", "yes", "Display name"],
    ["description", "string", "no", "What this module/phase covers"],
    ["icon", "string", "no", "One emoji, e.g. `📚`"],
    ["color", "string", "no", "Hex colour, e.g. `#6366f1`"],
    ["readiness", "string", "no", "`design` · `prototype` · `bench-test` · `integrated` · `done`"],
    ["dependsOn", "string[]", "no", "Ids of modules that come before this one"],
    ["tags", "string[]", "no", "Labels"],
  ];
  mf.forEach(([a, b, c, d]) => L.push(`| \`${a}\` | ${b} | ${c} | ${d} |`));
  L.push("");

  L.push("## 7. Tips for a good import");
  L.push("");
  L.push("- **Weekly or phased plans:** one task per week (or per deliverable), with that week's to-dos in `checklist`, and one module per phase.");
  L.push("- **Milestones:** a separate task with `\"isMilestone\": true`, the same start and due date, and `dependencies` pointing at the task that finishes it.");
  L.push("- **Items already done:** set `\"completed\": true` on the checklist item; put a task that is underway in the in-progress column.");
  L.push("- **Big plans** (hundreds of items) are fine in a single file.");
  L.push("");

  L.push("## 8. What the app does on import");
  L.push("");
  L.push("- **Merges** into the current space: new tasks are added after the existing ones, in file order.");
  L.push("- Tasks and modules whose **id already exists are skipped** (they are not updated), so re-importing is safe.");
  L.push("- Tasks without a title are **ignored**; an unknown `status` goes to the first column; an unknown `priority` becomes `medium`; missing or malformed dates default as described in section 5.");
  L.push("- New tags used by the tasks are added to the space automatically.");
  L.push("");

  L.push("## 9. Template (copy, then replace the example values)");
  L.push("");
  L.push(FENCE + "json");
  L.push(example);
  L.push(FENCE);
  L.push("");
  return L.join("\n");
}
