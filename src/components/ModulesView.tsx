import React, { useState } from "react";
import { Project, Task, ProjectModule, SmartGoal, ModuleReadiness } from "../types";
import { MODULE_READINESS } from "../data";
import {
  Target,
  Boxes,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  Link2,
  Tag as TagIcon,
  Calendar,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";

interface ModulesViewProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
  onOpenTaskModal: (task: Task | null, defaultColumnId?: string) => void;
}

const MODULE_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#ec4899", "#8b5cf6"];
const MODULE_ICONS = ["🔌", "🔨", "🧱", "💻", "🛡️", "📡", "⚙️", "🔋", "🧠", "🚀"];
const UNASSIGNED = "__unassigned__";

// Progress ring
function Ring({ value, color, size = 46 }: { value: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={5} className="stroke-slate-200 dark:stroke-slate-800" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={5} stroke={color} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-700 dark:text-slate-200">
        {value}%
      </span>
    </div>
  );
}

export default function ModulesView({ project, onUpdateProject, onOpenTaskModal }: ModulesViewProps) {
  const [groupBy, setGroupBy] = useState<"modules" | "tags">("modules");
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<ProjectModule | "new" | null>(null);
  const [editingGoal, setEditingGoal] = useState<SmartGoal | "new" | null>(null);

  const modules = project.modules || [];
  const goals = project.goals || [];
  const memberNames = ["Unassigned", ...(project.members?.map((m) => m.name) || [])];

  // --- persistence helpers ---
  const setModules = (mods: ProjectModule[]) => onUpdateProject({ ...project, modules: mods });
  const setGoals = (gs: SmartGoal[]) => onUpdateProject({ ...project, goals: gs });

  // --- task → module resolution (explicit id, else matched by tag name) ---
  const moduleByTag = (task: Task) => {
    const tags = (task.tags || []).map((t) => t.toLowerCase());
    return modules.find((m) => tags.includes(m.name.toLowerCase()));
  };
  const effModuleId = (task: Task): string | undefined =>
    task.moduleId && modules.some((m) => m.id === task.moduleId) ? task.moduleId : moduleByTag(task)?.id;

  const statusGroupOf = (task: Task): "done" | "blocked" | "inProgress" | "notStarted" => {
    const col = project.columns.find((c) => c.id === task.status);
    const t = (col ? col.title : task.status).toLowerCase();
    if (t.includes("done") || t.includes("complete") || t.includes("finish")) return "done";
    if (t.includes("block") || t.includes("hold")) return "blocked";
    if (t.includes("progress") || t.includes("going") || t.includes("active")) return "inProgress";
    return "notStarted";
  };

  const tasksOfModule = (id: string) =>
    id === UNASSIGNED ? project.tasks.filter((t) => !effModuleId(t)) : project.tasks.filter((t) => effModuleId(t) === id);

  const moduleStats = (id: string) => {
    const ts = tasksOfModule(id);
    const counts = { done: 0, blocked: 0, inProgress: 0, notStarted: 0 };
    ts.forEach((t) => counts[statusGroupOf(t)]++);
    const progress = ts.length ? Math.round((counts.done / ts.length) * 100) : 0;
    const est = ts.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
    const act = ts.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    return { total: ts.length, counts, progress, est, act };
  };

  const readinessMeta = (r?: ModuleReadiness) => MODULE_READINESS.find((s) => s.value === r) || MODULE_READINESS[0];
  const readinessIndex = (r?: ModuleReadiness) => Math.max(0, MODULE_READINESS.findIndex((s) => s.value === r));
  // A dependency is "satisfied" once it reaches integrated or done.
  const depSatisfied = (m: ProjectModule) => readinessIndex(m.readiness) >= readinessIndex("integrated");

  // --- module CRUD ---
  const saveModule = (mod: ProjectModule) => {
    const exists = modules.some((m) => m.id === mod.id);
    const updatedModules = exists ? modules.map((m) => (m.id === mod.id ? mod : m)) : [...modules, mod];
    const combinedTags = Array.from(new Set([...(project.tags || []), ...(mod.tags || [])]));
    
    let updatedGoals = project.goals || [];
    if (!exists && selectedGoalId) {
      updatedGoals = updatedGoals.map(g => 
        g.id === selectedGoalId 
          ? { ...g, moduleIds: [...(g.moduleIds || []), mod.id] } 
          : g
      );
    }

    onUpdateProject({ ...project, modules: updatedModules, tags: combinedTags, goals: updatedGoals });
    setEditingModule(null);
  };
  const deleteModule = (id: string) => {
    const updatedTasks = project.tasks.map((t) => (t.moduleId === id ? { ...t, moduleId: undefined } : t));
    onUpdateProject({
      ...project,
      modules: modules.filter((m) => m.id !== id).map((m) => ({ ...m, dependsOn: (m.dependsOn || []).filter((d) => d !== id) })),
      tasks: updatedTasks,
    });
    if (selectedModuleId === id) setSelectedModuleId(null);
  };
  const assignTask = (taskId: string, moduleId: string | null) => {
    onUpdateProject({
      ...project,
      tasks: project.tasks.map((t) => (t.id === taskId ? { ...t, moduleId: moduleId || undefined } : t)),
    });
  };

  // --- goal CRUD ---
  const saveGoal = (g: SmartGoal) => {
    const exists = goals.some((x) => x.id === g.id);
    const updatedGoals = exists ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g];
    const combinedTags = Array.from(new Set([...(project.tags || []), ...(g.tags || [])]));
    onUpdateProject({ ...project, goals: updatedGoals, tags: combinedTags });
    setEditingGoal(null);
  };
  const deleteGoal = (id: string) => {
    const goalToDelete = goals.find((g) => g.id === id);
    if (!goalToDelete) return;

    const moduleIdsToDelete = goalToDelete.moduleIds || [];
    const tagsToDelete = goalToDelete.tags || [];

    const updatedGoals = goals.filter((g) => g.id !== id);
    const updatedModules = modules
      .filter((m) => !moduleIdsToDelete.includes(m.id))
      .map((m) => ({
        ...m,
        dependsOn: (m.dependsOn || []).filter((d) => !moduleIdsToDelete.includes(d)),
      }));

    const remainingTags = (project.tags || []).filter((t) => !tagsToDelete.includes(t));
    const updatedTasks = project.tasks.map((t) =>
      t.moduleId && moduleIdsToDelete.includes(t.moduleId) ? { ...t, moduleId: undefined } : t
    );

    onUpdateProject({
      ...project,
      goals: updatedGoals,
      modules: updatedModules,
      tags: remainingTags,
      tasks: updatedTasks,
    });

    if (selectedGoalId === id) setSelectedGoalId(null);
  };



  const tagStats = (tag: string) => {
    const ts = project.tasks.filter((t) => (t.tags || []).includes(tag));
    const counts = { done: 0, blocked: 0, inProgress: 0, notStarted: 0 };
    ts.forEach((t) => counts[statusGroupOf(t)]++);
    const progress = ts.length ? Math.round((counts.done / ts.length) * 100) : 0;
    const est = ts.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
    return { total: ts.length, counts, progress, est };
  };

  const drillTasks = selectedModuleId ? tasksOfModule(selectedModuleId) : [];
  const selectedModule = modules.find((m) => m.id === selectedModuleId);

  const selectedGoal = selectedGoalId ? goals.find((g) => g.id === selectedGoalId) : null;
  const filteredModules = selectedGoal 
    ? modules.filter((m) => (selectedGoal.moduleIds || []).includes(m.id) || (selectedGoal.tags && m.tags && selectedGoal.tags.some(t => m.tags?.includes(t))))
    : modules;
  const filteredTags = selectedGoal
    ? (project.tags || []).filter(t => (selectedGoal.tags || []).includes(t) || filteredModules.some(m => (m.tags || []).includes(t)))
    : (project.tags || []);

  return (
    <div id="modules-view-root" className="flex flex-col h-full flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0F1115] p-4 md:p-6 space-y-6 select-none">
      {/* ============ SMART GOALS SECTION ============ */}
      <section id="smart-goals-section">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Target className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">SMART Goals</h2>
            <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
              Specific · Measurable · Achievable · Relevant · Time-bound
            </span>
          </div>
          <button
            id="add-goal-btn"
            onClick={() => setEditingGoal("new")}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Goal</span>
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No goals yet. Define a SMART goal to steer this project.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {goals.map((g) => {
              const linkedModules = (g.moduleIds || []).map(id => modules.find(m => m.id === id)).filter(Boolean) as ProjectModule[];
              const overdue = g.timeBound && new Date(g.timeBound) < new Date() && (g.progress || 0) < 100;
              const smartRows: [string, string, string][] = [
                ["S", "Specific", g.specific],
                ["M", "Measurable", g.measurable],
                ["A", "Achievable", g.achievable],
                ["R", "Relevant", g.relevant],
              ];
              const isGoalSelected = selectedGoalId === g.id;
              return (
                <div 
                  key={g.id} 
                  id={`goal-card-${g.id}`} 
                  onClick={() => setSelectedGoalId(isGoalSelected ? null : g.id)}
                  className={`bg-white dark:bg-[#14171C] border rounded-xl p-4 shadow-sm flex flex-col cursor-pointer transition-all ${
                    isGoalSelected ? "border-indigo-500 ring-1 ring-indigo-500/30" : "border-slate-200 dark:border-[#1E222B] hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{g.title}</h3>
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingGoal(g); }} title="Edit goal" className="p-1 text-slate-400 hover:text-indigo-500 rounded cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteGoal(g.id); }} title="Delete goal" className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* SMART rows */}
                  <div className="space-y-1.5 mb-3">
                    {smartRows.map(([letter, label, val]) => (
                      <div key={letter} className="flex items-start space-x-2 text-[11px]">
                        <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center font-black text-[9px] bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20" title={label}>
                          {letter}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 leading-relaxed">{val || <em className="text-slate-400">—</em>}</span>
                      </div>
                    ))}
                    <div className="flex items-center space-x-2 text-[11px]">
                      <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center font-black text-[9px] border ${overdue ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20"}`} title="Time-bound">
                        T
                      </span>
                      <span className={`flex items-center gap-1 ${overdue ? "text-rose-500 dark:text-rose-400 font-semibold" : "text-slate-600 dark:text-slate-300"}`}>
                        <Calendar className="w-3 h-3" />
                        {g.timeBound || "No date"} {overdue && "(overdue)"}
                      </span>
                      {linkedModules.length > 0 && (
                        <span className="ml-auto flex items-center gap-1">
                          {linkedModules.map(linked => (
                            <span key={linked.id} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border" style={{ color: linked.color, borderColor: `${linked.color}55`, backgroundColor: `${linked.color}12` }}>
                              {linked.icon} {linked.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {(g.tags || []).map(t => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          #{t}
                        </span>
                      ))}
                      <button onClick={() => setEditingGoal(g)} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30 cursor-pointer">
                        <Plus className="w-2.5 h-2.5" /> Add Tag
                      </button>
                    </div>
                  </div>

                  {/* progress */}
                  <div className="mt-auto">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      <span className="uppercase tracking-wider">Progress</span>
                      <span className="text-slate-700 dark:text-slate-200">{g.progress || 0}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={g.progress || 0}
                      onChange={(e) => saveGoal({ ...g, progress: Number(e.target.value) })}
                      className="w-full accent-indigo-600 cursor-pointer h-1.5"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ MODULES / TAGS BREAKDOWN ============ */}
      <section id="modules-section">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <Boxes className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">System Modules</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* group-by toggle */}
            <div className="flex items-center bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
              {(["modules", "tags"] as const).map((mode) => (
                <button
                  key={mode}
                  id={`groupby-${mode}`}
                  onClick={() => setGroupBy(mode)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold capitalize cursor-pointer transition-colors ${
                    groupBy === mode ? "bg-indigo-600 text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {mode === "modules" ? "By Module" : "By Tag"}
                </button>
              ))}
            </div>
            {groupBy === "modules" && (
              <button
                id="add-module-btn"
                onClick={() => setEditingModule("new")}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Module</span>
              </button>
            )}
            {groupBy === "tags" && (
              <button
                id="add-tag-btn"
                onClick={() => setAddingTag(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tag</span>
              </button>
            )}
          </div>
        </div>

        {groupBy === "modules" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredModules.map((m) => {
                const st = moduleStats(m.id);
                const rm = readinessMeta(m.readiness);
                const rIdx = readinessIndex(m.readiness);
                const deps = (m.dependsOn || []).map((d) => modules.find((x) => x.id === d)).filter(Boolean) as ProjectModule[];
                const blockingDeps = deps.filter((d) => !depSatisfied(d));
                const isOpen = selectedModuleId === m.id;
                return (
                  <div
                    key={m.id}
                    id={`module-card-${m.id}`}
                    className={`bg-white dark:bg-[#14171C] border rounded-xl p-4 shadow-sm flex flex-col cursor-pointer transition-all ${
                      isOpen ? "border-indigo-500 ring-1 ring-indigo-500/30" : "border-slate-200 dark:border-[#1E222B] hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                    onClick={() => setSelectedModuleId(isOpen ? null : m.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl flex-shrink-0" style={{ filter: "saturate(1.1)" }}>{m.icon || "🧩"}</span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.name}</h3>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">{m.owner || "Unassigned"} · {st.total} tasks</span>
                            {(m.tags || []).map(t => (
                              <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 leading-none border border-slate-200 dark:border-slate-700/50">
                                #{t}
                              </span>
                            ))}
                            <button onClick={(e) => { e.stopPropagation(); setEditingModule(m); }} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-500/30 cursor-pointer ml-1">
                              <Plus className="w-2.5 h-2.5" /> Add Tag
                            </button>
                          </div>
                        </div>
                      </div>
                      <Ring value={st.progress} color={m.color || "#6366f1"} />
                    </div>

                    {/* readiness stepper */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Readiness</span>
                        <span className="text-[10px] font-bold" style={{ color: rm.color }}>{rm.label}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {MODULE_READINESS.map((s, i) => (
                          <div
                            key={s.value}
                            className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-800"
                            style={i <= rIdx ? { backgroundColor: rm.color } : undefined}
                            title={s.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* status mini-counts */}
                    <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
                      {[
                        ["To do", st.counts.notStarted, "text-slate-500 dark:text-slate-400"],
                        ["Doing", st.counts.inProgress, "text-blue-500 dark:text-blue-400"],
                        ["Block", st.counts.blocked, "text-rose-500 dark:text-rose-400"],
                        ["Done", st.counts.done, "text-emerald-500 dark:text-emerald-400"],
                      ].map(([label, n, cls]) => (
                        <div key={label as string} className="bg-slate-50 dark:bg-[#0F1115] rounded-lg py-1.5 border border-slate-100 dark:border-slate-800/60">
                          <div className={`text-sm font-black ${cls}`}>{n as number}</div>
                          <div className="text-[8px] font-bold uppercase text-slate-400 dark:text-slate-500">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* footer: hours + deps + actions */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{st.act}h / {st.est}h</span>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setEditingModule(m)} title="Edit module" className="p-1 text-slate-400 hover:text-indigo-500 rounded cursor-pointer">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteModule(m.id)} title="Delete module" className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {deps.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <Link2 className="w-3 h-3 text-slate-400" />
                        {deps.map((d) => {
                          const blocked = !depSatisfied(d);
                          return (
                            <span
                              key={d.id}
                              className={`text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                                blocked ? "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              }`}
                              title={blocked ? `Waiting on ${d.name} (not yet integrated)` : `${d.name} is ready`}
                            >
                              {blocked && <AlertTriangle className="w-2.5 h-2.5" />}
                              {d.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {blockingDeps.length > 0 && (
                      <div className="mt-1.5 text-[9px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wide">
                        Blocked by {blockingDeps.length} dependenc{blockingDeps.length === 1 ? "y" : "ies"}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned bucket */}
              {(() => {
                const st = moduleStats(UNASSIGNED);
                if (st.total === 0) return null;
                const isOpen = selectedModuleId === UNASSIGNED;
                return (
                  <div
                    id="module-card-unassigned"
                    onClick={() => setSelectedModuleId(isOpen ? null : UNASSIGNED)}
                    className={`bg-slate-50 dark:bg-[#0F1115] border border-dashed rounded-xl p-4 flex flex-col justify-center cursor-pointer ${
                      isOpen ? "border-indigo-500 ring-1 ring-indigo-500/30" : "border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📥</span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Unassigned</h3>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">{st.total} tasks with no module</span>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                );
              })()}
            </div>

            {filteredModules.length === 0 && (
              <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {modules.length === 0 
                  ? "No modules yet. Add a module to break this project into subsystems — tasks auto-classify by matching tag until you assign them."
                  : "No modules found matching this goal's tags or explicitly linked modules."}
              </div>
            )}

            {/* Drill-down task list */}
            {selectedModuleId && (
              <div id="module-drilldown" className="mt-4 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#0F1115] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    {selectedModuleId === UNASSIGNED ? "📥 Unassigned tasks" : `${selectedModule?.icon || "🧩"} ${selectedModule?.name} — tasks`}
                    <span className="text-slate-400 font-normal">({drillTasks.length})</span>
                  </h4>
                  <button onClick={() => setSelectedModuleId(null)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-80 overflow-y-auto">
                  {drillTasks.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No tasks here yet.</div>
                  ) : (
                    drillTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-[#1C1F26]/40 text-xs">
                        <button onClick={() => onOpenTaskModal(t)} className="flex-1 min-w-0 text-left truncate text-slate-700 dark:text-slate-300 hover:text-indigo-500 font-medium cursor-pointer">
                          {t.title}
                        </button>
                        <span className="text-[9px] font-bold uppercase text-slate-400 flex-shrink-0">{statusGroupOf(t)}</span>
                        <select
                          value={effModuleId(t) || ""}
                          onChange={(e) => assignTask(t.id, e.target.value || null)}
                          className="text-[10px] bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer flex-shrink-0"
                          title="Reassign module"
                        >
                          <option value="">Unassigned</option>
                          {modules.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ---- Tag grouping (read-only) ---- */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTags.map((tag) => {
              const st = tagStats(tag);
              return (
                <div key={tag} className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TagIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{tag}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{st.total} tasks</span>
                        <button 
                          onClick={() => {
                            onUpdateProject({
                              ...project,
                              tags: (project.tags || []).filter(t => t !== tag)
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors cursor-pointer"
                          title="Remove tag"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2.5 w-full bg-slate-100 dark:bg-[#0F1115] rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${st.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{st.progress}% done</span>
                      <span className="flex items-center gap-2">
                        <span className="text-blue-500 dark:text-blue-400">{st.counts.inProgress} doing</span>
                        <span className="text-rose-500 dark:text-rose-400">{st.counts.blocked} blocked</span>
                        <span className="font-mono">{st.est}h</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredTags.length === 0 && (
              <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400 col-span-full">
                This project has no tags to group by.
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============ MODULE EDITOR MODAL ============ */}
      {editingModule && (
        <ModuleEditor
          initial={editingModule === "new" ? null : editingModule}
          modules={modules}
          memberNames={memberNames}
          onCancel={() => setEditingModule(null)}
          onSave={saveModule}
        />
      )}

      {/* ============ GOAL EDITOR MODAL ============ */}
      {editingGoal && (
        <GoalEditor
          initial={editingGoal === "new" ? null : editingGoal}
          modules={modules}
          onCancel={() => setEditingGoal(null)}
          onSave={saveGoal}
        />
      )}

      {/* ============ ADD TAG MODAL ============ */}
      {addingTag && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setAddingTag(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">New Tag</h3>
              <button onClick={() => setAddingTag(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Tag Name</label>
              <input 
                autoFocus
                value={newTagInput} 
                onChange={(e) => setNewTagInput(e.target.value)} 
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') { 
                    e.preventDefault();
                    const tag = newTagInput.trim();
                    if (tag) {
                      const currentTags = project.tags || [];
                      const newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
                      
                      let updatedGoals = project.goals || [];
                      if (selectedGoalId) {
                        updatedGoals = updatedGoals.map(g => 
                          g.id === selectedGoalId && !(g.tags || []).includes(tag)
                            ? { ...g, tags: [...(g.tags || []), tag] }
                            : g
                        );
                      }
                      
                      onUpdateProject({ ...project, tags: newTags, goals: updatedGoals });
                    }
                    setAddingTag(false);
                    setNewTagInput("");
                  } 
                }}
                placeholder="e.g. Firmware" 
                className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 text-xs" 
              />
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-[#0F1115]/50">
              <button onClick={() => setAddingTag(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1C1F26] text-slate-600 dark:text-slate-300 cursor-pointer">Cancel</button>
              <button 
                onClick={() => {
                  const tag = newTagInput.trim();
                  if (tag) {
                    const currentTags = project.tags || [];
                    const newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
                    
                    let updatedGoals = project.goals || [];
                    if (selectedGoalId) {
                      updatedGoals = updatedGoals.map(g => 
                        g.id === selectedGoalId && !(g.tags || []).includes(tag)
                          ? { ...g, tags: [...(g.tags || []), tag] }
                          : g
                      );
                    }
                    
                    onUpdateProject({ ...project, tags: newTags, goals: updatedGoals });
                  }
                  setAddingTag(false);
                  setNewTagInput("");
                }} 
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Module editor ---------------- */
function ModuleEditor({
  initial,
  modules,
  memberNames,
  onCancel,
  onSave,
}: {
  initial: ProjectModule | null;
  modules: ProjectModule[];
  memberNames: string[];
  onCancel: () => void;
  onSave: (m: ProjectModule) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [icon, setIcon] = useState(initial?.icon || MODULE_ICONS[0]);
  const [color, setColor] = useState(initial?.color || MODULE_COLORS[0]);
  const [owner, setOwner] = useState(initial?.owner || "Unassigned");
  const [readiness, setReadiness] = useState<ModuleReadiness>(initial?.readiness || "design");
  const [dependsOn, setDependsOn] = useState<string[]>(initial?.dependsOn || []);
  const [description, setDescription] = useState(initial?.description || "");
  const [tags, setTags] = useState<string[]>(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (t: string) => {
    setTags(tags.filter(tag => tag !== t));
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || `mod-${Date.now()}`,
      name: name.trim(),
      icon,
      color,
      owner: owner === "Unassigned" ? undefined : owner,
      readiness,
      dependsOn,
      description: description.trim() || undefined,
      tags,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl w-full max-w-lg shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{initial ? "Edit Module" : "New Module"}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Module Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Power System" className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Icon</label>
              <div className="flex flex-wrap gap-1">
                {MODULE_ICONS.map((ic) => (
                  <button key={ic} type="button" onClick={() => setIcon(ic)} className={`w-7 h-7 rounded-md flex items-center justify-center text-sm cursor-pointer ${icon === ic ? "bg-indigo-500/15 ring-1 ring-indigo-500/40" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{ic}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} className={`w-5 h-5 rounded-full cursor-pointer ${color === c ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#14171C] ring-slate-400" : ""}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Owner</label>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                {memberNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Readiness</label>
              <select value={readiness} onChange={(e) => setReadiness(e.target.value as ModuleReadiness)} className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer">
                {MODULE_READINESS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {modules.filter((m) => m.id !== initial?.id).length > 0 && (
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Depends on</label>
              <div className="flex flex-wrap gap-1.5">
                {modules.filter((m) => m.id !== initial?.id).map((m) => {
                  const on = dependsOn.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => setDependsOn(on ? dependsOn.filter((d) => d !== m.id) : [...dependsOn, m.id])} className={`px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer ${on ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-500 dark:text-indigo-400" : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"}`}>
                      {m.icon} {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Tags</label>
            <div className="flex flex-col gap-2">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      #{t}
                      <button type="button" onClick={() => removeTag(t)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input 
                  value={tagInput} 
                  onChange={(e) => setTagInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag..." 
                  className="flex-1 bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 text-xs" 
                />
                <button type="button" onClick={addTag} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1C1F26] hover:bg-slate-200 dark:hover:bg-[#2A2F3A] text-slate-600 dark:text-slate-300 cursor-pointer border border-slate-200 dark:border-slate-800">
                  Add
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1C1F26] text-slate-600 dark:text-slate-300 cursor-pointer">Cancel</button>
          <button onClick={submit} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer">{initial ? "Save" : "Create Module"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Goal editor ---------------- */
function GoalEditor({
  initial,
  modules,
  onCancel,
  onSave,
}: {
  initial: SmartGoal | null;
  modules: ProjectModule[];
  onCancel: () => void;
  onSave: (g: SmartGoal) => void;
}) {
  const [g, setG] = useState<SmartGoal>(
    initial || { id: `goal-${Date.now()}`, title: "", specific: "", measurable: "", achievable: "", relevant: "", timeBound: "", progress: 0, tags: [] }
  );
  const [tagInput, setTagInput] = useState("");
  
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !(g.tags || []).includes(t)) {
      set({ tags: [...(g.tags || []), t] });
    }
    setTagInput("");
  };

  const removeTag = (t: string) => {
    set({ tags: (g.tags || []).filter(tag => tag !== t) });
  };
  const set = (patch: Partial<SmartGoal>) => setG((prev) => ({ ...prev, ...patch }));
  const fields: [keyof SmartGoal, string, string, string][] = [
    ["specific", "S — Specific", "What exactly will be accomplished?", "specific"],
    ["measurable", "M — Measurable", "How is success measured / defined as done?", "measurable"],
    ["achievable", "A — Achievable", "Is it realistic? With what resources?", "achievable"],
    ["relevant", "R — Relevant", "Why does this matter to the project?", "relevant"],
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl w-full max-w-lg shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{initial ? "Edit SMART Goal" : "New SMART Goal"}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Goal statement</label>
            <input value={g.title} onChange={(e) => set({ title: e.target.value })} autoFocus placeholder="e.g. Deliver a working demo build" className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500" />
          </div>
          {fields.map(([key, label, ph]) => (
            <div key={key as string}>
              <label className="block font-bold text-[10px] uppercase text-indigo-500 dark:text-indigo-400 mb-1.5">{label}</label>
              <textarea value={(g[key] as string) || ""} onChange={(e) => set({ [key]: e.target.value } as Partial<SmartGoal>)} rows={2} placeholder={ph} className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-[10px] uppercase text-indigo-500 dark:text-indigo-400 mb-1.5">T — Time-bound</label>
              <input type="date" value={g.timeBound} onChange={(e) => set({ timeBound: e.target.value })} className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Linked Modules</label>
              <div className="flex flex-wrap gap-1">
                {modules.map((m) => {
                  const isLinked = (g.moduleIds || []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        const current = g.moduleIds || [];
                        set({ moduleIds: isLinked ? current.filter(id => id !== m.id) : [...current, m.id] });
                      }}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                        isLinked
                          ? "bg-indigo-600 text-white border-indigo-700"
                          : "bg-slate-50 dark:bg-[#0F1115] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {m.icon} {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <label className="block font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">Tags</label>
            <div className="flex flex-col gap-2">
              {(g.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(g.tags || []).map(t => (
                    <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      #{t}
                      <button type="button" onClick={() => removeTag(t)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input 
                  value={tagInput} 
                  onChange={(e) => setTagInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag..." 
                  className="flex-1 bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 text-xs" 
                />
                <button type="button" onClick={addTag} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1C1F26] hover:bg-slate-200 dark:hover:bg-[#2A2F3A] text-slate-600 dark:text-slate-300 cursor-pointer border border-slate-200 dark:border-slate-800">
                  Add
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="flex items-center justify-between font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Progress</span><span className="text-slate-700 dark:text-slate-200">{g.progress || 0}%</span>
            </label>
            <input type="range" min={0} max={100} value={g.progress || 0} onChange={(e) => set({ progress: Number(e.target.value) })} className="w-full accent-indigo-600 cursor-pointer h-1.5" />
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-[#1C1F26] text-slate-600 dark:text-slate-300 cursor-pointer">Cancel</button>
          <button onClick={() => g.title.trim() && onSave(g)} className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer">{initial ? "Save" : "Create Goal"}</button>
        </div>
      </div>
    </div>
  );
}
