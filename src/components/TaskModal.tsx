import React, { useState, useEffect } from "react";
import { Task, BoardColumn, TaskPriority, SubTask, ChecklistTemplate, ConstraintType, RecurrenceFrequency } from "../types";
import { PRIORITIES } from "../data";
import { checkDoneGate } from "../lib/checklist";
import { CONSTRAINT_LABELS, isDeadlineMissed, constraintWarning } from "../lib/scheduling";
import {
  X,
  Calendar,
  User,
  Clock,
  Tag,
  CheckSquare,
  MessageSquare,
  Plus,
  Trash2,
  Bookmark,
  ChevronDown,
  AlertTriangle,
  Flag,
  Repeat,
} from "lucide-react";

interface TaskModalProps {
  task: Task | null; // null if creating a new task
  columns: BoardColumn[];
  defaultColumnId?: string;
  defaultDates?: { startDate: string; dueDate: string };
  projectTags: string[];
  projectMembers: string[];
  allTasks?: Task[]; // existing tasks for dependency linkage
  checklistTemplates?: ChecklistTemplate[];
  onSaveTemplate?: (name: string, items: string[]) => void;
  onDeleteTemplate?: (id: string) => void;
  onClose: () => void;
  onSave: (task: Partial<Task> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

export default function TaskModal({
  task,
  columns,
  defaultColumnId,
  defaultDates,
  projectTags,
  projectMembers,
  allTasks = [],
  checklistTemplates = [],
  onSaveTemplate,
  onDeleteTemplate,
  onClose,
  onSave,
  onDelete,
}: TaskModalProps) {
  const isEditing = !!task;

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("Unassigned");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState(0);
  const [actualHours, setActualHours] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [checklist, setChecklist] = useState<SubTask[]>([]);
  const [comments, setComments] = useState<{ id: string; author: string; text: string; date: string }[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [isMilestone, setIsMilestone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deadline, setDeadline] = useState("");
  const [constraintType, setConstraintType] = useState<ConstraintType>("none");
  const [constraintDate, setConstraintDate] = useState("");
  const [recurrenceFreq, setRecurrenceFreq] = useState<"none" | RecurrenceFrequency>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  // Subtask/Checklist/Comment helpers
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newCommentText, setNewCommentText] = useState("");
  const [newTagInput, setNewTagInput] = useState("");

  // Checklist template controls
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");
  // Definition-of-Done gate error when trying to save into a gated column.
  const [statusError, setStatusError] = useState<string | null>(null);

  // Populate form if editing
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setAssignee(task.assignee || "Unassigned");
      setStartDate(task.startDate || "");
      setDueDate(task.dueDate || "");
      setEstimatedHours(task.estimatedHours || 0);
      setActualHours(task.actualHours || 0);
      setSelectedTags(task.tags || []);
      setSubtasks(task.subtasks || []);
      setChecklist(task.checklist || []);
      setComments(task.comments || []);
      setDependencies(task.dependencies || []);
      setIsMilestone(task.isMilestone || false);
      setProgress(task.progress || 0);
      setDeadline(task.deadline || "");
      setConstraintType(task.constraintType || "none");
      setConstraintDate(task.constraintDate || "");
      setRecurrenceFreq(task.recurrence?.frequency || "none");
      setRecurrenceInterval(task.recurrence?.interval || 1);
    } else {
      setTitle("");
      setDescription("");
      setStatus(defaultColumnId || columns[0]?.id || "");
      setPriority("medium");
      setAssignee("Unassigned");
      setStartDate(defaultDates?.startDate || new Date().toISOString().split("T")[0]);
      setDueDate(defaultDates?.dueDate || new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0]); // 3 days in future
      setEstimatedHours(8);
      setActualHours(0);
      setSelectedTags([]);
      setSubtasks([]);
      setChecklist([]);
      setComments([]);
      setDependencies([]);
      setIsMilestone(false);
      setProgress(0);
      setDeadline("");
      setConstraintType("none");
      setConstraintDate("");
      setRecurrenceFreq("none");
      setRecurrenceInterval(1);
    }
  }, [task, columns, defaultColumnId, defaultDates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Definition-of-Done gate: block saving a task into a gated column unless
    // its checklist is fully complete.
    const targetColumn = columns.find((c) => c.id === status);
    const gateReason = checkDoneGate({ checklist }, targetColumn);
    if (gateReason) {
      setStatusError(gateReason);
      return;
    }
    setStatusError(null);

    onSave({
      ...(task ? { id: task.id } : {}),
      title,
      description,
      status,
      priority,
      assignee,
      startDate,
      dueDate,
      estimatedHours: Number(estimatedHours),
      actualHours: Number(actualHours),
      tags: selectedTags,
      subtasks,
      checklist,
      comments,
      dependencies,
      isMilestone,
      progress: Number(progress),
      deadline,
      constraintType,
      constraintDate: constraintType === "none" ? "" : constraintDate,
      recurrence:
        recurrenceFreq === "none"
          ? undefined
          : { frequency: recurrenceFreq, interval: Math.max(1, Number(recurrenceInterval) || 1) },
    });
    onClose();
  };

  // Subtasks actions
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSub: SubTask = {
      id: `sub-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks([...subtasks, newSub]);
    setNewSubtaskTitle("");
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(
      subtasks.map((sub) => (sub.id === id ? { ...sub, completed: !sub.completed } : sub))
    );
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter((sub) => sub.id !== id));
  };

  // Checklist item actions
  const handleAddChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    setChecklist([...checklist, { id: `chk-${Date.now()}`, title: newChecklistTitle.trim(), completed: false }]);
    setNewChecklistTitle("");
  };

  const handleToggleChecklist = (id: string) => {
    setChecklist(checklist.map((it) => (it.id === id ? { ...it, completed: !it.completed } : it)));
  };

  const handleDeleteChecklist = (id: string) => {
    setChecklist(checklist.filter((it) => it.id !== id));
  };

  // Checklist template actions (operate on the checklist)
  const applyTemplate = (tpl: ChecklistTemplate) => {
    const additions: SubTask[] = tpl.items.map((t, i) => ({
      id: `chk-${Date.now()}-${i}`,
      title: t,
      completed: false,
    }));
    setChecklist((cur) => [...cur, ...additions]);
    setShowTemplateMenu(false);
  };

  const saveAsTemplate = () => {
    const name = templateNameInput.trim();
    if (!name || checklist.length === 0) return;
    onSaveTemplate?.(name, checklist.map((s) => s.title));
    setTemplateNameInput("");
    setShowSaveTemplate(false);
  };

  // Comments actions
  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    const newCom = {
      id: `com-${Date.now()}`,
      author: "Alex Chen", // Default current user
      text: newCommentText.trim(),
      date: new Date().toISOString().split("T")[0],
    };
    setComments([...comments, newCom]);
    setNewCommentText("");
  };

  // Tags toggle helper
  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddNewTag = () => {
    const trimmed = newTagInput.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
      setNewTagInput("");
    }
  };

  return (
    <div
      id="task-modal-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto"
    >
      <div
        id="task-modal-container"
        className="bg-white dark:bg-[#1C1F26] rounded-none sm:rounded-xl shadow-2xl border-0 sm:border border-slate-200 dark:border-[#1E222B] w-full max-w-4xl h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90dvh] flex flex-col text-slate-800 dark:text-slate-200"
      >
        {/* Header */}
        <div
          id="task-modal-header"
          className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-[#161A22] flex items-center justify-between bg-slate-50 dark:bg-[#0F1115] rounded-t-none sm:rounded-t-xl"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center space-x-2">
            <span className="bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-sm border border-indigo-200 dark:border-indigo-500/20">
              {isEditing ? "Task Details" : "Create Task"}
            </span>
            {isEditing && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">ID: {task?.id}</span>
            )}
          </div>
          <button
            id="task-modal-close-btn"
            onClick={onClose}
            className="p-1 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1E222B] hover:text-slate-500 dark:hover:text-slate-400 dark:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Inputs */}
        <form id="task-modal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col md:flex-row gap-6">
          
          {/* Left Column (Primary Inputs) */}
          <div className="flex-1 space-y-4">
            <div>
              <label htmlFor="task-title-input" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Task Title *
              </label>
              <input
                id="task-title-input"
                type="text"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-slate-200 dark:border-[#1E222B] rounded-lg px-3.5 py-2 text-base font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label htmlFor="task-desc-input" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Description
              </label>
              <textarea
                id="task-desc-input"
                placeholder="Describe the objective, deliverables, or replication steps..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full border border-slate-200 dark:border-[#1E222B] rounded-lg px-3.5 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Subtasks Section */}
            <div id="subtasks-editor" className="border-t border-slate-100 dark:border-[#161A22] pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <CheckSquare className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Checklist ({checklist.filter((s) => s.completed).length}/{checklist.length})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Apply a saved checklist template */}
                  <div className="relative">
                    <button
                      type="button"
                      id="apply-template-btn"
                      onClick={() => { setShowTemplateMenu((v) => !v); setShowSaveTemplate(false); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg px-2 py-1 transition-colors"
                    >
                      <Bookmark className="w-3 h-3" /> Templates <ChevronDown className="w-3 h-3" />
                    </button>
                    {showTemplateMenu && (
                      <div
                        id="template-menu"
                        className="absolute right-0 top-7 z-30 w-56 max-h-52 overflow-y-auto bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#1E222B] rounded-lg shadow-2xl py-1 text-left"
                      >
                        {checklistTemplates.length === 0 ? (
                          <p className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
                            No templates yet. Add checklist items, then “Save as template”.
                          </p>
                        ) : (
                          checklistTemplates.map((tpl) => (
                            <div key={tpl.id} className="flex items-center justify-between group px-1">
                              <button
                                type="button"
                                onClick={() => applyTemplate(tpl)}
                                className="flex-1 text-left px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-[#1C1F26]"
                              >
                                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{tpl.name}</span>
                                <span className="block text-[10px] text-slate-500 dark:text-slate-400">{tpl.items.length} item{tpl.items.length === 1 ? "" : "s"}</span>
                              </button>
                              {onDeleteTemplate && (
                                <button
                                  type="button"
                                  title="Delete template"
                                  onClick={() => onDeleteTemplate(tpl.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {onSaveTemplate && checklist.length > 0 && (
                    <button
                      type="button"
                      id="save-template-btn"
                      onClick={() => { setShowSaveTemplate((v) => !v); setShowTemplateMenu(false); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#0F1115] hover:bg-slate-200 dark:hover:bg-[#1E222B] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Save as template
                    </button>
                  )}
                </div>
              </div>

              {showSaveTemplate && (
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    id="template-name-input"
                    type="text"
                    autoFocus
                    placeholder="Template name (e.g. Design Review)"
                    value={templateNameInput}
                    onChange={(e) => setTemplateNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveAsTemplate(); }
                    }}
                    className="flex-1 border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={saveAsTemplate}
                    disabled={!templateNameInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                  >
                    Save
                  </button>
                </div>
              )}

              <div className="space-y-1.5 mb-2.5 max-h-40 overflow-y-auto">
                {checklist.map((sub) => (
                  <div
                    key={sub.id}
                    id={`checklist-row-${sub.id}`}
                    className="flex items-center justify-between bg-slate-50 dark:bg-[#0F1115] px-3 py-1.5 rounded-lg border border-slate-100 dark:border-[#161A22] text-sm group"
                  >
                    <label className="flex items-center space-x-2.5 cursor-pointer flex-1">
                      <input
                        id={`checklist-check-${sub.id}`}
                        type="checkbox"
                        checked={sub.completed}
                        onChange={() => handleToggleChecklist(sub.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"
                      />
                      <span className={`text-slate-700 dark:text-slate-300 ${sub.completed ? "line-through text-slate-500 dark:text-slate-400" : ""}`}>
                        {sub.title}
                      </span>
                    </label>
                    <button
                      id={`checklist-delete-${sub.id}`}
                      type="button"
                      onClick={() => handleDeleteChecklist(sub.id)}
                      className="text-slate-500 dark:text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2">
                <input
                  id="new-checklist-input"
                  type="text"
                  placeholder="Add a checklist item…"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddChecklist();
                    }
                  }}
                  className="flex-1 border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  id="add-checklist-btn"
                  type="button"
                  onClick={handleAddChecklist}
                  className="bg-slate-100 hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Subtasks Section */}
            <div id="subtasks-editor" className="border-t border-slate-100 dark:border-[#161A22] pt-4">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                <CheckSquare className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Subtasks ({subtasks.filter((s) => s.completed).length}/{subtasks.length})</span>
              </div>

              <div className="space-y-1.5 mb-2.5 max-h-40 overflow-y-auto">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    id={`subtask-row-${sub.id}`}
                    className="flex items-center justify-between bg-slate-50 dark:bg-[#0F1115] px-3 py-1.5 rounded-lg border border-slate-100 dark:border-[#161A22] text-sm group"
                  >
                    <label className="flex items-center space-x-2.5 cursor-pointer flex-1">
                      <input
                        id={`subtask-check-${sub.id}`}
                        type="checkbox"
                        checked={sub.completed}
                        onChange={() => handleToggleSubtask(sub.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"
                      />
                      <span className={`text-slate-700 dark:text-slate-300 ${sub.completed ? "line-through text-slate-500 dark:text-slate-400" : ""}`}>
                        {sub.title}
                      </span>
                    </label>
                    <button
                      id={`subtask-delete-${sub.id}`}
                      type="button"
                      onClick={() => handleDeleteSubtask(sub.id)}
                      className="text-slate-500 dark:text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2">
                <input
                  id="new-subtask-input"
                  type="text"
                  placeholder="Add a subtask…"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  className="flex-1 border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  id="add-subtask-btn"
                  type="button"
                  onClick={handleAddSubtask}
                  className="bg-slate-100 hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Comments Section */}
            {isEditing && (
              <div id="comments-section" className="border-t border-slate-100 dark:border-[#161A22] pt-4">
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                  <MessageSquare className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Comments ({comments.length})</span>
                </div>

                <div className="space-y-3 mb-3 max-h-48 overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">No comments posted yet.</p>
                  ) : (
                    comments.map((com) => (
                      <div key={com.id} className="bg-slate-50 dark:bg-[#0F1115] p-2.5 rounded-lg border border-slate-100 dark:border-[#161A22] text-xs">
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1 font-semibold">
                          <span>{com.author}</span>
                          <span className="font-mono text-[10px]">{com.date}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{com.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex space-x-2">
                  <input
                    id="new-comment-input"
                    type="text"
                    placeholder="Write a comment..."
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    className="flex-1 border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    id="add-comment-btn"
                    type="button"
                    onClick={handleAddComment}
                    className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-3.5 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Meta Settings & Sidebar parameters) */}
          <div className="w-full md:w-80 bg-slate-50 dark:bg-[#0F1115] p-4 rounded-xl border border-slate-100 dark:border-[#161A22] space-y-4">
            
            {/* Status Dropdown */}
            <div>
              <label htmlFor="task-status-select" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Status / Column
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}{col.requireChecklist ? " ✓ (checklist required)" : ""}
                  </option>
                ))}
              </select>
              {statusError && (
                <p className="mt-1 flex items-start gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-snug">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{statusError}</span>
                </p>
              )}
            </div>

            {/* Assignee Selection */}
            <div>
              <label htmlFor="task-assignee-select" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Assignee</span>
              </label>
              <select
                id="task-assignee-select"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {projectMembers.map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Selection */}
            <div>
              <label htmlFor="task-priority-select" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Bookmark className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Priority</span>
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-1.5 text-xs font-semibold capitalize focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeline Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="task-start-date" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  <span>Start Date</span>
                </label>
                <input
                  id="task-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="task-due-date" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  <span>Due Date</span>
                </label>
                <input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Deadline & scheduling constraint */}
            <div className="space-y-2 bg-slate-50 dark:bg-[#0F1115] p-2.5 rounded-lg border border-slate-100 dark:border-[#161A22]">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="task-deadline" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                    <Flag className="w-3 h-3 text-rose-500" />
                    <span>Deadline</span>
                  </label>
                  <input
                    id="task-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="task-constraint-type" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Constraint
                  </label>
                  <select
                    id="task-constraint-type"
                    value={constraintType}
                    onChange={(e) => setConstraintType(e.target.value as ConstraintType)}
                    className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none"
                  >
                    {(Object.keys(CONSTRAINT_LABELS) as ConstraintType[]).map((c) => (
                      <option key={c} value={c}>{CONSTRAINT_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              </div>
              {constraintType !== "none" && (
                <div>
                  <label htmlFor="task-constraint-date" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Constraint date
                  </label>
                  <input
                    id="task-constraint-date"
                    type="date"
                    value={constraintDate}
                    onChange={(e) => setConstraintDate(e.target.value)}
                    className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  />
                </div>
              )}
              {isDeadlineMissed({ startDate, dueDate, deadline, constraintType, constraintDate }) && (
                <p className="flex items-start gap-1 text-[10px] font-semibold text-rose-500 leading-snug">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>Due date {dueDate} is past the deadline {deadline}.</span>
                </p>
              )}
              {constraintWarning({ startDate, dueDate, deadline, constraintType, constraintDate }) && (
                <p className="flex items-start gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-snug">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{constraintWarning({ startDate, dueDate, deadline, constraintType, constraintDate })}</span>
                </p>
              )}
            </div>

            {/* Recurrence */}
            <div className="bg-slate-50 dark:bg-[#0F1115] p-2.5 rounded-lg border border-slate-100 dark:border-[#161A22]">
              <label htmlFor="task-recurrence-freq" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Repeat className="w-3 h-3 text-indigo-500" />
                <span>Repeat</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  id="task-recurrence-freq"
                  value={recurrenceFreq}
                  onChange={(e) => setRecurrenceFreq(e.target.value as "none" | RecurrenceFrequency)}
                  className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {recurrenceFreq !== "none" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">every</span>
                    <input
                      id="task-recurrence-interval"
                      type="number"
                      min="1"
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value)))}
                      className="w-16 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {recurrenceFreq === "daily" ? "day(s)" : recurrenceFreq === "weekly" ? "week(s)" : "month(s)"}
                    </span>
                  </div>
                )}
              </div>
              {recurrenceFreq !== "none" && (
                <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400 leading-snug">
                  Completing this task auto-creates the next occurrence with dates advanced.
                </p>
              )}
            </div>

            {/* Estimation Hours */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="task-estimated-hours" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  <span>Estimated (Hrs)</span>
                </label>
                <input
                  id="task-estimated-hours"
                  type="number"
                  min="0"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="task-actual-hours" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                  <span>Logged Time</span>
                </label>
                <input
                  id="task-actual-hours"
                  type="number"
                  min="0"
                  value={actualHours}
                  onChange={(e) => setActualHours(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Gantt & ClickUp advanced properties */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-[#0F1115] p-2.5 rounded-lg border border-slate-100 dark:border-[#161A22]">
              {/* Milestone toggle */}
              <div className="flex flex-col justify-center">
                <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Task Classification</span>
                </span>
                <label className="flex items-center space-x-2 cursor-pointer mt-1 select-none">
                  <input
                    type="checkbox"
                    checked={isMilestone}
                    onChange={(e) => setIsMilestone(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Milestone Task</span>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-none">Diamond target checkpoint</p>
                  </div>
                </label>
              </div>

              {/* Progress percentage slider */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span className="flex items-center space-x-1">
                    <CheckSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>Completion Progress</span>
                  </span>
                  <span className="font-mono text-indigo-600 font-bold">{progress}%</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Dependency Predecessors linking */}
            <div className="bg-slate-50 dark:bg-[#0F1115] p-2.5 rounded-lg border border-slate-100 dark:border-[#161A22]">
              <label htmlFor="dep-task-select" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Plus className="w-3.5 h-3.5 text-rose-500" />
                <span>Predecessors (Gantt Link)</span>
              </label>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1.5">This task cannot start until selected predecessor tasks are Completed.</p>
              
              <div className="flex gap-2">
                <select
                  id="dep-task-select"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !dependencies.includes(val)) {
                      setDependencies([...dependencies, val]);
                    }
                    e.target.value = ""; // reset selection
                  }}
                  className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none flex-1 font-medium cursor-pointer"
                >
                  <option value="">Link a Predecessor Task...</option>
                  {allTasks
                    .filter((t) => (!task || t.id !== task.id) && !dependencies.includes(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.startDate || "No Start"})
                      </option>
                    ))}
                </select>
              </div>

              {/* Display currently linked dependencies */}
              {dependencies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {dependencies.map((depId) => {
                    const depTask = allTasks.find((t) => t.id === depId);
                    if (!depTask) return null;
                    const depColumn = columns.find((c) => c.id === depTask.status);
                    return (
                      <div
                        key={depId}
                        className="flex items-center space-x-1 px-2 py-1 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg shadow-xs text-[10px] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600"
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full" 
                          style={{ backgroundColor: depColumn?.color || "#cbd5e1" }}
                        />
                        <span className="font-semibold max-w-[140px] truncate">{depTask.title}</span>
                        <button
                          type="button"
                          onClick={() => setDependencies(dependencies.filter((id) => id !== depId))}
                          className="text-slate-500 dark:text-slate-400 hover:text-rose-500 font-bold ml-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tags Selection */}
            <div>
              <label htmlFor="tag-selector-container" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Tag className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Tags</span>
              </label>

              {/* Display tags associated with project as clickable toggles */}
              <div id="tag-selector-container" className="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto">
                {projectTags.length === 0 ? (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">No custom tags in Space yet.</span>
                ) : (
                  projectTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        id={`toggle-tag-btn-${tag}`}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-slate-900 dark:text-white dark:text-white border-indigo-700"
                            : "bg-white dark:bg-[#14171C] text-slate-500 dark:text-slate-600 border-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E222B]"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Add custom tag */}
              <div className="flex space-x-1">
                <input
                  id="new-tag-input-field"
                  type="text"
                  placeholder="New tag..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewTag();
                    }
                  }}
                  className="flex-1 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded px-2 py-1 text-[10px] text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <button
                  id="create-new-tag-btn"
                  type="button"
                  onClick={handleAddNewTag}
                  className="bg-slate-100 hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-[10px] font-semibold"
                >
                  Create
                </button>
              </div>
            </div>

          </div>
        </form>

        {/* Footer Actions */}
        <div
          id="task-modal-footer"
          className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-[#161A22] bg-slate-50 dark:bg-[#0F1115] flex flex-wrap gap-3 items-center justify-between rounded-b-none sm:rounded-b-xl"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div>
            {isEditing && onDelete && (
              <button
                id="task-delete-btn-action"
                type="button"
                onClick={() => {
                  onDelete(task!.id);
                  onClose();
                }}
                className="px-4 py-2 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              id="task-cancel-btn-action"
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-[#1E222B] text-slate-500 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#1E222B] rounded-lg text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              id="task-submit-btn-action"
              onClick={handleSubmit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              {isEditing ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
