import React, { useState } from "react";
import { Project, Task, TaskPriority } from "../types";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon, 
  User, 
  Clock, 
  Check, 
  AlertTriangle, 
  Info, 
  ArrowRight,
  Filter,
  CalendarDays,
  X
} from "lucide-react";

interface CalendarViewProps {
  project: Project;
  onUpdateProject: (updatedProj: Project) => void;
  onOpenTaskModal: (task: Task | null, colId?: string, dates?: { startDate: string; dueDate: string }) => void;
  globalSearch: string;
  globalPriority: string;
  globalAssignee: string;
  globalStatus: string;
}

export default function CalendarView({
  project,
  onUpdateProject,
  onOpenTaskModal,
  globalSearch,
  globalPriority,
  globalAssignee,
  globalStatus,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [draggedOverDate, setDraggedOverDate] = useState<string | null>(null);
  // Day whose full task list is open in the peek popover.
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  // Max task chips shown inline in a day cell before collapsing to "+N more".
  const MAX_VISIBLE = 3;
  // Overlay drawer on phones — start closed there so it doesn't cover the grid
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(
    () => typeof window === "undefined" || window.innerWidth >= 768
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Helper: Month name array
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper: Get color badge styling based on priority
  const getPriorityBadgeStyles = (priority: TaskPriority) => {
    switch (priority.toLowerCase() as TaskPriority) {
      case "urgent":
        return "bg-rose-50 dark:bg-rose-950/25 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/30";
      case "high":
        return "bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30";
      case "medium":
        return "bg-indigo-50 dark:bg-indigo-950/25 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/30";
      default:
        return "bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700/50";
    }
  };

  // Helper: Get color indicator for a task's status based on workspace board columns
  const getStatusBorderColor = (statusId: string) => {
    const col = project.columns.find((c) => c.id === statusId);
    return col ? col.color : "#64748b";
  };

  // Dynamic filter matching logic
  const getFilteredTasks = () => {
    return project.tasks.filter((task) => {
      // Must have a valid dueDate to render in calendar grid
      if (!task.dueDate) return false;

      // Filter: Search Term
      if (globalSearch) {
        const s = globalSearch.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(s);
        const matchDesc = task.description.toLowerCase().includes(s);
        const matchId = task.id.toLowerCase().includes(s);
        if (!matchTitle && !matchDesc && !matchId) return false;
      }

      // Filter: Priority Match
      if (globalPriority && globalPriority !== "all") {
        if (task.priority.toLowerCase() !== globalPriority.toLowerCase()) return false;
      }

      // Filter: Assignee Match
      if (globalAssignee && globalAssignee !== "all") {
        if (task.assignee !== globalAssignee) return false;
      }

      // Filter: Status Match
      if (globalStatus && globalStatus !== "all") {
        if (task.status !== globalStatus) return false;
      }

      return true;
    });
  };

  // Helper: List of unscheduled tasks (tasks without due dates)
  const getUnscheduledTasks = () => {
    return project.tasks.filter((task) => {
      // Unscheduled tasks don't have a dueDate
      if (task.dueDate) return false;

      // Filter: Search Term
      if (globalSearch) {
        const s = globalSearch.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(s);
        const matchId = task.id.toLowerCase().includes(s);
        if (!matchTitle && !matchId) return false;
      }

      // Filter: Assignee Match
      if (globalAssignee && globalAssignee !== "all") {
        if (task.assignee !== globalAssignee) return false;
      }

      // Filter: Status Match
      if (globalStatus && globalStatus !== "all") {
        if (task.status !== globalStatus) return false;
      }

      return true;
    });
  };

  const filteredTasks = getFilteredTasks();
  const unscheduledTasks = getUnscheduledTasks();

  // Generate date grid for Monthly Calendar Grid (6 rows x 7 cols = 42 cells)
  const generateCalendarCells = () => {
    const cells: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];

    // First weekday of target month
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0 = Sunday, 1 = Monday etc

    // Total days in target month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Total days in previous month
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // 1. Previous Month Overflow Days
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthTotalDays - i);
      cells.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().split("T")[0]
      });
    }

    // 2. Current Month Days
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const d = new Date(year, month, dayNum);
      cells.push({
        date: d,
        isCurrentMonth: true,
        dateStr: d.toISOString().split("T")[0]
      });
    }

    // 3. Next Month Overflow Days to fill grid up to 42 cells
    let nextMonthDay = 1;
    while (cells.length < 42) {
      const d = new Date(year, month + 1, nextMonthDay);
      cells.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().split("T")[0]
      });
      nextMonthDay++;
    }

    return cells;
  };

  const calendarCells = generateCalendarCells();

  // Tasks scheduled within the visible month (respects active filters).
  const monthScheduledCount = filteredTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(`${t.dueDate}T00:00:00`);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
  const dayDetailTasks = dayDetail
    ? filteredTasks.filter((t) => t.dueDate === dayDetail)
    : [];

  // HTML5 Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    if (draggedOverDate !== dateStr) {
      setDraggedOverDate(dateStr);
    }
  };

  const handleDragLeave = () => {
    setDraggedOverDate(null);
  };

  const scheduleTask = (taskId: string, dateStr: string) => {
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedTask = {
      ...task,
      startDate: task.startDate || dateStr,
      dueDate: dateStr,
    };
    onUpdateProject({
      ...project,
      tasks: project.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    });
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDraggedOverDate(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;
    scheduleTask(taskId, dateStr);
  };

  // Tap-to-schedule (touch devices can't use HTML5 drag & drop): arm a
  // backlog task, then tap a calendar day to place it.
  const [armedTaskId, setArmedTaskId] = useState<string | null>(null);
  const armedTask = armedTaskId
    ? project.tasks.find((t) => t.id === armedTaskId)
    : null;

  const handleCellTap = (dateStr: string) => {
    if (!armedTaskId) return;
    scheduleTask(armedTaskId, dateStr);
    setArmedTaskId(null);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div id="calendar-grid-view-root" className="flex h-full w-full overflow-hidden select-none bg-slate-50 dark:bg-[#0F1115] text-slate-800 dark:text-slate-200">
      
      {/* LEFT SECTION: MAIN CALENDAR STAGE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden p-3 md:p-6 border-r border-slate-200 dark:border-[#1E222B]">
        
        {/* Navigation Toolbar */}
        <div id="calendar-view-toolbar" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#1E222B] mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white tracking-wide flex items-center gap-2">
                Calendar Grid
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                  {monthScheduledCount} scheduled
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Manage dates, schedule milestones, and drag tasks onto the interactive timeline.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Nav Controllers */}
            <div className="flex items-center bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg p-0.5 shadow-xs">
              <button
                onClick={handlePrevMonth}
                title="Previous Month"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-900 dark:text-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <span className="px-3 text-xs font-bold font-mono text-slate-700 dark:text-slate-350 select-none min-w-[120px] text-center">
                {monthNames[month]} {year}
              </span>

              <button
                onClick={handleNextMonth}
                title="Next Month"
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-900 dark:text-white transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleToday}
              className="px-3 py-1.5 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Today
            </button>

            <button
              onClick={() => setShowUnscheduled(!showUnscheduled)}
              className={`px-3 py-1.5 border text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer ${
                showUnscheduled
                  ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                  : "bg-white dark:bg-[#14171C] border-slate-200 dark:border-[#1E222B] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {showUnscheduled ? "Hide Sidebar" : "Unscheduled List"}
            </button>
          </div>
        </div>

        {/* Tap-to-schedule banner */}
        {armedTask && (
          <div className="mb-3 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white shadow-[0_4px_16px_rgba(79,70,229,0.35)]">
            <span className="text-xs font-bold truncate">
              Tap a day to schedule “{armedTask.title}”
            </span>
            <button
              onClick={() => setArmedTaskId(null)}
              className="shrink-0 text-[11px] font-black uppercase tracking-wide bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Calendar Grid Container */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl shadow-xs flex flex-col">
          <div className="flex-1 flex flex-col min-w-[700px]">
            {/* Weekdays Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-[#1E222B] bg-slate-50 dark:bg-[#0B0D11] select-none">
              {weekdayNames.map((day) => (
                <div
                  key={day}
                  className="py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-[#1E222B] last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Monthly Days Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6">
            {calendarCells.map(({ date, isCurrentMonth, dateStr }, idx) => {
              const dayTasks = filteredTasks.filter((t) => t.dueDate === dateStr);
              const isTodayCell = isToday(date);
              const isDragOver = draggedOverDate === dateStr;
              const isWeekend = idx % 7 === 0 || idx % 7 === 6;
              const visibleTasks = dayTasks.slice(0, MAX_VISIBLE);
              const overflowCount = dayTasks.length - visibleTasks.length;

              return (
                <div
                  key={`${dateStr}-${idx}`}
                  onDragOver={(e) => handleDragOver(e, dateStr)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dateStr)}
                  onClick={() => handleCellTap(dateStr)}
                  className={`relative flex flex-col h-full border-r border-b border-slate-200 dark:border-[#1E222B] [nth-child(7n)]:border-r-0 group transition-all overflow-hidden ${
                    isCurrentMonth
                      ? isWeekend
                        ? "bg-slate-50/70 dark:bg-[#101318]"
                        : "bg-white dark:bg-[#14171C]"
                      : "bg-slate-100/60 dark:bg-[#0C0E12] text-slate-400 dark:text-slate-600"
                  } ${isTodayCell ? "ring-2 ring-inset ring-indigo-500/60 bg-indigo-50/40 dark:bg-indigo-500/[0.07]" : ""} ${
                    isDragOver ? "bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/40 z-10" : ""
                  } ${armedTaskId ? "cursor-pointer hover:bg-indigo-500/10 active:bg-indigo-500/20" : ""}`}
                >
                  {/* Cell Header: date, task-count, quick add */}
                  <div className="flex items-center justify-between px-1.5 pt-1.5 pb-1 select-none shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          isTodayCell
                            ? "bg-indigo-600 text-white font-extrabold shadow-sm"
                            : isCurrentMonth
                            ? "text-slate-700 dark:text-slate-300"
                            : "text-slate-400 dark:text-slate-600"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{dayTasks.length}</span>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTaskModal(null, undefined, { startDate: dateStr, dueDate: dateStr });
                      }}
                      title="Schedule new task on this date"
                      className="opacity-60 md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Tasks (capped for a uniform grid; overflow opens the day peek) */}
                  <div className="flex-1 px-1.5 pb-1.5 space-y-1 overflow-hidden">
                    {visibleTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTaskModal(task);
                        }}
                        style={{ borderLeftColor: getStatusBorderColor(task.status) }}
                        className={`text-[10px] font-medium py-1 px-1.5 rounded-md border-l-2 border-y border-r border-slate-200 dark:border-[#1E222B]/75 flex flex-col space-y-0.5 cursor-grab active:cursor-grabbing hover:brightness-95 dark:hover:brightness-110 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${getPriorityBadgeStyles(
                          task.priority
                        )}`}
                        title={`[${task.id.toUpperCase()}] ${task.title} (Click to edit, Drag to reschedule)`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold truncate max-w-[85%] text-slate-800 dark:text-slate-200">
                            {task.title}
                          </span>
                        </div>
                        {task.assignee && task.assignee !== "Unassigned" && (
                          <div className="flex items-center gap-1 text-[8px] font-semibold text-slate-500 dark:text-slate-400">
                            <User className="w-2.5 h-2.5 text-slate-500 dark:text-slate-400" />
                            <span>{task.assignee}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDayDetail(dateStr);
                        }}
                        className="w-full text-left text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 py-0.5 cursor-pointer"
                      >
                        +{overflowCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: SIDEBAR DRAWER FOR UNSCHEDULED TASKS */}
      {showUnscheduled && (
        <div id="calendar-unscheduled-sidebar" className="w-80 max-w-[85vw] h-full flex flex-col bg-white dark:bg-[#14171C] overflow-hidden shrink-0 select-none absolute md:relative right-0 z-20 border-l border-slate-200 dark:border-[#1E222B] shadow-2xl md:shadow-none">
          <div className="p-4 border-b border-slate-200 dark:border-[#1E222B] flex items-center justify-between bg-slate-50 dark:bg-[#0B0D11]/30">
            <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400">
              <CalendarIcon className="w-4 h-4" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Unscheduled Backlog
              </h3>
            </div>
            <span className="bg-slate-200/80 dark:bg-[#0F1115] text-slate-500 dark:text-slate-600 dark:text-indigo-400 border border-slate-300 dark:border-slate-800/80 text-[10px] font-black px-2 py-0.5 rounded-full">
              {unscheduledTasks.length}
            </span>
          </div>

          {/* Quick Info Bar */}
          <div className="p-3 bg-indigo-500/5 border-b border-slate-200 dark:border-[#1E222B] flex items-start space-x-2">
            <Info className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              Drag a task onto any calendar day — or tap its Schedule button, then tap the target day.
            </p>
          </div>

          {/* Scrollable backlog list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {unscheduledTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-300">Clean Backlog</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 max-w-[180px]">
                  All project tasks have been scheduled onto the calendar timeline.
                </p>
              </div>
            ) : (
              unscheduledTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => onOpenTaskModal(task)}
                  style={{ borderLeftColor: getStatusBorderColor(task.status) }}
                  className={`bg-slate-50 dark:bg-[#0B0D11] border border-slate-200 dark:border-[#1E222B] rounded-xl p-3 border-l-4 hover:border-indigo-500/30 dark:hover:border-indigo-500/20 transition-all cursor-grab active:cursor-grabbing group hover:shadow-xs flex flex-col space-y-2 ${
                    armedTaskId === task.id ? "ring-2 ring-indigo-500" : ""
                  }`}
                  title="Drag onto the calendar, or tap Schedule and then a day"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[9px] font-mono font-extrabold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase">
                      {task.id.toUpperCase()}
                    </span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      task.priority === "urgent" ? "bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400" :
                      task.priority === "high" ? "bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400" :
                      task.priority === "medium" ? "bg-indigo-100 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400" :
                      "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-600 dark:text-slate-400"
                    }`}>
                      {task.priority}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {task.title}
                  </h4>

                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#1E222B]/60 pt-2 text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 font-semibold">
                      <User className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                      {task.assignee || "Unassigned"}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setArmedTaskId(task.id);
                        // On phones the drawer covers the grid — close it so
                        // the user can tap a day.
                        if (window.innerWidth < 768) setShowUnscheduled(false);
                      }}
                      className="text-[10px] font-black text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <span>Schedule</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DAY PEEK: full task list for a single day */}
      {dayDetail && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDayDetail(null)}
        >
          <div
            className="w-full max-w-sm max-h-[80vh] bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-[#1E222B] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    {new Date(`${dayDetail}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {dayDetailTasks.length} scheduled
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDayDetail(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1E222B] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {dayDetailTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    setDayDetail(null);
                    onOpenTaskModal(task);
                  }}
                  style={{ borderLeftColor: getStatusBorderColor(task.status) }}
                  className="w-full text-left bg-slate-50 dark:bg-[#0B0D11] border border-slate-200 dark:border-[#1E222B] border-l-4 rounded-lg p-2.5 hover:border-indigo-500/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{task.title}</span>
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {task.priority}
                    </span>
                  </div>
                  {task.assignee && task.assignee !== "Unassigned" && (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
                      <User className="w-3 h-3" />
                      <span>{task.assignee}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-[#1E222B]">
              <button
                onClick={() => {
                  const d = dayDetail;
                  setDayDetail(null);
                  onOpenTaskModal(null, undefined, { startDate: d, dueDate: d });
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add task on this day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
