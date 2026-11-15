import React from "react";
import { ProjectModule } from "../types";

// Small neutral chip naming a task's module. The colour sits in the dot only,
// so the text stays readable in light and dark.
export default function ModuleChip({ module, className = "" }: { module?: ProjectModule; className?: string }) {
  if (!module) return null;
  return (
    <span
      data-testid="module-chip"
      title={`Module: ${module.name}`}
      className={`inline-flex items-center gap-1 max-w-[9rem] shrink-0 px-1.5 py-px rounded border text-[10px] font-semibold leading-4 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 ${className}`}
    >
      {module.icon ? (
        <span className="shrink-0">{module.icon}</span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: module.color || "#6366f1" }} />
      )}
      <span className="truncate">{module.name}</span>
    </span>
  );
}
