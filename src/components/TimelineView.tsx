import React, { useState, useEffect, useMemo, useRef } from "react";
import DateInput from "./DateInput";
import { Project, Task, BoardColumn, TaskPriority } from "../types";
import { PRIORITIES } from "../data";
import {
  Calendar,
  Info,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Sparkles,
  Plus,
  AlertTriangle,
  RefreshCw,
  Eye,
  Sun,
  Moon,
  Trash2,
  CheckCircle2,
  Sliders,
  MoreVertical
} from "lucide-react";

interface TimelineViewProps {
  project: Project;
  onOpenTaskModal: (task: Task | null) => void;
  onUpdateProject?: (updatedProj: Project) => void;
}

export default function TimelineView({ project, onOpenTaskModal, onUpdateProject }: TimelineViewProps) {
  // Themes and calendar navigation
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [currentYear, setCurrentYear] = useState(2024);
  const [currentMonth, setCurrentMonth] = useState(0); // Jan
  const [zoomMode, setZoomMode] = useState<"day" | "week" | "month">("day");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "assignee" | "priority">("status");
  const [isCriticalPathEnabled, setIsCriticalPathEnabled] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter/Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Quick Add
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStart, setQuickStart] = useState("");
  const [quickDue, setQuickDue] = useState("");

  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Auto-align timeline when project loads
  useEffect(() => {
    const tasksWithDates = project.tasks.filter((t) => t.startDate);
    if (tasksWithDates.length > 0) {
      const dates = tasksWithDates.map((t) => new Date(t.startDate).getTime());
      const minDate = new Date(Math.min(...dates));
      if (!isNaN(minDate.getTime())) {
        setCurrentYear(minDate.getFullYear());
        setCurrentMonth(minDate.getMonth());
      }
    }
  }, [project.id]);

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  // Column definitions based on zoomMode
  const columnsData = useMemo(() => {
    if (zoomMode === "day") {
      const daysCount = getDaysInMonth(currentYear, currentMonth);
      const daysList: string[] = [];
      const weekdays: string[] = [];
      for (let d = 1; d <= daysCount; d++) {
        const dayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        daysList.push(dayStr);
        const dateObj = new Date(currentYear, currentMonth, d);
        weekdays.push(dateObj.toLocaleDateString("default", { weekday: "narrow" }));
      }
      return {
        keys: daysList,
        headers: daysList.map((day, i) => ({
          label: String(i + 1),
          subLabel: weekdays[i],
          key: day,
        })),
        columnWidth: 40,
      };
    } else if (zoomMode === "week") {
      const weeksList: { key: string; label: string; subLabel: string; startStr: string; endStr: string }[] = [];
      let trackingDate = new Date(currentYear, currentMonth, 1);
      for (let w = 0; w < 12; w++) {
        const startStr = trackingDate.toISOString().split("T")[0];
        const endOfWeek = new Date(trackingDate.getTime() + 6 * 86400000);
        const endStr = endOfWeek.toISOString().split("T")[0];
        const mStart = trackingDate.toLocaleString("default", { month: "short" });
        weeksList.push({
          key: `week-${w}-${startStr}`,
          label: `${mStart} ${trackingDate.getDate()}`,
          subLabel: `to ${endOfWeek.getDate()}`,
          startStr,
          endStr,
        });
        trackingDate = new Date(trackingDate.getTime() + 7 * 86400000);
      }
      return {
        keys: weeksList.map((w) => w.key),
        headers: weeksList.map((w) => ({
          label: w.label,
          subLabel: w.subLabel,
          key: w.key,
          startStr: w.startStr,
          endStr: w.endStr,
        })),
        columnWidth: 80,
      };
    } else {
      const monthsList: { key: string; label: string; subLabel: string; startStr: string; endStr: string }[] = [];
      for (let m = 0; m < 12; m++) {
        const targetYear = currentYear + Math.floor(m / 12);
        const mIdx = m % 12;
        const dateObj = new Date(targetYear, mIdx, 1);
        const daysInTarget = getDaysInMonth(targetYear, mIdx);
        monthsList.push({
          key: `month-${targetYear}-${mIdx}`,
          label: dateObj.toLocaleDateString("default", { month: "short" }).toUpperCase(),
          subLabel: String(targetYear),
          startStr: `${targetYear}-${String(mIdx + 1).padStart(2, "0")}-01`,
          endStr: `${targetYear}-${String(mIdx + 1).padStart(2, "0")}-${daysInTarget}`,
        });
      }
      return {
        keys: monthsList.map((m) => m.key),
        headers: monthsList.map((m) => ({
          label: m.label,
          subLabel: m.subLabel,
          key: m.key,
          startStr: m.startStr,
          endStr: m.endStr,
        })),
        columnWidth: 85,
      };
    }
  }, [currentYear, currentMonth, zoomMode]);

  // Position plot values for dates
  const getGridPlot = (startStr?: string, endStr?: string) => {
    const sStr = startStr || `${currentYear}-01-01`;
    const eStr = endStr || sStr;
    const headers = columnsData.headers as any[];
    const keys = columnsData.keys;

    if (zoomMode === "day") {
      let startIndex = keys.indexOf(sStr);
      let endIndex = keys.indexOf(eStr);
      const boundStart = keys[0];
      const boundEnd = keys[keys.length - 1];

      if (sStr > boundEnd || eStr < boundStart) {
        return { start: 0, span: 0, isVisible: false };
      }
      if (startIndex === -1) startIndex = sStr < boundStart ? 0 : keys.length - 1;
      if (endIndex === -1) endIndex = eStr < boundStart ? 0 : keys.length - 1;

      return {
        start: Math.min(startIndex, endIndex),
        span: Math.max(1, Math.abs(endIndex - startIndex) + 1),
        isVisible: true,
      };
    } else {
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (sStr <= h.endStr && startIdx === -1) startIdx = i;
        if (eStr >= h.startStr) endIdx = i;
      }
      const firstHeader = headers[0];
      const lastHeader = headers[headers.length - 1];

      if (sStr > lastHeader.endStr || eStr < firstHeader.startStr) {
        return { start: 0, span: 0, isVisible: false };
      }
      if (startIdx === -1) startIdx = headers.length - 1;
      if (endIdx === -1) endIdx = 0;

      return {
        start: Math.min(startIdx, endIdx),
        span: Math.max(1, Math.abs(endIdx - startIdx) + 1),
        isVisible: true,
      };
    }
  };

  // 1-to-1 filtered tasks list
  const filteredTasks = useMemo(() => {
    return project.tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAssignee = !filterAssignee || (task.assignee || "Unassigned") === filterAssignee;
      const matchesPriority = !filterPriority || task.priority === filterPriority;
      const matchesStatus = !filterStatus || task.status === filterStatus;
      return matchesSearch && matchesAssignee && matchesPriority && matchesStatus;
    });
  }, [project.tasks, searchQuery, filterAssignee, filterPriority, filterStatus]);

  // Critical path mapping
  const criticalPathIds = useMemo(() => {
    if (!isCriticalPathEnabled || project.tasks.length === 0) return new Set<string>();
    const successors: Record<string, string[]> = {};
    const predecessors: Record<string, string[]> = {};
    project.tasks.forEach((t) => {
      (t.dependencies || []).forEach((depId) => {
        if (!successors[depId]) successors[depId] = [];
        successors[depId].push(t.id);
        if (!predecessors[t.id]) predecessors[t.id] = [];
        predecessors[t.id].push(depId);
      });
    });

    const memo: Record<string, number> = {};
    const getPathLength = (id: string): number => {
      if (memo[id] !== undefined) return memo[id];
      const succs = successors[id] || [];
      if (succs.length === 0) return 1;
      const maxSucc = Math.max(...succs.map(getPathLength));
      memo[id] = 1 + maxSucc;
      return memo[id];
    };

    let maxChain = 0;
    const lengths: Record<string, number> = {};
    project.tasks.forEach((t) => {
      const len = getPathLength(t.id);
      lengths[t.id] = len;
      if (len > maxChain) maxChain = len;
    });

    const set = new Set<string>();
    const hasDeps = project.tasks.some((t) => t.dependencies && t.dependencies.length > 0);
    if (hasDeps && maxChain > 1) {
      project.tasks.forEach((t) => {
        if (lengths[t.id] === maxChain || (predecessors[t.id] && predecessors[t.id].some((p) => lengths[p] === maxChain))) {
          set.add(t.id);
        }
      });
    }
    return set;
  }, [project.tasks, isCriticalPathEnabled]);

  // Grouped Tracks
  const groupedTasks = useMemo(() => {
    const groups: Record<string, { label: string; color: string; tasks: Task[] }> = {};
    if (groupBy === "none") {
      groups["all"] = {
        label: "Market Research Schedule",
        color: "#6366f1",
        tasks: filteredTasks,
      };
    } else if (groupBy === "status") {
      project.columns.forEach((col) => {
        groups[col.id] = {
          label: col.title,
          color: col.color,
          tasks: filteredTasks.filter((t) => t.status === col.id),
        };
      });
    } else if (groupBy === "assignee") {
      const assignees = Array.from(new Set(["Unassigned", ...project.tasks.map((t) => t.assignee).filter(Boolean)]));
      assignees.forEach((ass) => {
        groups[ass] = {
          label: ass === "Unassigned" ? "Unassigned Pool" : `${ass}`,
          color: ass === "Unassigned" ? "#64748b" : "#3b82f6",
          tasks: filteredTasks.filter((t) => (t.assignee || "Unassigned") === ass),
        };
      });
    } else {
      PRIORITIES.forEach((p) => {
        groups[p.value] = {
          label: `${p.label} Priority`,
          color: p.color,
          tasks: filteredTasks.filter((t) => t.priority === p.value),
        };
      });
    }
    return groups;
  }, [filteredTasks, groupBy, project.columns, project.tasks]);

  // Combined Rows representation for absolute alignment on left and right sides!
  const flatVisibleRows = useMemo(() => {
    const rows: (
      | { type: "group"; key: string; label: string; color: string; count: number; tasks: Task[]; progressAvg: number }
      | { type: "task"; task: Task; groupKey: string; indexStr: string }
    )[] = [];

    let groupCounter = 1;
    Object.entries(groupedTasks).forEach(([groupKey, group]) => {
      const isCollapsed = collapsedGroups[groupKey];
      const progressAvg = Math.round(
        group.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / (group.tasks.length || 1)
      );

      rows.push({
        type: "group",
        key: groupKey,
        label: group.label,
        color: group.color,
        count: group.tasks.length,
        tasks: group.tasks,
        progressAvg,
      });

      if (!isCollapsed) {
        group.tasks.forEach((task, tIdx) => {
          rows.push({
            type: "task",
            task,
            groupKey,
            indexStr: `${groupCounter}.${tIdx + 1}`,
          });
        });
      }
      groupCounter++;
    });
    return rows;
  }, [groupedTasks, collapsedGroups]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const updateTaskDates = (task: Task, startDelta: number, dueDelta: number) => {
    if (!onUpdateProject) return;
    const parseDateStr = (str?: string) => {
      const parts = (str || "").split("-").map(Number);
      if (parts.length !== 3 || isNaN(parts[0])) return new Date();
      return new Date(parts[0], parts[1] - 1, parts[2]);
    };
    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    const newStart = new Date(parseDateStr(task.startDate).getTime() + startDelta * 86400000);
    const newDue = new Date(parseDateStr(task.dueDate || task.startDate).getTime() + dueDelta * 86400000);

    onUpdateProject({
      ...project,
      tasks: project.tasks.map((t) =>
        t.id === task.id ? { ...t, startDate: formatDate(newStart), dueDate: formatDate(newDue) } : t
      ),
    });
  };

  const toggleMilestone = (task: Task) => {
    if (!onUpdateProject) return;
    onUpdateProject({
      ...project,
      tasks: project.tasks.map((t) => (t.id === task.id ? { ...t, isMilestone: !t.isMilestone } : t)),
    });
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || !onUpdateProject) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: quickTitle.trim(),
      description: "Fast-created Gantt schedule",
      status: project.columns[0]?.id || "col-todo",
      priority: "medium",
      startDate: quickStart || new Date().toISOString().split("T")[0],
      dueDate: quickDue || quickStart || new Date().toISOString().split("T")[0],
      assignee: "Unassigned",
      tags: [],
      estimatedHours: 8,
      actualHours: 0,
      subtasks: [],
      comments: [],
      createdAt: new Date().toISOString(),
      dependencies: [],
      progress: 0,
    };

    onUpdateProject({ ...project, tasks: [...project.tasks, newTask] });
    setQuickTitle("");
    setIsQuickAddOpen(false);
  };

  const ROW_HEIGHT = 48;
  const HEADER_HEIGHT = 44;
  const gridWidth = columnsData.headers.length * columnsData.columnWidth;

  const todayIndex = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    if (zoomMode === "day") {
      const idx = columnsData.keys.indexOf(todayStr);
      return idx !== -1 ? idx : Math.floor(columnsData.keys.length / 2);
    }
    const todayTime = new Date().getTime();
    const headers = columnsData.headers as any[];
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h.startStr && h.endStr) {
        const startT = new Date(h.startStr).getTime();
        const endT = new Date(h.endStr).getTime();
        if (todayTime >= startT && todayTime <= endT) return i;
      }
    }
    return Math.floor(columnsData.keys.length / 2);
  }, [columnsData, zoomMode]);

  // Dependency connection rendering
  const dependencyLines = useMemo(() => {
    const lines: {
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isConflict: boolean;
      isCritical: boolean;
      predecessorTitle: string;
      successorTitle: string;
    }[] = [];

    flatVisibleRows.forEach((row, idx) => {
      if (row.type !== "task") return;
      const currentTask = row.task;
      const deps = currentTask.dependencies || [];

      deps.forEach((predecessorId) => {
        const predRowIndex = flatVisibleRows.findIndex(
          (r) => r.type === "task" && r.task.id === predecessorId
        );
        if (predRowIndex !== -1) {
          const predecessorRow = flatVisibleRows[predRowIndex];
          if (predecessorRow.type !== "task") return;
          const predecessorTask = predecessorRow.task;

          const predPlot = getGridPlot(predecessorTask.startDate, predecessorTask.dueDate);
          const currPlot = getGridPlot(currentTask.startDate, currentTask.dueDate);

          if (predPlot.isVisible && currPlot.isVisible) {
            const x1 = (predPlot.start + predPlot.span) * columnsData.columnWidth;
            const y1 = predRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
            const x2 = currPlot.start * columnsData.columnWidth;
            const y2 = idx * ROW_HEIGHT + ROW_HEIGHT / 2;

            const isConflict =
              currentTask.startDate &&
              predecessorTask.dueDate &&
              currentTask.startDate < predecessorTask.dueDate;
            const isCritical =
              criticalPathIds.has(currentTask.id) && criticalPathIds.has(predecessorTask.id);

            lines.push({
              id: `${predecessorId}-to-${currentTask.id}`,
              x1,
              y1,
              x2,
              y2,
              isConflict,
              isCritical,
              predecessorTitle: predecessorTask.title,
              successorTitle: currentTask.title,
            });
          }
        }
      });
    });
    return lines;
  }, [flatVisibleRows, columnsData, criticalPathIds]);

  // Get matching pastel colors for ClickUp style light mode task bars
  const getPastelStyles = (hexColor: string) => {
    const lower = hexColor.toLowerCase();
    if (lower.includes("6366f1") || lower.includes("4f46e5")) {
      return { bg: "bg-indigo-50/95", border: "border-indigo-200", text: "text-indigo-800", progressBg: "bg-indigo-500/15" };
    }
    if (lower.includes("22c55e") || lower.includes("16a34a") || lower.includes("10b981")) {
      return { bg: "bg-emerald-50/95", border: "border-emerald-200", text: "text-emerald-800", progressBg: "bg-emerald-500/15" };
    }
    if (lower.includes("eab308") || lower.includes("d97706") || lower.includes("f59e0b")) {
      return { bg: "bg-amber-50/95", border: "border-amber-200", text: "text-amber-800", progressBg: "bg-amber-500/15" };
    }
    if (lower.includes("3b82f6") || lower.includes("2563eb")) {
      return { bg: "bg-blue-50/95", border: "border-blue-200", text: "text-blue-800", progressBg: "bg-blue-500/15" };
    }
    if (lower.includes("ef4444") || lower.includes("dc2626") || lower.includes("f43f5e")) {
      return { bg: "bg-rose-50/95", border: "border-rose-200", text: "text-rose-800", progressBg: "bg-rose-500/15" };
    }
    return { bg: "bg-slate-50/95", border: "border-slate-200", text: "text-slate-800", progressBg: "bg-slate-400/15" };
  };

  const isLight = false;

  return (
    <div
      id="gantt-root-view"
      className={`flex flex-col h-full flex-1 overflow-hidden select-none font-sans ${
        "bg-slate-50 dark:bg-[#0F1115] text-slate-800 dark:text-slate-200"
      }`}
    >
      {/* ClickUp Toolbar Controls */}
      <div
        id="gantt-control-bar"
        className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 ${
          "bg-white dark:bg-[#14171C] border-b border-slate-200 dark:border-slate-800"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <Calendar className={`w-5 h-5 ${"text-indigo-600 dark:text-indigo-400"}`} />
            <h2 className={`text-sm font-black uppercase tracking-wider ${"text-slate-900 dark:text-white"}`}>
              Timeline Scheduler
            </h2>
            <span
              className={`text-[9px] px-2 py-0.5 rounded font-black font-mono border ${
                isLight
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}
            >
              CLICKUP v4 PRO
            </span>
          </div>

          <div className={`h-4 w-px ${"bg-slate-200 dark:bg-slate-800"}`} />

          {/* Scale Zooms */}
          <div
            className={`flex items-center p-0.5 rounded-lg border text-[10px] font-black ${
              "bg-slate-50 dark:bg-[#0F1115] border-slate-200 dark:border-slate-800"
            }`}
          >
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setZoomMode(mode)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer capitalize ${
                  zoomMode === mode
                    ? isLight
                      ? "bg-indigo-600 text-slate-900 dark:text-white shadow-xs font-black"
                      : "bg-indigo-600 text-slate-900 dark:text-white shadow-sm"
                    : isLight
                    ? "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Group-by */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[10px] ${
              "bg-slate-50 dark:bg-[#0F1115] border-slate-200 dark:border-slate-800"
            }`}
          >
            <span className={"text-slate-500 dark:text-slate-400 font-bold"}>GROUP BY:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className={`bg-transparent font-black focus:outline-none border-none p-0 cursor-pointer text-[10px] ${
                "text-slate-700 dark:text-slate-300"
              }`}
            >
              <option value="none" className={"bg-white dark:bg-[#14171C]"}>
                Standard Flat
              </option>
              <option value="status" className={"bg-white dark:bg-[#14171C]"}>
                List Column Status
              </option>
              <option value="assignee" className={"bg-white dark:bg-[#14171C]"}>
                Responsible Assignee
              </option>
              <option value="priority" className={"bg-white dark:bg-[#14171C]"}>
                Task Urgency Priority
              </option>
            </select>
          </div>
        </div>

        {/* Theme Toggler, Filters and Search */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick theme toggler */}
          

          {/* Critical path toggle */}
          <button
            onClick={() => setIsCriticalPathEnabled(!isCriticalPathEnabled)}
            className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold flex items-center space-x-1.5 cursor-pointer transition-all ${
              isCriticalPathEnabled
                ? "bg-rose-500/10 text-rose-500 border-rose-300 animate-pulse font-extrabold"
                : isLight
                ? "bg-slate-50 text-slate-500 dark:text-slate-600 border-slate-300"
                : "bg-slate-50 dark:bg-[#0F1115] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Critical Path</span>
          </button>

          {/* Quick-add */}
          <button
            onClick={() => {
              setQuickStart(new Date().toISOString().split("T")[0]);
              setQuickDue(new Date().toISOString().split("T")[0]);
              setIsQuickAddOpen(true);
            }}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black flex items-center space-x-1 transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Task</span>
          </button>
        </div>
      </div>

      {/* Interactive Quick Filter Segments Bar */}
      <div
        id="quick-filters-strip"
        className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 text-[10px] ${
          "bg-white dark:bg-[#101216] border-b border-slate-200 dark:border-slate-800"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400 font-extrabold flex items-center space-x-1 uppercase">
            <Filter className="w-3 h-3 text-indigo-500" />
            <span>QUICK FILTERS:</span>
          </span>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={`border rounded px-2 py-0.5 font-bold focus:outline-none cursor-pointer ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            <option value="">Columns: All Statuses</option>
            {project.columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>

          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className={`border rounded px-2 py-0.5 font-bold focus:outline-none cursor-pointer ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            <option value="">Assignees: Everyone</option>
            <option value="Unassigned">👤 Unassigned</option>
            {Array.from(new Set(project.tasks.map((t) => t.assignee).filter(Boolean))).map((ass) => (
              <option key={ass} value={ass}>
                👤 {ass}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search matching tasks..."
            className={`border rounded-md px-2 py-0.5 text-[10px] w-40 focus:outline-none ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          />

          {(searchQuery || filterAssignee || filterPriority || filterStatus) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterAssignee("");
                setFilterPriority("");
                setFilterStatus("");
              }}
              className="text-indigo-600 hover:text-indigo-800 font-black flex items-center space-x-0.5 cursor-pointer ml-1"
            >
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Clear locks</span>
            </button>
          )}
        </div>

        {/* Date navigators */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevMonth}
            className={`p-1 border rounded text-[8px] cursor-pointer ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:text-white"
            }`}
          >
            ◀
          </button>
          <span className={`font-black uppercase tracking-widest font-mono text-[10px] px-2 py-0.5 rounded border ${
            "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
          }`}>
            {new Date(currentYear, currentMonth).toLocaleDateString("default", { month: "short", year: "numeric" })}
          </span>
          <button
            onClick={handleNextMonth}
            className={`p-1 border rounded text-[8px] cursor-pointer ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:text-white"
            }`}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Main Gantt Spreadsheet-Timeline Matrix Splitter Board */}
      <div id="gantt-board-canvas" className="flex-1 flex overflow-hidden">
        {/* Left Side dynamic task spreadsheet */}
        <div
          id="gantt-sidebar-pane"
          className={`w-[60vw] md:w-[320px] lg:w-[480px] shrink-0 border-r flex flex-col overflow-x-auto overflow-y-auto select-none divide-y ${
            "bg-white dark:bg-[#101216] border-slate-200 dark:border-slate-800 divide-slate-800/40"
          }`}
        >
          {/* Table Spreadsheet Headers */}
          <div
            className={`h-11 flex items-center text-[10px] font-extrabold uppercase tracking-wider z-10 sticky top-0 border-b min-w-max ${
              "bg-white dark:bg-[#14171C] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="w-[60vw] md:w-56 px-3 flex items-center space-x-1 shrink-0">
              <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>Task Name</span>
            </div>
            <div className="w-28 px-2 text-center border-l border-slate-300/20 shrink-0 hidden md:block">Assigned</div>
            <div className="w-28 px-2 text-center border-l border-slate-300/20 shrink-0 hidden lg:block">Status</div>
            <div className="w-12 px-1 text-center border-l border-slate-300/20 shrink-0 font-black hidden md:block">+</div>
          </div>

          {/* Combined Flat Row List on the Left Side */}
          {flatVisibleRows.map((row, idx) => {
            if (row.type === "group") {
              const isCollapsed = collapsedGroups[row.key];
              return (
                <div
                  key={`left-group-${row.key}`}
                  onClick={() => setCollapsedGroups({ ...collapsedGroups, [row.key]: !isCollapsed })}
                  className={`h-[48px] px-3 py-2 flex items-center justify-between text-[11px] font-black tracking-wide uppercase cursor-pointer select-none transition-all border-b ${
                    isLight
                      ? "bg-[#fafbfc] hover:bg-slate-50 text-slate-700 border-slate-200"
                      : "bg-white dark:bg-[#14171C]/40 hover:bg-white dark:hover:bg-[#14171C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 bg-white text-slate-500 dark:text-slate-600 text-[9px] font-black">
                      {isCollapsed ? "+" : "-"}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    <span className="truncate">{row.label}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                        "bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {row.count}
                    </span>
                  </div>

                  {row.count > 0 && (
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className={`w-14 h-1 rounded-full overflow-hidden ${"bg-slate-200 dark:bg-slate-800"}`}>
                        <div className="h-full bg-indigo-500" style={{ width: `${row.progressAvg}%` }} />
                      </div>
                      <span className="text-[8px] font-mono font-black text-slate-500 dark:text-slate-400">{row.progressAvg}%</span>
                    </div>
                  )}
                </div>
              );
            }

            // Task item
            const task = row.task;
            const isTaskCritical = criticalPathIds.has(task.id);
            const column = project.columns.find((c) => c.id === task.status);
            const isDone = task.progress === 100 || column?.title?.toLowerCase().includes("done") || column?.title?.toLowerCase().includes("completed");

            return (
              <div
                key={`left-task-${task.id}-${idx}`}
                className={`flex items-stretch h-[48px] transition-all border-b ${
                  isLight
                    ? "bg-white hover:bg-slate-50/70 border-slate-100"
                    : "bg-transparent hover:bg-slate-850/10 border-slate-200 dark:border-slate-800/50"
                } ${isTaskCritical ? "border-l-2 border-rose-500" : ""}`}
              >
                {/* Name cell with hierarchy identifier */}
                <div className="w-[60vw] md:w-56 px-3 py-2 flex items-center space-x-2 min-w-0 shrink-0">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400/80 font-mono font-semibold shrink-0 min-w-[20px]">
                    {row.indexStr}
                  </span>
                  <button
                    onClick={() => onOpenTaskModal(task)}
                    className={`text-left truncate font-bold text-[11px] flex-1 hover:text-indigo-600 cursor-pointer ${
                      isDone
                        ? isLight
                          ? "line-through text-slate-500 dark:text-slate-400 font-normal"
                          : "line-through text-slate-500 dark:text-slate-400 font-normal"
                        : isLight
                        ? "text-slate-700"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {task.title}
                  </button>
                </div>

                {/* Assigned column (round avatars directly like the image) */}
                <div className="w-28 px-2 py-2 border-l border-slate-300/10 hidden md:flex items-center space-x-1.5 justify-start shrink-0">
                  {task.assignee && task.assignee !== "Unassigned" ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-5.5 h-5.5 rounded-full bg-indigo-500 text-white font-black flex items-center justify-center text-[9px] shadow-xs uppercase">
                        {task.assignee.substring(0, 2)}
                      </div>
                      <span className={`text-[10px] font-medium truncate ${"text-slate-500 dark:text-slate-400"}`}>
                        {task.assignee}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">unassigned</span>
                  )}
                </div>

                {/* Status column (colored bullets exactly like the image) */}
                <div className="w-28 px-2 py-2 border-l border-slate-300/10 hidden lg:flex items-center space-x-1.5 justify-start shrink-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: column?.color || "#cbd5e1" }}
                  />
                  <span className={`text-[10px] font-extrabold truncate ${"text-slate-700 dark:text-slate-300"}`}>
                    {column?.title || "To Do"}
                  </span>
                </div>

                {/* Plus button cell */}
                <button
                  onClick={() => onOpenTaskModal(task)}
                  className={`w-12 px-1 border-l border-slate-300/10 hidden md:flex items-center justify-center hover:text-indigo-500 cursor-pointer text-slate-500 dark:text-slate-400`}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right Side scrollable interactive timeline grid */}
        <div ref={rightPanelRef} id="gantt-timeline-pane" className="flex-1 overflow-auto relative select-none">
          <div style={{ width: `${gridWidth}px` }} className="relative min-h-full flex flex-col">
            {/* SVG overlay for dependency linkages */}
            <svg
              className="absolute inset-0 pointer-events-none z-15"
              style={{ width: `${gridWidth}px`, height: `${flatVisibleRows.length * ROW_HEIGHT + HEADER_HEIGHT}px` }}
            >
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#818cf8" />
                </marker>
                <marker id="gantt-arrow-conflict" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>
              </defs>

              {dependencyLines.map((line) => {
                const adjustedY1 = line.y1 + HEADER_HEIGHT;
                const adjustedY2 = line.y2 + HEADER_HEIGHT;
                const dx = Math.abs(line.x2 - line.x1);
                const controlX1 = line.x1 + Math.min(dx * 0.4, 40);
                const controlX2 = line.x2 - Math.min(dx * 0.4, 40);

                const dPath = `M ${line.x1} ${adjustedY1} C ${controlX1} ${adjustedY1}, ${controlX2} ${adjustedY2}, ${line.x2} ${adjustedY2}`;
                const strokeColor = line.isConflict ? "#ef4444" : "#818cf8";
                const markerId = line.isConflict ? "gantt-arrow-conflict" : "gantt-arrow";

                return (
                  <g key={line.id}>
                    <path
                      d={dPath}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                      strokeDasharray={line.isConflict ? "3, 3" : "none"}
                      markerEnd={`url(#${markerId})`}
                    />
                    <path d={dPath} fill="none" stroke="transparent" strokeWidth={8} className="cursor-pointer pointer-events-auto">
                      <title>{`Link: ${line.predecessorTitle} ➔ ${line.successorTitle}`}</title>
                    </path>
                  </g>
                );
              })}
            </svg>

            {/* Timeline day column dates header */}
            <div
              id="gantt-timeline-dates-header"
              className={`h-11 flex sticky top-0 z-30 select-none border-b ${
                "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800"
              }`}
            >
              {columnsData.headers.map((hdr, i) => {
                const isWeekend = zoomMode === "day" && (hdr.subLabel === "S" || hdr.subLabel === "U");
                const isTodayCol = zoomMode === "day" && i === todayIndex;

                return (
                  <div
                    key={hdr.key}
                    onClick={() => zoomMode === "day" && (setQuickStart(hdr.key), setQuickDue(hdr.key), setIsQuickAddOpen(true))}
                    style={{ width: `${columnsData.columnWidth}px` }}
                    className={`h-full border-r shrink-0 flex flex-col items-center justify-center cursor-cell transition-colors ${
                      "border-slate-200 dark:border-slate-800/40"
                    } ${isWeekend ? ("bg-[#e2e8f0]/40 dark:bg-slate-900/30") : ""} ${
                      isTodayCol ? ("bg-rose-50 dark:bg-rose-500/5") : ""
                    }`}
                  >
                    <span className={`text-[7px] font-extrabold uppercase ${"text-slate-500 dark:text-slate-400"}`}>
                      {hdr.subLabel}
                    </span>
                    <span
                      className={`text-[10px] font-black font-mono ${
                        isTodayCol ? "text-rose-600" : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {hdr.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Timeline row cells */}
            <div id="gantt-timeline-grid-body" className="relative flex-1">
              {/* Floating Today vertical indicator line */}
              {todayIndex !== -1 && (
                <div
                  style={{
                    left: `${todayIndex * columnsData.columnWidth + columnsData.columnWidth / 2}px`,
                  }}
                  className="absolute top-0 bottom-0 w-[1.5px] bg-rose-500/75 z-20 pointer-events-none"
                >
                  <div className="absolute top-1.5 -translate-x-1/2 bg-rose-500 text-white font-extrabold text-[8px] uppercase px-1.5 py-0.5 rounded shadow-sm">
                    Today
                  </div>
                </div>
              )}

              {flatVisibleRows.map((row, idx) => {
                if (row.type === "group") {
                  return (
                    <div
                      key={`right-group-${row.key}`}
                      className={`h-[48px] relative flex items-center border-b ${
                        "bg-white dark:bg-[#14171C]/20 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      {/* Left timeline folder guide line exactly like the image */}
                      <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: `${row.color}15` }} />
                      <div className="absolute inset-x-0 bottom-[1px] h-[1px]" style={{ backgroundColor: row.color }} />
                      <span
                        className="absolute left-6 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
                        style={{ color: row.color, backgroundColor: `${row.color}10` }}
                      >
                        {row.label}
                      </span>
                    </div>
                  );
                }

                // Render task bar
                const task = row.task;
                const column = project.columns.find((c) => c.id === task.status);
                const priorityConfig = PRIORITIES.find((p) => p.value === task.priority);
                const { start, span, isVisible } = getGridPlot(task.startDate, task.dueDate);
                const isTaskCritical = criticalPathIds.has(task.id);

                const colorVal = column?.color || "#cbd5e1";
                const pastel = getPastelStyles(colorVal);

                return (
                  <div
                    key={`right-task-${task.id}-${idx}`}
                    className={`h-[48px] relative flex items-center border-b ${
                      "bg-transparent border-slate-200 dark:border-slate-800/50"
                    }`}
                  >
                    {/* Vertical background day guides inside cells */}
                    <div className="absolute inset-y-0 left-0 right-0 flex pointer-events-none">
                      {columnsData.headers.map((hdr) => {
                        const isWeekend = zoomMode === "day" && (hdr.subLabel === "S" || hdr.subLabel === "U");
                        return (
                          <div
                            key={hdr.key}
                            style={{ width: `${columnsData.columnWidth}px` }}
                            className={`h-full border-r shrink-0 ${
                              "border-slate-200 dark:border-slate-800/10"
                            } ${isWeekend ? ("bg-[#f1f5f9]/20 dark:bg-slate-900/10") : ""}`}
                          />
                        );
                      })}
                    </div>

                    {/* Interactive Slider Bar */}
                    {isVisible && (
                      <div
                        style={{
                          left: `${start * columnsData.columnWidth}px`,
                          width: `${span * columnsData.columnWidth}px`,
                          position: "absolute",
                        }}
                        className="px-1 h-7 z-10 flex items-center"
                      >
                        {task.isMilestone ? (
                          // ClickUp Diamond Milestone target
                          <div
                            onDoubleClick={() => onOpenTaskModal(task)}
                            className="flex items-center space-x-2 cursor-pointer group/milestone select-none relative"
                          >
                            <div className="w-3.5 h-3.5 bg-amber-500 hover:bg-amber-400 border border-white rotate-45 transform shrink-0 shadow-md flex items-center justify-center transition-all duration-200">
                              <span className="text-[5px] text-amber-950 font-black rotate-[-45deg]">M</span>
                            </div>
                            <span
                              className={`text-[9px] font-bold max-w-[150px] truncate border px-1.5 py-0.5 rounded shadow-sm ${
                                isLight
                                  ? "bg-white text-slate-700 border-amber-300"
                                  : "bg-slate-50 dark:bg-[#0F1115] text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {task.title}
                            </span>

                            {/* Double click shifts */}
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-900 dark:text-white rounded p-1 hidden group-hover/milestone:flex items-center space-x-1 z-30 text-[8px]">
                              <button onClick={() => updateTaskDates(task, -1, -1)} className="px-1 bg-slate-700 rounded">
                                -1d
                              </button>
                              <button onClick={() => updateTaskDates(task, 1, 1)} className="px-1 bg-slate-700 rounded">
                                +1d
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Interactive styled ClickUp task bar with progress overlay
                          <div
                            onDoubleClick={() => onOpenTaskModal(task)}
                            className={`h-5.5 w-full rounded-md border flex items-center justify-between px-2 text-[9px] font-black transition-all hover:shadow-md relative select-none cursor-pointer group/bar ${
                              isLight
                                ? `${pastel.bg} ${pastel.border} ${pastel.text}`
                                : "text-slate-900 dark:text-white shadow-xs"
                            } ${
                              isTaskCritical
                                ? "ring-2 ring-rose-500/40 border-rose-500"
                                : ""
                            }`}
                            style={
                              !isLight
                                ? {
                                    backgroundColor: colorVal,
                                    borderColor: isTaskCritical ? "#f43f5e" : `${colorVal}dd`,
                                  }
                                : undefined
                            }
                          >
                            {/* Darker left shading represent progress fill */}
                            <div
                              className={`absolute inset-y-0 left-0 transition-all pointer-events-none rounded-l-md ${
                                pastel.progressBg
                              }`}
                              style={{ width: `${task.progress || 0}%` }}
                            />

                            {/* Drag handles */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskDates(task, -1, 0);
                              }}
                              className="absolute left-0 top-0 bottom-0 w-1.5 hover:bg-black/10 cursor-w-resize rounded-l-md"
                              title="Drag left"
                            />

                            <div className="flex-1 truncate px-1 flex items-center space-x-1 pointer-events-none z-10">
                              <span className="truncate">{task.title}</span>
                              <span className="text-[7.5px] font-mono opacity-80">({task.progress || 0}%)</span>
                            </div>

                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskDates(task, 0, 1);
                              }}
                              className="absolute right-0 top-0 bottom-0 w-1.5 hover:bg-black/10 cursor-e-resize rounded-r-md"
                              title="Extend right"
                            />

                            {/* Floating avatar and label exactly like the ClickUp image! */}
                            <div className="absolute left-[calc(100%+8px)] flex items-center space-x-1.5 pointer-events-none select-none shrink-0 whitespace-nowrap z-10">
                              {task.assignee && task.assignee !== "Unassigned" ? (
                                <div className="w-5 h-5 rounded-full bg-indigo-500 border border-white text-slate-900 dark:text-white font-black flex items-center justify-center text-[8px] uppercase shadow-xs">
                                  {task.assignee.substring(0, 2)}
                                </div>
                              ) : null}
                              <span className={`text-[10px] font-semibold ${"text-slate-500 dark:text-slate-400"}`}>
                                | {task.title}
                              </span>
                            </div>

                            {/* Hover helpers */}
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded shadow-md p-1 hidden group-hover/bar:flex items-center space-x-1 z-35 text-[8px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTaskDates(task, -1, -1);
                                }}
                                className="px-1 bg-slate-700 rounded"
                              >
                                ◀ -1d
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTaskDates(task, 1, 1);
                                }}
                                className="px-1 bg-slate-700 rounded"
                              >
                                +1d ▶
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMilestone(task);
                                }}
                                className="px-1 bg-amber-600 rounded text-slate-900 dark:text-white text-[7px]"
                              >
                                ♦ Checkpoint
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Spacing empty check */}
              {flatVisibleRows.length === 0 && (
                <div className="py-24 text-center text-slate-500 dark:text-slate-400 text-xs italic flex flex-col items-center justify-center">
                  <Eye className="w-8 h-8 text-slate-500 dark:text-slate-400 mb-2" />
                  <span>No tasks matches current filters inside scheduling frame.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend guide rules bar */}
      <div
        id="gantt-view-legend"
        className={`p-3 text-[10px] flex flex-wrap justify-between items-center gap-3 shrink-0 border-t ${
          "bg-white dark:bg-[#101216] border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 bg-indigo-500 rounded" />
            <span>Task Bar (extend handles or shift left/right on hover)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <div className="w-3.5 h-3.5 bg-amber-500 rotate-45 transform border border-white" />
            <span>Diamond Milestone Checkpoint</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="border-b border-indigo-500 w-6 h-px shrink-0" />
            <span>Dependency line</span>
          </div>
          <div className="flex items-center space-x-1.5 text-rose-500 font-bold">
            <span className="border-b border-dashed border-rose-500 w-6 h-px shrink-0" />
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Scheduling conflict!</span>
          </div>
        </div>

        <div className={`text-[9px] font-medium italic px-2 py-1 rounded border ${
          "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800"
        }`}>
          💡 Click empty calendar cells to immediately schedule a task pre-filled with that date!
        </div>
      </div>

      {/* Quick creation dialog modal sheet */}
      {isQuickAddOpen && (
        <div id="quick-add-overlay" className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none animate-fade-in">
          <div className={`border rounded-xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col ${
            "bg-slate-50 dark:bg-[#1C1F26] border-slate-200 dark:border-slate-800"
          }`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${
              "bg-white dark:bg-[#14171C] border-slate-200 dark:border-slate-800"
            }`}>
              <div className="flex items-center space-x-2 text-indigo-500">
                <Calendar className="w-4 h-4" />
                <h3 className={`font-black text-xs uppercase tracking-wider ${"text-slate-900 dark:text-white"}`}>
                  Fast Timeline Schedule
                </h3>
              </div>
              <button onClick={() => setIsQuickAddOpen(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white font-black text-xs cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="p-4 space-y-4 text-xs">
              <div>
                <label className={`block text-[9px] font-black uppercase mb-1 ${"text-slate-500 dark:text-slate-400"}`}>
                  Task Title *
                </label>
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="e.g. Align Radio transceiver grid"
                  className={`w-full border rounded-lg px-2.5 py-2 focus:outline-none ${
                    "bg-slate-50 dark:bg-[#0F1115] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`block text-[9px] font-black uppercase mb-1 ${"text-slate-500 dark:text-slate-400"}`}>
                    Start Date
                  </label>
                  <DateInput
                    value={quickStart}
                    onChange={(e) => setQuickStart(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 focus:outline-none text-[10px] font-mono ${
                      "bg-slate-50 dark:bg-[#0F1115] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-[9px] font-black uppercase mb-1 ${"text-slate-500 dark:text-slate-400"}`}>
                    Due Date
                  </label>
                  <DateInput
                    value={quickDue}
                    onChange={(e) => setQuickDue(e.target.value)}
                    className={`w-full border rounded-lg px-2.5 py-1.5 focus:outline-none text-[10px] font-mono ${
                      "bg-slate-50 dark:bg-[#0F1115] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-300/10">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className={`px-3 py-1.5 rounded cursor-pointer text-[10px] ${
                    "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-black cursor-pointer text-[10px]"
                >
                  Schedule Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
