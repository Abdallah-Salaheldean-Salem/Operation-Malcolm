import React, { useState } from "react";
import { Project, Task } from "../types";
import { Search, Plus, Trash2, Edit2, ChevronDown, ChevronRight, Calendar, Flag, MessageSquare, LayoutList, MoreHorizontal, Download } from "lucide-react";

interface ListViewProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
  onOpenTaskModal: (task: Task | null, defaultColumnId?: string) => void;
  globalSearch?: string;
  globalPriority?: string;
  globalAssignee?: string;
  globalStatus?: string;
}

export default function ListView({
  project,
  onUpdateProject,
  onOpenTaskModal,
  globalSearch,
  globalPriority,
  globalAssignee,
  globalStatus,
}: ListViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (statusId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [statusId]: prev[statusId] === undefined ? false : !prev[statusId]
    }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-red-500 bg-red-50 dark:bg-red-500/10";
      case "high": return "text-orange-500 bg-orange-50 dark:bg-orange-500/10";
      case "medium": return "text-blue-500 bg-blue-50 dark:bg-blue-500/10";
      default: return "text-slate-500 bg-slate-50 dark:bg-slate-500/10";
    }
  };

  const activeSearch = globalSearch || "";
  const activePriority = globalPriority || "all";
  const activeAssignee = globalAssignee || "all";
  const activeStatus = globalStatus || "all";

  const filteredTasks = project.tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(activeSearch.toLowerCase());
    const matchesPriority = activePriority === "all" || task.priority === activePriority;
    const matchesAssignee = activeAssignee === "all" || task.assignee === activeAssignee;
    const matchesStatus = activeStatus === "all" || task.status === activeStatus;
    return matchesSearch && matchesPriority && matchesAssignee && matchesStatus;
  });

  const [exporting, setExporting] = useState(false);
  // Export the currently filtered tasks to a real .xlsx (SheetJS loaded on demand).
  const exportToExcel = async () => {
    if (filteredTasks.length === 0 || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const colTitle = (id: string) => project.columns.find((c) => c.id === id)?.title || id;
      const done = (arr?: { completed: boolean }[]) => (arr || []).filter((s) => s.completed).length;
      const rows = filteredTasks.map((t) => ({
        Status: colTitle(t.status),
        Name: t.title,
        Assignee: t.assignee || "Unassigned",
        Priority: t.priority,
        "Start Date": t.startDate || "",
        "End Date": t.dueDate || "",
        Deadline: t.deadline || "",
        "Logged Hours": t.actualHours || 0,
        "Estimated Hours": t.estimatedHours || 0,
        "Progress %": typeof t.progress === "number" ? t.progress : "",
        Checklist: `${done(t.checklist)}/${(t.checklist || []).length}`,
        Subtasks: `${done(t.subtasks)}/${(t.subtasks || []).length}`,
        Tags: (t.tags || []).join(", "),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tasks");
      const safe = ((project.name || "tasks").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)) || "tasks";
      const stamp = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `${safe}_${stamp}.xlsx`);
    } catch (err) {
      console.error("Excel export failed", err);
      alert("Sorry — the Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0F1115] overflow-y-auto">
      {/* ClickUp Style Spreadsheet / List View */}
      <div className="p-3 sm:p-6 max-w-[1400px] w-full mx-auto">
        {/* Toolbar: task count + Excel export */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"}
          </span>
          <button
            id="export-excel-btn"
            type="button"
            onClick={exportToExcel}
            disabled={filteredTasks.length === 0 || exporting}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>
        {project.columns.map((col) => {
          const colTasks = filteredTasks.filter(t => t.status === col.id);
          if (colTasks.length === 0) return null;
          
          const isExpanded = expandedGroups[col.id] !== false;

          return (
            <div key={col.id} className="mb-6">
              {/* Group Header */}
              <div 
                className="flex items-center group cursor-pointer mb-2 space-x-2"
                onClick={() => toggleGroup(col.id)}
              >
                <button className="text-slate-400 hover:text-slate-600 transition-colors p-0.5">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div 
                  className="flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider space-x-2 select-none shadow-sm"
                  style={{ backgroundColor: col.color, color: "#fff" }}
                >
                  <span>{col.title}</span>
                </div>
                <span className="text-xs font-medium text-slate-400 select-none">{colTasks.length} TASKS</span>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800 ml-4 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTaskModal(null, col.id);
                  }}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Group Tasks Table (Spreadsheet style) */}
              {isExpanded && (
                <div className="ml-0 sm:ml-6 border border-slate-200 dark:border-slate-800 rounded-md overflow-x-auto bg-white dark:bg-[#14171C] shadow-sm">
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead className="bg-slate-50 dark:bg-[#1C1F26] border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                      <tr>
                        <th className="py-2 px-3 font-bold border-r border-slate-200 dark:border-slate-800 w-[32%]">Name</th>
                        <th className="py-2 px-3 font-bold border-r border-slate-200 dark:border-slate-800 w-[13%]">Assignee</th>
                        <th className="py-2 px-3 font-bold border-r border-slate-200 dark:border-slate-800 w-[12%]">Start Date</th>
                        <th className="py-2 px-3 font-bold border-r border-slate-200 dark:border-slate-800 w-[12%]">End Date</th>
                        <th className="py-2 px-3 font-bold border-r border-slate-200 dark:border-slate-800 w-[11%]">Logged Hrs</th>
                        <th className="py-2 px-3 font-bold w-[15%] border-r border-slate-200 dark:border-slate-800">Priority</th>
                        <th className="py-2 px-3 font-bold w-[5%] text-center"><MoreHorizontal className="w-3 h-3 mx-auto" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-[13px]">
                      {colTasks.map(task => (
                        <tr 
                          key={task.id} 
                          className="group hover:bg-slate-50 dark:hover:bg-[#1C1F26]/30 transition-colors"
                        >
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 border-l-4 relative cursor-pointer" style={{ borderLeftColor: col.color }} onClick={() => onOpenTaskModal(task)}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-indigo-500 transition-colors truncate">
                                {task.title}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer" onClick={() => onOpenTaskModal(task)}>
                            {task.assignee && task.assignee !== "Unassigned" ? (
                              <div className="flex items-center space-x-2">
                                <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                                  {task.assignee.substring(0, 2).toUpperCase()}
                                </div>
                                <span className="text-slate-600 dark:text-slate-400 truncate">{task.assignee}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Unassigned</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer text-xs" onClick={() => onOpenTaskModal(task)}>
                            {task.startDate ? (
                              <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400">
                                <span>{new Date(task.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer text-xs" onClick={() => onOpenTaskModal(task)}>
                            {task.dueDate ? (
                              <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400">
                                <span>{new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer text-xs" onClick={() => onOpenTaskModal(task)}>
                            <span className="text-slate-600 dark:text-slate-400 font-mono">
                              {(task.actualHours || 0)}h
                              {task.estimatedHours ? <span className="text-slate-400 dark:text-slate-500"> / {task.estimatedHours}h</span> : null}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer" onClick={() => onOpenTaskModal(task)}>
                            <div className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded font-bold uppercase text-[9px] tracking-wider ${getPriorityColor(task.priority)}`}>
                              <Flag className="w-3 h-3" />
                              <span>{task.priority}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-400 cursor-pointer" onClick={() => onOpenTaskModal(task)}>
                             <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex justify-center">
                                <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"><Edit2 className="w-3.5 h-3.5" /></button>
                             </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="group">
                        <td colSpan={7} className="py-1 px-3 border-l-4 border-transparent text-xs">
                          <button 
                            onClick={() => onOpenTaskModal(null, col.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1.5 flex items-center space-x-1 transition-colors cursor-pointer w-full text-left"
                          >
                            <Plus className="w-3 h-3" />
                            <span>New Task</span>
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {filteredTasks.length === 0 && (
          <div className="text-center py-20 text-slate-500">
             No tasks match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
