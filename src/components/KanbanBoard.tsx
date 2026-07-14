import React, { useState } from "react";
import { Project, Task, BoardColumn, TaskPriority } from "../types";
import { PRIORITIES } from "../data";
import {
  Plus,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Calendar,
  CheckSquare,
  MessageSquare,
  Users,
  Search,
  Filter,
  RefreshCw,
  Palette,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Activity,
  LayoutList,
  BarChart2,
  Info,
  Clock,
} from "lucide-react";

interface KanbanBoardProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
  onOpenTaskModal: (task: Task | null, defaultColumnId?: string) => void;
  globalSearch?: string;
  globalPriority?: string;
  globalAssignee?: string;
  globalStatus?: string;
}

export default function KanbanBoard({
  project,
  onUpdateProject,
  onOpenTaskModal,
  globalSearch,
  globalPriority,
  globalAssignee,
  globalStatus,
}: KanbanBoardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const [activeMenuColumn, setActiveMenuColumn] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnEditTitle, setColumnEditTitle] = useState("");

  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Pivot Summary Dashboard State
  const [layoutMode, setLayoutMode] = useState<"pivot" | "kanban">("kanban");
  const [selectedPivotCell, setSelectedPivotCell] = useState<{
    assignee: string;
    statusGroup: "Not Started" | "In Progress" | "Blocked" | "Completed" | "all";
  } | null>(null);

  // Classify column IDs into standardized Status Groups
  const getStatusGroup = (statusId: string): "Not Started" | "In Progress" | "Blocked" | "Completed" => {
    const col = project.columns.find((c) => c.id === statusId);
    const title = (col ? col.title : statusId).toLowerCase();
    
    if (title.includes("block") || title.includes("hold")) return "Blocked";
    if (title.includes("done") || title.includes("complete") || title.includes("finish")) return "Completed";
    if (title.includes("progress") || title.includes("going") || title.includes("active")) return "In Progress";
    return "Not Started";
  };

  const presetColors = ["#64748b", "#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#a855f7"];

  const activeSearch = globalSearch !== undefined ? globalSearch : searchTerm;
  const activePriority = globalPriority !== undefined ? globalPriority : priorityFilter;
  const activeAssignee = globalAssignee !== undefined ? globalAssignee : assigneeFilter;

  // Filter tasks
  const filteredTasks = project.tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(activeSearch.toLowerCase()) ||
      task.description.toLowerCase().includes(activeSearch.toLowerCase()) ||
      task.id.toLowerCase().includes(activeSearch.toLowerCase());
    const matchesPriority = activePriority === "all" || task.priority === activePriority;
    const matchesAssignee = activeAssignee === "all" || task.assignee === activeAssignee;
    const matchesStatus = globalStatus === undefined || globalStatus === "all" || task.status === globalStatus;
    return matchesSearch && matchesPriority && matchesAssignee && matchesStatus;
  });

  // Helper calculations for high-level pivot dashboard
  const totalTasksCount = filteredTasks.length;
  const completedTasksCount = filteredTasks.filter((t) => getStatusGroup(t.status) === "Completed").length;
  const inProgressTasksCount = filteredTasks.filter((t) => getStatusGroup(t.status) === "In Progress").length;
  const blockedTasksCount = filteredTasks.filter((t) => getStatusGroup(t.status) === "Blocked").length;

  const allUniqueAssignees = Array.from(
    new Set([
      "Unassigned",
      ...(project.members?.map((m) => m.name) || ["Abdallah", "Sallam", "Alice", "Bob", "Charlie", "Diana"]),
      ...project.tasks.map((t) => t.assignee).filter(Boolean),
    ])
  );
  
  const sortedAssignees = [...allUniqueAssignees].sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    if (a === "Abdallah") return -1;
    if (b === "Abdallah") return 1;
    if (a === "Sallam") return -1;
    if (b === "Sallam") return 1;
    return a.localeCompare(b);
  });

  const getRowTasks = (assignee: string) => {
    return filteredTasks.filter((t) => (t.assignee || "Unassigned") === assignee);
  };

  const getTasksByCell = (assignee: string, statusGroup: "Not Started" | "In Progress" | "Blocked" | "Completed") => {
    return filteredTasks.filter((t) => {
      const taskAssignee = t.assignee || "Unassigned";
      if (taskAssignee !== assignee) return false;
      const taskStatusGroup = getStatusGroup(t.status);
      return taskStatusGroup === statusGroup;
    });
  };

  const getColTasks = (statusGroup: "Not Started" | "In Progress" | "Blocked" | "Completed") => {
    return filteredTasks.filter((t) => getStatusGroup(t.status) === statusGroup);
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const updatedTasks = project.tasks.map((t) =>
      t.id === taskId ? { ...t, status: columnId } : t
    );
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  // Move task via click transfer (fallback & accessibility)
  const handleMoveTask = (taskId: string, targetColId: string) => {
    const updatedTasks = project.tasks.map((t) =>
      t.id === taskId ? { ...t, status: targetColId } : t
    );
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  const handleDeleteTask = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    const updatedTasks = project.tasks.filter((t) => t.id !== taskId);
    onUpdateProject({ ...project, tasks: updatedTasks });
  };

  // Add Column
  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColumnName.trim()) return;

    const newCol: BoardColumn = {
      id: `col-${Date.now()}`,
      title: newColumnName.trim(),
      color: presetColors[project.columns.length % presetColors.length],
    };

    onUpdateProject({
      ...project,
      columns: [...project.columns, newCol],
    });

    setNewColumnName("");
    setIsAddingColumn(false);
  };

  // Delete Column
  const handleDeleteColumn = (columnId: string) => {
    // Reassign tasks in this column to the first column, or delete them if no column left
    const remainingColumns = project.columns.filter((col) => col.id !== columnId);
    if (remainingColumns.length === 0) return;

    const fallbackColId = remainingColumns[0].id;
    const updatedTasks = project.tasks.map((t) =>
      t.status === columnId ? { ...t, status: fallbackColId } : t
    );

    onUpdateProject({
      ...project,
      columns: remainingColumns,
      tasks: updatedTasks,
    });
    setActiveMenuColumn(null);
  };

  // Rename Column
  const startRenameColumn = (col: BoardColumn) => {
    setEditingColumnId(col.id);
    setColumnEditTitle(col.title);
    setActiveMenuColumn(null);
  };

  const saveRenameColumn = (columnId: string) => {
    if (!columnEditTitle.trim()) return;
    const updatedCols = project.columns.map((col) =>
      col.id === columnId ? { ...col, title: columnEditTitle.trim() } : col
    );
    onUpdateProject({ ...project, columns: updatedCols });
    setEditingColumnId(null);
  };

  // Reorder Column Position
  const handleMoveColumn = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= project.columns.length) return;

    const updatedCols = [...project.columns];
    const temp = updatedCols[index];
    updatedCols[index] = updatedCols[targetIndex];
    updatedCols[targetIndex] = temp;

    onUpdateProject({ ...project, columns: updatedCols });
  };

  // Change Column Color preset
  const handleSetColumnColor = (columnId: string, color: string) => {
    const updatedCols = project.columns.map((col) =>
      col.id === columnId ? { ...col, color } : col
    );
    onUpdateProject({ ...project, columns: updatedCols });
    setActiveMenuColumn(null);
  };

  // Retrieve unique assignees list in this project for filtering
  const projectAssignees = Array.from(new Set(project.tasks.map((t) => t.assignee || "Unassigned")));

  return (
    <div id="kanban-view-root" className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115] flex-1">
      {/* Board Top Toolbar */}
      <div id="kanban-toolbar" className="p-4 bg-slate-50 dark:bg-[#0F1115] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
<div />

        {/* Action button */}
        <div className="flex items-center space-x-3">
          {/* Layout Mode Switcher */}
          <div className="flex items-center bg-white dark:bg-[#14171C]/60 p-1 border border-slate-200 dark:border-slate-800 rounded-xl">
            <button
              id="switch-to-pivot-btn"
              type="button"
              onClick={() => {
                setLayoutMode("pivot");
                setSelectedPivotCell(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                layoutMode === "pivot"
                  ? "bg-indigo-600 text-slate-900 dark:text-white shadow-sm font-extrabold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Pivot Summary</span>
            </button>
            <button
              id="switch-to-kanban-btn"
              type="button"
              onClick={() => setLayoutMode("kanban")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                layoutMode === "kanban"
                  ? "bg-indigo-600 text-slate-900 dark:text-white shadow-sm font-extrabold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
          </div>

          <button
            id="kanban-add-column-btn"
            onClick={() => setIsAddingColumn(!isAddingColumn)}
            className="px-3.5 py-1.5 bg-slate-50 dark:bg-[#1C1F26] hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Status</span>
          </button>
          <button
            id="kanban-add-task-btn"
            onClick={() => onOpenTaskModal(null)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Add Column input drawer */}
      {isAddingColumn && (
        <div id="add-column-panel" className="bg-white dark:bg-[#17191E] p-3 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3 animate-fade-in">
          <form onSubmit={handleAddColumn} className="flex items-center space-x-2">
            <input
              id="new-column-name-input"
              type="text"
              placeholder="Enter status name (e.g. In Review)"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              className="bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              required
            />
            <button
              id="submit-add-column"
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Add Column
            </button>
            <button
              id="cancel-add-column"
              type="button"
              onClick={() => setIsAddingColumn(false)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-[#1C1F26] border border-slate-200 dark:border-slate-800 hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Layout Conditional Render */}
      {layoutMode === "pivot" ? (
        <div id="pivot-dashboard-view" className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50 dark:bg-[#0F1115]">
          {/* Dashboard Summary Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Workload */}
            <div className="bg-white dark:bg-[#14171C] rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Total Workload</span>
                <p className="text-2xl font-extrabold text-slate-100 font-mono">{totalTasksCount}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Total active tasks in scope</p>
              </div>
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800/60">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
            </div>

            {/* In Progress */}
            <div className="bg-white dark:bg-[#14171C] rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">In Progress</span>
                <p className="text-2xl font-extrabold text-indigo-400 font-mono">{inProgressTasksCount}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Tasks active and in progress</p>
              </div>
              <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
              </div>
            </div>

            {/* Blocked - Critical Bottleneck Identification */}
            <div className={`bg-white dark:bg-[#14171C] rounded-xl border p-4 flex items-center justify-between shadow-sm transition-all ${
              blockedTasksCount > 0 ? "border-rose-500/30 bg-rose-950/5" : "border-slate-200 dark:border-slate-800"
            }`}>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Blocked Bottlenecks</span>
                <div className="flex items-center space-x-2">
                  <p className={`text-2xl font-extrabold font-mono ${blockedTasksCount > 0 ? "text-rose-400" : "text-slate-700 dark:text-slate-300"}`}>
                    {blockedTasksCount}
                  </p>
                  {blockedTasksCount > 0 && (
                    <span className="bg-rose-500/15 text-rose-400 border border-rose-500/25 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                      Attention
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Blocked tasks halting progress</p>
              </div>
              <div className={`p-3 rounded-xl border ${
                blockedTasksCount > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-slate-800/40 border-slate-200 dark:border-slate-800/60"
              }`}>
                <AlertTriangle className={`w-5 h-5 ${blockedTasksCount > 0 ? "text-rose-400 animate-bounce" : "text-slate-500 dark:text-slate-400"}`} />
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white dark:bg-[#14171C] rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Completed</span>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-extrabold text-emerald-400 font-mono">{completedTasksCount}</p>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0}% Done
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Successfully finished tasks</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

          </div>

          {/* Pivot Table Main Interactive Grid */}
          <div className="bg-white dark:bg-[#14171C] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-md">
            <div className="p-4 bg-white dark:bg-[#17191E] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Team Workload & Progress Pivot Board</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cross-sections of staff assignments and completion states. Click any count cell to drill down.
                </p>
              </div>
              <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-[#0F1115] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <span>Active Sprint Matrix</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#17191E]/30 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] select-none">
                    <th className="py-3.5 px-4 w-[220px]">Team Assignee</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 w-[120px]">Not Started</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 w-[120px]">In Progress</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 text-rose-400 w-[120px]">Blocked 🛑</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 text-emerald-400 w-[120px]">Completed ✨</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/40 font-bold text-slate-800 dark:text-slate-200 w-[120px] bg-slate-800/10">Grand Total</th>
                    <th className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/40 w-[160px]">Workload Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {sortedAssignees.map((assignee) => {
                    const rowTasks = getRowTasks(assignee);
                    const notStarted = getTasksByCell(assignee, "Not Started").length;
                    const inProgress = getTasksByCell(assignee, "In Progress").length;
                    const blocked = getTasksByCell(assignee, "Blocked").length;
                    const completed = getTasksByCell(assignee, "Completed").length;
                    const total = rowTasks.length;

                    // If filters are active, and this assignee has 0 total tasks, let's keep project members visible, otherwise hide empty ones
                    const isMember = project.members?.some((m) => m.name === assignee) || ["Abdallah", "Sallam", "Unassigned"].includes(assignee);
                    if (total === 0 && !isMember) {
                      return null;
                    }

                    // Calculate workload share percentages
                    const donePct = total > 0 ? (completed / total) * 100 : 0;
                    const progPct = total > 0 ? (inProgress / total) * 100 : 0;
                    const blockPct = total > 0 ? (blocked / total) * 100 : 0;
                    const todoPct = total > 0 ? (notStarted / total) * 100 : 0;

                    return (
                      <tr key={assignee} className="hover:bg-slate-50 dark:hover:bg-[#1C1F26]/40 transition-colors group">
                        {/* Assignee Identity */}
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "all" })}
                            className="flex items-center space-x-2.5 text-left w-full hover:text-indigo-400 transition-colors focus:outline-none cursor-pointer"
                          >
                            <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-bold flex items-center justify-center text-[10px] uppercase shadow-xs flex-shrink-0">
                              {assignee === "Unassigned"
                                ? "👤"
                                : assignee
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .substring(0, 2)}
                            </div>
                            <div className="truncate">
                              <p className="font-bold text-xs">{assignee}</p>
                              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                                {total} {total === 1 ? "task" : "tasks"}
                              </p>
                            </div>
                          </button>
                        </td>

                        {/* Cell: Not Started */}
                        <td className="p-2 border-l border-slate-200 dark:border-slate-800/60">
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "Not Started" })}
                            className={`w-full h-10 flex items-center justify-center font-mono text-xs rounded-lg transition-all focus:outline-none cursor-pointer ${
                              selectedPivotCell?.assignee === assignee && selectedPivotCell?.statusGroup === "Not Started"
                                ? "bg-[#1E222B] text-slate-900 dark:text-white border-2 border-indigo-500 font-extrabold shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1C1F26] hover:text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {notStarted || "-"}
                          </button>
                        </td>

                        {/* Cell: In Progress */}
                        <td className="p-2 border-l border-slate-200 dark:border-slate-800/60">
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "In Progress" })}
                            className={`w-full h-10 flex items-center justify-center font-mono text-xs rounded-lg transition-all focus:outline-none cursor-pointer ${
                              selectedPivotCell?.assignee === assignee && selectedPivotCell?.statusGroup === "In Progress"
                                ? "bg-[#1E222B] text-indigo-400 border-2 border-indigo-500 font-extrabold shadow-sm"
                                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1C1F26] hover:text-slate-900 dark:text-white"
                            }`}
                          >
                            {inProgress ? (
                              <span className="font-semibold text-indigo-400">{inProgress}</span>
                            ) : (
                              "-"
                            )}
                          </button>
                        </td>

                        {/* Cell: Blocked (Bottleneck highlight) */}
                        <td className={`p-2 border-l border-slate-200 dark:border-slate-800/60 transition-all ${blocked > 0 ? "bg-rose-500/5" : ""}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "Blocked" })}
                            className={`w-full h-10 flex items-center justify-center font-mono text-xs rounded-lg transition-all focus:outline-none cursor-pointer ${
                              selectedPivotCell?.assignee === assignee && selectedPivotCell?.statusGroup === "Blocked"
                                ? "bg-rose-950/20 text-rose-400 border-2 border-rose-500 font-extrabold shadow-sm"
                                : blocked > 0
                                ? "bg-rose-500/10 text-rose-400 font-bold border border-rose-500/20 hover:bg-rose-500/15"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1C1F26]"
                            }`}
                            title={blocked > 0 ? `${blocked} task blocked! Click to view.` : undefined}
                          >
                            {blocked ? (
                              <span className="flex items-center space-x-1">
                                <span>{blocked}</span>
                                <span className="text-[10px]">🛑</span>
                              </span>
                            ) : (
                              "-"
                            )}
                          </button>
                        </td>

                        {/* Cell: Completed */}
                        <td className={`p-2 border-l border-slate-200 dark:border-slate-800/60 transition-all ${completed > 0 ? "bg-emerald-500/5" : ""}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "Completed" })}
                            className={`w-full h-10 flex items-center justify-center font-mono text-xs rounded-lg transition-all focus:outline-none cursor-pointer ${
                              selectedPivotCell?.assignee === assignee && selectedPivotCell?.statusGroup === "Completed"
                                ? "bg-[#1E222B] text-emerald-400 border-2 border-[#10B981] font-extrabold shadow-sm"
                                : completed > 0
                                ? "text-emerald-400 font-bold hover:bg-slate-50 dark:hover:bg-[#1C1F26]"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1C1F26]"
                            }`}
                          >
                            {completed ? (
                              <span className="flex items-center space-x-0.5">
                                <span>{completed}</span>
                                <span className="text-[10px] text-emerald-500">✨</span>
                              </span>
                            ) : (
                              "-"
                            )}
                          </button>
                        </td>

                        {/* Cell: Grand Total */}
                        <td className="p-2 border-l border-slate-200 dark:border-slate-800/40 bg-slate-800/10">
                          <button
                            type="button"
                            onClick={() => setSelectedPivotCell({ assignee, statusGroup: "all" })}
                            className={`w-full h-10 flex items-center justify-center font-mono text-xs font-bold rounded-lg transition-all focus:outline-none cursor-pointer ${
                              selectedPivotCell?.assignee === assignee && selectedPivotCell?.statusGroup === "all"
                                ? "bg-[#1E222B] text-slate-900 dark:text-white border-2 border-slate-500 shadow-sm"
                                : "text-slate-800 dark:text-slate-200 hover:bg-slate-800/40"
                            }`}
                          >
                            {total}
                          </button>
                        </td>

                        {/* Visual Breakdown share progress bars */}
                        <td className="py-3 px-4 border-l border-slate-200 dark:border-slate-800/40">
                          {total > 0 ? (
                            <div className="space-y-1">
                              <div className="w-full bg-slate-50 dark:bg-[#0F1115] rounded-full h-1.5 overflow-hidden flex">
                                {completed > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${donePct}%` }} title={`Completed: ${Math.round(donePct)}%`} />}
                                {inProgress > 0 && <div className="bg-indigo-500 h-full" style={{ width: `${progPct}%` }} title={`In Progress: ${Math.round(progPct)}%`} />}
                                {blocked > 0 && <div className="bg-rose-500 h-full" style={{ width: `${blockPct}%` }} title={`Blocked: ${Math.round(blockPct)}%`} />}
                                {notStarted > 0 && <div className="bg-slate-700 h-full" style={{ width: `${todoPct}%` }} title={`Not Started: ${Math.round(todoPct)}%`} />}
                              </div>
                              <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400 font-mono scale-95 origin-left">
                                <span className="text-emerald-400">{completed} done</span>
                                <span className="text-rose-400">{blocked} blk</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 dark:text-slate-600 italic">No tasks</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Grand Totals (Column calculations) */}
                  <tr className="bg-white dark:bg-[#17191E] font-bold text-slate-100 border-t border-slate-300 dark:border-slate-700 select-none">
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">Grand Column Totals</td>
                    
                    {/* Grand Total: Not Started */}
                    <td className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {getColTasks("Not Started").length}
                    </td>

                    {/* Grand Total: In Progress */}
                    <td className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 font-mono text-xs text-indigo-400 bg-indigo-500/5">
                      {getColTasks("In Progress").length}
                    </td>

                    {/* Grand Total: Blocked */}
                    <td className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 font-mono text-xs text-rose-400 bg-rose-500/5">
                      {getColTasks("Blocked").length} Blocked
                    </td>

                    {/* Grand Total: Completed */}
                    <td className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/60 font-mono text-xs text-emerald-400 bg-emerald-500/5">
                      {getColTasks("Completed").length} Completed
                    </td>

                    {/* Grand Total of all filtered tasks */}
                    <td className="py-3.5 px-4 text-center border-l border-slate-200 dark:border-slate-800/40 font-mono text-xs font-extrabold text-indigo-400 bg-indigo-500/10">
                      {totalTasksCount} Total
                    </td>

                    {/* overall completion meter */}
                    <td className="py-3.5 px-4 border-l border-slate-200 dark:border-slate-800/40">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400">
                          <span>Sprint Progress</span>
                          <span className="font-bold text-emerald-400">
                            {totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-50 dark:bg-[#0F1115] rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-800/80">
                          <div
                            className="bg-[#10B981] h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottleneck Alerts Panel (Only if blocked tasks exist) */}
          {blockedTasksCount > 0 && (
            <div id="bottleneck-warnings-hub" className="bg-rose-950/15 border border-rose-500/25 rounded-xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center space-x-2 text-rose-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
                <h4 className="font-extrabold text-xs uppercase tracking-wider">
                  ⚠️ Critical Bottleneck Warnings ({blockedTasksCount})
                </h4>
              </div>
              <p className="text-[11px] text-rose-300/90 leading-relaxed max-w-3xl">
                The following tasks are currently Blocked, which impacts individual workloads and milestones.
                Cross-reference below to coordinate assistance or reassign dependencies.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTasks
                  .filter((t) => getStatusGroup(t.status) === "Blocked")
                  .map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onOpenTaskModal(task)}
                      className="group bg-white dark:bg-[#14171C] border border-rose-500/20 hover:border-rose-500/40 rounded-lg p-3 flex flex-col justify-between cursor-pointer hover:bg-rose-500/5 transition-all text-left"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono text-slate-500 dark:text-slate-400 font-semibold">{task.id}</span>
                          <div className="flex items-center space-x-2">
                            <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                              {PRIORITIES.find(p => p.value === task.priority)?.label || task.priority}
                            </span>
                            <button
                              onClick={(e) => handleDeleteTask(e, task.id)}
                              className="text-slate-400 hover:text-rose-500 transition-colors bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded p-1 shadow-sm"
                              title="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-1">{task.title}</h5>
                        {task.description && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{task.description}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800/40 mt-2.5 pt-2 text-[10px]">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center space-x-1 flex-wrap">
                          <span>Assignee:</span>
                          <strong className="text-rose-400">{task.assignee}</strong>
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-[9px]">Click to inspect</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Interactive Task Explorer Drill-down */}
          <div className="bg-white dark:bg-[#14171C] rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="p-1 bg-slate-50 dark:bg-[#1C1F26] rounded-md border border-slate-200 dark:border-slate-800 text-xs">🔍</span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                    {selectedPivotCell
                      ? `Task Drill-down: ${selectedPivotCell.assignee} (${selectedPivotCell.statusGroup})`
                      : "Interactive Task Explorer"}
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedPivotCell
                    ? `Showing tasks for ${selectedPivotCell.assignee} that are currently ${
                        selectedPivotCell.statusGroup === "all" ? "in any status" : selectedPivotCell.statusGroup
                      }.`
                    : "Click on any number cell inside the pivot table above to view that specific list of tasks."}
                </p>
              </div>

              {selectedPivotCell && (
                <button
                  type="button"
                  onClick={() => setSelectedPivotCell(null)}
                  className="px-2.5 py-1 text-[10px] font-bold bg-slate-50 dark:bg-[#1C1F26] hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:text-white text-slate-500 dark:text-slate-400 rounded transition-all cursor-pointer"
                >
                  Clear Selection (Show All)
                </button>
              )}
            </div>

            {/* List of Drilldown tasks */}
            {(() => {
              const displayTasks = selectedPivotCell
                ? selectedPivotCell.statusGroup === "all"
                  ? getRowTasks(selectedPivotCell.assignee)
                  : getTasksByCell(selectedPivotCell.assignee, selectedPivotCell.statusGroup)
                : filteredTasks;

              if (displayTasks.length === 0) {
                return (
                  <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl p-4 bg-slate-800/10 text-slate-500 dark:text-slate-400 text-xs space-y-1.5">
                    <p className="font-semibold text-slate-500 dark:text-slate-400">No tasks matched this selection.</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select another cell or add new tasks using the "+ New Task" button above.
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {displayTasks.map((task) => {
                    const statusGrp = getStatusGroup(task.status);
                    const subtasksCompleted = task.subtasks?.filter((s) => s.completed).length || 0;
                    const totalSubtasks = task.subtasks?.length || 0;

                    return (
                      <div
                        key={task.id}
                        id={`drilldown-task-${task.id}`}
                        onClick={() => onOpenTaskModal(task)}
                        className="bg-slate-50 dark:bg-[#1C1F26] rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 hover:border-slate-300 dark:border-slate-700 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between text-left"
                      >
                        <div>
                          {/* Priority and Status indicators */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-[#0F1115] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800/80">
                              {task.id}
                            </span>
                            <div className="flex items-center space-x-1.5">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                statusGrp === "Completed"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : statusGrp === "Blocked"
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                                  : statusGrp === "In Progress"
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                  : "bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700"
                              }`}>
                                {statusGrp}
                              </span>
                              <span className="text-[8px] font-extrabold px-1 text-slate-500 dark:text-slate-400 uppercase">
                                {task.priority}
                              </span>
                              <button
                                onClick={(e) => handleDeleteTask(e, task.id)}
                                className="text-slate-400 hover:text-rose-500 transition-colors ml-1 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded p-1 shadow-sm"
                                title="Delete task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Title */}
                          <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs group-hover:text-indigo-400 transition-colors line-clamp-1 mb-1">
                            {task.title}
                          </h5>

                          {/* Description */}
                          {task.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Footer details */}
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-2.5 mt-2">
                          <div className="flex items-center space-x-2 font-mono text-[9px]">
                            {task.dueDate && (
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-3 h-3" />
                                <span>{task.dueDate.substring(5)}</span>
                              </span>
                            )}
                            {totalSubtasks > 0 && (
                              <span className="flex items-center space-x-0.5">
                                <CheckSquare className="w-3 h-3" />
                                <span>{subtasksCompleted}/{totalSubtasks}</span>
                              </span>
                            )}
                          </div>

                          {/* Assignee initials badge */}
                          <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-bold flex items-center justify-center text-[9px] uppercase">
                            {task.assignee === "Unassigned" || !task.assignee
                              ? "👤"
                              : task.assignee
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .substring(0, 2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* Kanban Stages Scrollbox */
        <div id="kanban-board-stages" className="flex-1 overflow-x-auto p-4 flex items-start gap-4 select-none bg-slate-50 dark:bg-[#0F1115] snap-x">
          {project.columns.map((col, index) => {
            const colTasks = filteredTasks.filter((task) => task.status === col.id);
            const isMenuOpen = activeMenuColumn === col.id;
            const isEditing = editingColumnId === col.id;

            return (
              <div
                key={col.id}
                id={`kanban-column-${col.id}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.id)}
                className="w-[85vw] max-w-[320px] sm:w-80 flex-shrink-0 snap-center bg-white dark:bg-[#17191E] rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-full"
              >
                {/* Stage Header */}
                <div
                  id={`column-header-${col.id}`}
                  className="p-3.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/60"
                >
                  <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                    {/* Status Dot */}
                    <span 
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: col.color }}
                    />
                    {isEditing ? (
                      <input
                        id={`column-rename-input-${col.id}`}
                        type="text"
                        value={columnEditTitle}
                        onChange={(e) => setColumnEditTitle(e.target.value)}
                        onBlur={() => saveRenameColumn(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRenameColumn(col.id);
                        }}
                        className="bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white focus:outline-none w-full"
                        autoFocus
                      />
                    ) : (
                      <h3
                        id={`column-title-${col.id}`}
                        onDoubleClick={() => startRenameColumn(col)}
                        className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate cursor-pointer hover:bg-slate-800/10 dark:hover:bg-slate-800/50 rounded px-1"
                        title="Double click to rename"
                      >
                        {col.title}
                      </h3>
                    )}
                    <span className="bg-slate-200/80 dark:bg-[#0F1115] text-slate-600 dark:text-indigo-400 border border-slate-300 dark:border-slate-800/80 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Column Action buttons */}
                  <div className="flex items-center space-x-0.5 relative">
                    <button
                      id={`move-col-left-${col.id}`}
                      onClick={() => handleMoveColumn(index, "left")}
                      disabled={index === 0}
                      className="p-1 hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="Move column left"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      id={`move-col-right-${col.id}`}
                      onClick={() => handleMoveColumn(index, "right")}
                      disabled={index === project.columns.length - 1}
                      className="p-1 hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      title="Move column right"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      id={`column-menu-btn-${col.id}`}
                      onClick={() => setActiveMenuColumn(isMenuOpen ? null : col.id)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>

                    {/* Column Menu dropdown */}
                    {isMenuOpen && (
                      <div
                        id={`column-dropdown-menu-${col.id}`}
                        className="absolute right-0 top-6 bg-white dark:bg-[#17191E] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl py-1.5 z-20 w-48 text-left text-xs"
                      >
                        <button
                          id={`menu-rename-col-${col.id}`}
                          onClick={() => startRenameColumn(col)}
                          className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1C1F26] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white flex items-center space-x-2 cursor-pointer"
                        >
                          <span>✏️ Rename Status</span>
                        </button>

                        {/* Color Palette selectors */}
                        <div className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1 flex items-center space-x-1">
                            <Palette className="w-3 h-3" />
                            <span>Status Color</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {presetColors.map((color) => (
                              <button
                                key={color}
                                id={`set-col-color-${col.id}-${color}`}
                                type="button"
                                onClick={() => handleSetColumnColor(col.id, color)}
                                className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-800 cursor-pointer"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>

                        {project.columns.length > 1 && (
                          <button
                            id={`menu-delete-col-${col.id}`}
                            onClick={() => handleDeleteColumn(col.id)}
                            className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1C1F26] font-medium text-rose-400 flex items-center space-x-2 border-t border-slate-200 dark:border-slate-800 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Column</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tasks List */}
                <div
                  id={`tasks-scroller-${col.id}`}
                  className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-[250px] bg-white dark:bg-[#17191E]/30"
                >
                  {colTasks.length === 0 ? (
                    <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-slate-500 dark:text-slate-600 text-xs italic">
                      Drag tasks here
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const priorityConfig = PRIORITIES.find((p) => p.value === task.priority);
                      const subtasksCompleted = task.subtasks?.filter((s) => s.completed).length || 0;
                      const totalSubtasks = task.subtasks?.length || 0;

                      return (
                        <div
                          key={task.id}
                          id={`task-card-${task.id}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onClick={() => onOpenTaskModal(task)}
                          className="bg-slate-50 dark:bg-[#1C1F26] rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-md hover:shadow-xl hover:border-slate-300 dark:border-slate-700 transition-all cursor-pointer group relative"
                        >
                          {/* Tags and priority indicator */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-500 font-extrabold tracking-wide">
                              {task.id.toUpperCase()}
                            </span>
                            <div className="flex items-center space-x-2">
                              {(() => {
                                const p = task.priority.toLowerCase();
                                let badgeColors = "bg-slate-100 text-slate-500 dark:text-slate-600 border border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/60";
                                if (p === "critical" || p === "high" || p === "urgent") {
                                  badgeColors = "bg-rose-50 text-rose-600 border border-[#fecdd3]/40 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-500/20";
                                } else if (p === "medium") {
                                  badgeColors = "bg-indigo-50 text-indigo-600 border border-[#c7d2fe]/40 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-500/20";
                                }
                                return (
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${badgeColors}`}>
                                    {priorityConfig?.label || task.priority}
                                  </span>
                                );
                              })()}
                              <button
                                onClick={(e) => handleDeleteTask(e, task.id)}
                                className="text-slate-400 hover:text-rose-500 transition-colors ml-1 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded p-1 shadow-sm"
                                title="Delete task"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Title */}
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {task.title}
                          </h4>

                          {/* Description */}
                          {(task.description || task.notes) && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3 whitespace-pre-wrap">
                              {task.description || task.notes}
                            </p>
                          )}

                          {/* Divider */}
                          <div className="border-t border-slate-100 dark:border-slate-800/60 my-2.5" />

                          {/* Tasks Meta Indicators */}
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                            {/* Left action: Assignee avatar & full name */}
                            <div className="flex items-center space-x-2">
                              <div 
                                className={`w-5 h-5 rounded-full font-bold flex items-center justify-center text-[9px] uppercase border ${
                                  (() => {
                                    const name = (task.assignee || "Unassigned").toLowerCase();
                                    if (name.includes("abdallah")) {
                                      return "bg-blue-100 text-blue-700 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40";
                                    }
                                    if (name.includes("sallam")) {
                                      return "bg-emerald-100 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40";
                                    }
                                    return "bg-slate-100 text-slate-700 border-slate-200/50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                                  })()
                                }`}
                              >
                                {task.assignee === "Unassigned" || !task.assignee
                                  ? "UN"
                                  : task.assignee
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .substring(0, 2)}
                              </div>
                              <span className="text-slate-700 dark:text-slate-300 font-bold text-xs truncate max-w-[120px]">
                                {task.assignee || "Unassigned"}
                              </span>
                            </div>

                            {/* Right action: Clock Icon & Hours */}
                            <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 dark:text-slate-400 font-mono text-[11px] font-semibold">
                              <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>{task.estimatedHours || 4}h</span>
                            </div>
                          </div>

                          {/* Touch move controls — drag-and-drop doesn't fire on touchscreens */}
                          <div className="flex md:hidden items-center justify-between mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveTask(task.id, project.columns[index - 1].id);
                              }}
                              className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronLeft className="w-3 h-3" />
                              <span>{index > 0 ? project.columns[index - 1].title : "Move"}</span>
                            </button>
                            <button
                              type="button"
                              disabled={index === project.columns.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveTask(task.id, project.columns[index + 1].id);
                              }}
                              className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                            >
                              <span>{index < project.columns.length - 1 ? project.columns[index + 1].title : "Move"}</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Task button */}
                <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#17191E]/40 rounded-b-xl">
                  <button
                    id={`col-add-task-btn-${col.id}`}
                    onClick={() => onOpenTaskModal(null, col.id)}
                    className="w-full flex items-center justify-center space-x-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-[#1C1F26]/60 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
