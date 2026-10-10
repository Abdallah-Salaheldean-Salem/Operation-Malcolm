import React, { useState } from "react";
import { Project, IdeaItem } from "../types";
import { Plus, Trash2, Edit2, Calendar, Target, Clock, Filter, AlertCircle, CheckCircle2, Layers, AlertOctagon, Archive } from "lucide-react";

interface IdeasViewProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
}

const ZONES = [
  { 
    id: "ready", 
    title: "Zone 1: DO", 
    subtitle: "IMPORTANT & URGENT",
    color: "emerald",
    icon: CheckCircle2,
    borderClass: "border-emerald-200 dark:border-emerald-900/50",
    bgClass: "bg-emerald-50 dark:bg-emerald-900/10",
    textClass: "text-emerald-600 dark:text-emerald-400"
  },
  { 
    id: "building", 
    title: "Zone 2: SCHEDULE", 
    subtitle: "IMPORTANT & NOT URGENT",
    color: "blue",
    icon: Layers,
    borderClass: "border-blue-200 dark:border-blue-900/50",
    bgClass: "bg-blue-50 dark:bg-blue-900/10",
    textClass: "text-blue-600 dark:text-blue-400"
  },
  { 
    id: "planning", 
    title: "Zone 3: DELEGATE", 
    subtitle: "NOT IMPORTANT & URGENT",
    color: "rose",
    icon: AlertOctagon,
    borderClass: "border-rose-200 dark:border-rose-900/50",
    bgClass: "bg-rose-50 dark:bg-rose-900/10",
    textClass: "text-rose-600 dark:text-rose-400"
  },
  { 
    id: "hold", 
    title: "Zone 4: ELIMINATE", 
    subtitle: "NOT IMPORTANT & NOT URGENT",
    color: "slate",
    icon: Archive,
    borderClass: "border-slate-200 dark:border-slate-800",
    bgClass: "bg-slate-50 dark:bg-slate-800/20",
    textClass: "text-slate-600 dark:text-slate-400"
  }
];

export default function IdeasView({ project, onUpdateProject }: IdeasViewProps) {
  const defaultIdeas: IdeaItem[] = [];

  const ideas = project.ideas && project.ideas.length > 0 ? project.ideas : defaultIdeas;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState("All");

  // Modal State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("NEXT MONTH");
  const [status, setStatus] = useState("ready");
  const [priority, setPriority] = useState("HIGH");

  // Drag state
  const [draggedIdeaId, setDraggedIdeaId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  const filteredIdeas = ideas.filter(idea => {
    if (priorityFilter !== "All" && idea.priority.toUpperCase() !== priorityFilter.toUpperCase()) return false;
    return true;
  });

  const getPriorityBadge = (p: string) => {
    const up = p.toUpperCase();
    if (up === "HIGH") return "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400";
    if (up === "MEDIUM") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    return "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400";
  };

  const getLeftBorderColor = (status: string) => {
    if (status === "ready") return "border-l-emerald-500";
    if (status === "building") return "border-l-blue-500";
    if (status === "planning") return "border-l-rose-500";
    return "border-l-slate-400";
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedIdeaId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverZone !== zoneId) {
      setDragOverZone(zoneId);
    }
  };

  const handleDragLeave = () => {
    setDragOverZone(null);
  };

  const handleDrop = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    setDragOverZone(null);
    if (!draggedIdeaId) return;

    const newIdeas = ideas.map(idea => 
      idea.id === draggedIdeaId ? { ...idea, status: zoneId } : idea
    );
    onUpdateProject({ ...project, ideas: newIdeas });
    setDraggedIdeaId(null);
  };

  const openModal = (idea?: IdeaItem) => {
    if (idea) {
      setEditingId(idea.id);
      setTitle(idea.title);
      setDescription(idea.description || "");
      setTimeHorizon(idea.timeHorizon.toUpperCase());
      setStatus(idea.status);
      setPriority(idea.priority.toUpperCase());
    } else {
      setEditingId(null);
      setTitle("");
      setDescription("");
      setTimeHorizon("NEXT MONTH");
      setStatus("ready");
      setPriority("MEDIUM");
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newIdea: IdeaItem = {
      id: editingId || `idea-${Date.now()}`,
      title,
      description,
      timeHorizon,
      targetDate: "",
      status,
      priority,
      zone: ""
    };

    let newIdeas;
    if (editingId) {
      newIdeas = ideas.map(i => (i.id === editingId ? newIdea : i));
    } else {
      newIdeas = [...ideas, newIdea];
    }

    onUpdateProject({ ...project, ideas: newIdeas });
    closeModal();
  };

  const handleDelete = (id: string) => {
    const newIdeas = ideas.filter(i => i.id !== id);
    onUpdateProject({ ...project, ideas: newIdeas });
  };

  return (
    <div id="ideas-matrix-root" className="flex flex-col h-full bg-white dark:bg-[#0F1115] flex-1 overflow-hidden font-sans">
      {/* Header */}
      <div className="p-4 md:p-6 bg-white dark:bg-[#14171C] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Ideas and Priorities</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Eisenhower Matrix</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-700 dark:text-slate-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="All">All Priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* 2x2 Matrix */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 dark:bg-[#0F1115]">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 xl:h-full xl:min-h-[600px]">
          {ZONES.map(zone => {
            const zoneIdeas = filteredIdeas.filter(i => i.status === zone.id);
            const isDragOver = dragOverZone === zone.id;
            const Icon = zone.icon;

            return (
              <div
                key={zone.id}
                onDragOver={(e) => handleDragOver(e, zone.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, zone.id)}
                className={`flex flex-col bg-white dark:bg-[#14171C] rounded-xl border ${isDragOver ? 'ring-2 ring-indigo-500 border-transparent' : zone.borderClass} transition-all overflow-hidden max-h-[60vh] xl:max-h-none xl:h-full`}
              >
                {/* Zone Header */}
                <div className={`p-4 border-b ${zone.borderClass} ${zone.bgClass} flex items-center justify-between`}>
                  <div className="flex items-center space-x-3">
                    <div className={`${zone.textClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 dark:text-white text-sm">{zone.title}</h2>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${zone.textClass}`}>{zone.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Total: {zoneIdeas.length}
                  </span>
                </div>

                {/* Zone Content (Scrollable List) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {zoneIdeas.map(idea => (
                    <div
                      key={idea.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idea.id)}
                      className={`bg-white dark:bg-[#1C1F26] border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative border-l-4 ${getLeftBorderColor(idea.status)}`}
                    >
                      {/* Floating Actions */}
                      <div className="opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 absolute right-3 top-3">
                        <button onClick={() => openModal(idea)} className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-md cursor-pointer transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(idea.id)} className="p-1.5 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-500 rounded-md cursor-pointer transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h4 className="font-bold text-slate-900 dark:text-white text-sm pr-16 mb-1">
                        {idea.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                        {idea.description || "Requires comprehensive breakdown of scope."}
                      </p>

                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center space-x-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#14171C] px-2 py-1 rounded">
                          <Clock className="w-3 h-3" />
                          <span className="uppercase">{idea.timeHorizon}</span>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${getPriorityBadge(idea.priority)}`}>
                          {idea.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                  {zoneIdeas.length === 0 && (
                    <div className="h-full min-h-[64px] md:min-h-[100px] flex items-center justify-center text-xs font-semibold text-slate-400 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#1C1F26]">
              <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-sm flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-indigo-500" />
                <span>{editingId ? "Edit Task" : "New Task"}</span>
              </h3>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors text-xl leading-none cursor-pointer font-bold"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Task Name *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="e.g. Build fixed-asset report"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  placeholder="Requires comprehensive breakdown of scope."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Zone (Matrix)</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    {ZONES.map(z => (
                      <option key={z.id} value={z.id}>{z.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Time Horizon</label>
                <select
                  value={timeHorizon}
                  onChange={e => setTimeHorizon(e.target.value)}
                  className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                >
                  <option value="NEXT MONTH">Next Month</option>
                  <option value="SOMEDAY">Someday</option>
                </select>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {editingId ? "Update Task" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
