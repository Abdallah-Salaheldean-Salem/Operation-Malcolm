import { Task, BoardColumn, ChecklistTemplate } from "../types";

// Starter checklist templates seeded into every space the first time it loads.
// Tuned for a hardware / innovation workflow (design → prototype → test → done).
export const DEFAULT_CHECKLIST_TEMPLATES: { name: string; items: string[] }[] = [
  {
    name: "Definition of Ready",
    items: [
      "Goal is clear and written down",
      "Acceptance criteria defined",
      "Dependencies identified",
      "Assignee set",
      "Estimate added",
    ],
  },
  {
    name: "Definition of Done",
    items: [
      "Work completed and self-checked",
      "Tested / verified",
      "Documented",
      "Reviewed by a teammate",
      "Demoed or handed off",
    ],
  },
  {
    name: "Design Review",
    items: [
      "Requirements captured",
      "Schematic / design reviewed",
      "BOM finalized",
      "Risks noted",
      "Design signed off",
    ],
  },
  {
    name: "PCB / Hardware Bring-up",
    items: [
      "Visual inspection passed",
      "Power rails checked",
      "Firmware flashed",
      "Smoke test passed",
      "Functional test passed",
    ],
  },
  {
    name: "Prototype Test",
    items: [
      "Test plan written",
      "Bench setup ready",
      "Measurements recorded",
      "Results logged",
      "Next steps captured",
    ],
  },
];

// Given the current per-space template map and the list of space ids, returns
// a new map with starter templates added for any space not already present
// (a space present with an empty list is left alone), or null if nothing to do.
export function seedMissingTemplates(
  current: Record<string, ChecklistTemplate[]>,
  projectIds: string[]
): Record<string, ChecklistTemplate[]> | null {
  const missing = projectIds.filter((id) => current[id] === undefined);
  if (missing.length === 0) return null;
  const next: Record<string, ChecklistTemplate[]> = { ...current };
  missing.forEach((id) => {
    next[id] = DEFAULT_CHECKLIST_TEMPLATES.map((t, i) => ({
      id: `tpl-seed-${id}-${i}`,
      name: t.name,
      items: [...t.items],
    }));
  });
  return next;
}

// True when a task has at least one checklist item and every one is completed.
export function isChecklistComplete(task: Pick<Task, "checklist">): boolean {
  const items = task.checklist || [];
  return items.length > 0 && items.every((s) => s.completed);
}

// Definition-of-Done gate. Returns null when a task is allowed to enter the
// target column, or a human-readable reason when the move should be blocked.
export function checkDoneGate(
  task: Pick<Task, "checklist">,
  targetColumn: BoardColumn | undefined
): string | null {
  if (!targetColumn?.requireChecklist) return null;
  const items = task.checklist || [];
  if (items.length === 0) {
    return `“${targetColumn.title}” needs a completed checklist first. Add checklist items and tick them all off.`;
  }
  const remaining = items.filter((s) => !s.completed).length;
  if (remaining > 0) {
    return `“${targetColumn.title}” requires all ${items.length} checklist item${
      items.length === 1 ? "" : "s"
    } done — ${remaining} still open.`;
  }
  return null;
}
