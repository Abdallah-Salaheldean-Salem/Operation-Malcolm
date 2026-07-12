import React, { useState } from "react";
import { Project } from "../types";
import { Settings, Info, Save, RotateCcw, Shield, ShieldCheck, Database, Sliders } from "lucide-react";
import { INITIAL_PROJECTS } from "../data";

interface SettingsViewProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
  onResetWorkspace: () => void;
}

export default function SettingsView({ project, onUpdateProject, onResetWorkspace }: SettingsViewProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProject({
      ...project,
      name,
      description
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResetClick = () => {
    onResetWorkspace();
  };

  return (
    <div id="settings-view-root" className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115] flex-1 overflow-y-auto p-6 space-y-6">
      
      {/* View Header */}
      <div id="settings-header-block" className="flex items-center space-x-2.5">
        <Settings className="w-5 h-5 text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Workspace Settings</h2>
        <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">
          Configuration Panel
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* General Config (Left / 2 Cols) */}
        <div id="settings-general-card" className="lg:col-span-2 bg-white dark:bg-[#17191E] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-md">
          <div className="p-4 bg-slate-50 dark:bg-[#1C1F26] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wide uppercase">
              General Identity & Details
            </h3>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Workspace Master Identity</span>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">
                Workspace / Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">
                Workspace Objectives / Mission Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 h-24 leading-relaxed"
                placeholder="Describe the mission of this task manager..."
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center space-x-2 shadow transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaved ? "Settings Saved! ✨" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Database & Baseline Resets (Right / 1 Col) */}
        <div id="settings-database-card" className="bg-white dark:bg-[#17191E] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col justify-between">
          <div>
            <div className="p-4 bg-slate-50 dark:bg-[#1C1F26] border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wide uppercase">
                System Controls & Recovery
              </h3>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-[#0F1115]/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center space-x-1.5 text-[10px] text-amber-500 uppercase font-bold">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>State Baseline Recovery</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Reset the local storage database cache completely to sync all records with the baseline 28 tasks.
                </p>
                
                <button
                  type="button"
                  onClick={handleResetClick}
                  className="w-full py-2 bg-slate-800 hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-400 border border-slate-300 dark:border-slate-700 hover:border-red-900/50 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Spreadsheet Baseline</span>
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-[#0F1115]/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center space-x-1.5 text-[10px] text-indigo-400 uppercase font-bold">
                  <Database className="w-3.5 h-3.5" />
                  <span>Persistent Cache Status</span>
                </div>
                <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300 font-semibold font-mono">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Local Storage Enabled</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Workspace tasks, comments, subtasks, and idea status are persisted in client state.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#1C1F26]/30 text-[10px] text-slate-500 dark:text-slate-400 text-center">
            🔒 Code of Operation Malcolm Workspace Security v1.0
          </div>
        </div>

      </div>

    </div>
  );
}
