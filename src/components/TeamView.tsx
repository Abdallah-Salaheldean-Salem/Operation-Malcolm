import React, { useState } from "react";
import { Project, TeamMember, Team } from "../types";
import { Users, UserPlus, Database, Trash2, Zap } from "lucide-react";

interface TeamViewProps {
  project: Project;
  onUpdateProject: (proj: Project) => void;
}

export default function TeamView({ project, onUpdateProject }: TeamViewProps) {
  const teams = project.teams || [];
  const members = project.members || [];
  
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberTeamId, setNewMemberTeamId] = useState("");

  // Add Team Action
  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const newTeam: Team = {
      id: `team-${Date.now()}`,
      name: newTeamName.trim(),
      description: newTeamDesc.trim()
    };
    onUpdateProject({
      ...project,
      teams: [...teams, newTeam],
      members: members // preserve
    });
    setNewTeamName("");
    setNewTeamDesc("");
    setIsAddingTeam(false);
  };

  // Remove Team Action
  const handleRemoveTeam = (teamId: string) => {
    const updatedTeams = teams.filter(t => t.id !== teamId);
    // Unassign teamId for members in this team
    const updatedMembers = members.map(m => m.teamId === teamId ? { ...m, teamId: undefined } : m);
        
    onUpdateProject({
      ...project,
      teams: updatedTeams,
      members: updatedMembers
    });
  };

  // Add Member Action
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const bgs = ["bg-indigo-600", "bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-purple-600", "bg-teal-600"];
    const randomBg = bgs[Math.floor(Math.random() * bgs.length)];
    const initials = newMemberName.trim().split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
    const newMember: TeamMember = {
      id: `member-${Date.now()}`,
      name: newMemberName.trim(),
      role: newMemberRole.trim() || "Lab Contributor",
      email: newMemberEmail.trim() || `${newMemberName.trim().toLowerCase().replace(/\s+/g, "")}@workspace.io`,
      teamId: newMemberTeamId || undefined,
      avatar: initials || "U",
      bg: randomBg
    };
    onUpdateProject({
      ...project,
      members: [...members, newMember],
      teams: teams // preserve
    });
    setNewMemberName("");
    setNewMemberRole("");
    setNewMemberEmail("");
    setNewMemberTeamId("");
    setIsAddMemberOpen(false);
  };

  // Remove Member Action
  const handleRemoveMember = (memberName: string) => {
    const updatedMembers = members.filter(m => m.name !== memberName);
    // Unassign tasks belonging to this member to prevent dangling records
    const updatedTasks = project.tasks.map(t => t.assignee === memberName ? { ...t, assignee: "Unassigned" } : t);
    onUpdateProject({
      ...project,
      members: updatedMembers,
      tasks: updatedTasks,
      teams: teams // preserve
    });
  };

  // Extract all unique assignees present in tasks
  const presentAssignees = Array.from(new Set(project.tasks.map((t) => t.assignee || "Unassigned")));
  const allAssignees = Array.from(new Set(["Unassigned", ...members.map(m => m.name), ...presentAssignees]));

  // Workload calculations
  const workloadData = allAssignees.map((assignee) => {
    const assigneeTasks = project.tasks.filter((t) => (t.assignee || "Unassigned") === assignee);
    const completed = assigneeTasks.filter((t) => t.status === "col-done" || t.status.toLowerCase().includes("done")).length;
    const inProgress = assigneeTasks.filter((t) => t.status === "col-progress" || t.status.toLowerCase().includes("progress")).length;
    const blocked = assigneeTasks.filter((t) => t.status === "col-blocked" || t.status.toLowerCase().includes("blocked")).length;
    const notStarted = assigneeTasks.filter((t) => t.status === "col-todo" || t.status.toLowerCase().includes("todo")).length;
    const totalHours = assigneeTasks.reduce((acc, t) => acc + (t.estimatedHours || 0), 0);
    const actualHours = assigneeTasks.reduce((acc, t) => acc + (t.actualHours || 0), 0);
    return {
      assignee,
      taskCount: assigneeTasks.length,
      completed,
      inProgress,
      blocked,
      notStarted,
      totalHours,
      actualHours
    };
  }).filter(member => member.taskCount > 0 || member.assignee === "Unassigned" || members.some(m => m.name === member.assignee));

  // Sort workload so Unassigned, Abdallah, Sallam are at top
  workloadData.sort((a, b) => {
    const order = ["Unassigned", "Abdallah", "Sallam"];
    const idxA = order.indexOf(a.assignee);
    const idxB = order.indexOf(b.assignee);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return b.taskCount - a.taskCount;
  });

  const grandTotalTasks = project.tasks.length;

  // Resolve member details dynamically
  const getContactDetails = (name: string) => {
    const match = members.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (match) {
      const teamMatch = teams.find(t => t.id === match.teamId);
      return {
        role: match.role || "Lab Contributor",
        email: match.email || `${name.toLowerCase()}@workspace.io`,
        avatar: match.avatar || name[0] || "U",
        bg: match.bg || "bg-indigo-600",
        teamName: teamMatch ? teamMatch.name : "Unassigned"
      };
    }
    if (name === "Unassigned") {
      return { role: "General Backlog Pool", email: "-", avatar: "👤", bg: "bg-slate-700", teamName: "Backlog" };
    }
    return { role: "External Contributor", email: `${name.toLowerCase()}@workspace.io`, avatar: name[0] || "U", bg: "bg-slate-200 dark:bg-slate-800", teamName: "External" };
  };

  return (
    <div id="team-view-root" className="flex flex-col h-full bg-slate-50 dark:bg-[#0F1115] flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">      
      {/* View Header */}
      <div id="team-header-block" className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Users className="w-5 h-5 text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Team Resource Allocation</h2>
          <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-semibold uppercase tracking-wide">
            Workload Breakdown View
          </span>
        </div>
        
        {/* Actions Bar */}
        <div className="flex items-center space-x-2">
          <button 
            id="add-member-trigger-btn"
            onClick={() => setIsAddMemberOpen(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Team Member</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Streamlined Workload Summary Table Card (Left / 2 Cols) */}
        <div id="team-workload-table-card" className="lg:col-span-2 flex flex-col space-y-6">
          <div className="bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#1E222B] rounded-xl overflow-hidden shadow-md flex flex-col justify-between">
            <div>
              <div className="p-4 bg-slate-50 dark:bg-[#1C1F26] border-b border-slate-200 dark:border-[#1E222B] flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wide uppercase">
                  Resource Workload & Task Ownership
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  Active Member Allocation Sheet
                </span>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[400px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#1E222B] bg-slate-50 dark:bg-[#1C1F26]/20 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Assignee</th>
                      <th className="py-2.5 px-3 text-center w-32">Task Count</th>
                      <th className="py-2.5 px-3 text-center w-36">Workload %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {workloadData.map((row) => {
                      const percentage = grandTotalTasks ? Math.round((row.taskCount / grandTotalTasks) * 100) : 0;
                      const details = getContactDetails(row.assignee);
                      return (
                        <tr key={row.assignee} className="hover:bg-slate-50 dark:hover:bg-[#1C1F26]/30 transition-colors">
                          <td className="py-3 px-3 flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-full ${details.bg} flex items-center justify-center text-white font-bold shadow-sm shrink-0`}>
                              {details.avatar}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200">{row.assignee}</span>
                                {details.teamName && (
                                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#1E222B] text-slate-500 px-1.5 py-0.5 rounded font-medium">
                                    {details.teamName}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500">{details.role}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-bold font-mono text-sm">{row.taskCount}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-3">
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                <div className="bg-orange-500 h-full rounded-full" style={{ width: `${percentage}%` }}></div>
                              </div>
                              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400 w-8">{percentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-[#1C1F26] p-4 border-t border-slate-200 dark:border-[#1E222B] flex items-center justify-between font-bold text-xs uppercase tracking-wider">
              <span>Grand Total</span>
              <div className="flex items-center space-x-12 pr-4">
                <span className="text-indigo-600 dark:text-indigo-400 font-mono text-sm">{grandTotalTasks}</span>
                <span className="text-slate-500 font-mono text-sm w-8">100%</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center text-[10px] text-slate-500 font-medium italic">
            <span>💡 Add team members on the bottom sheet and assign them to custom departments to align work capacities!</span>
          </div>
        </div>

        {/* Right Sidebar (Teams and Insights) */}
        <div className="flex flex-col space-y-6">
          {/* Workspace Teams */}
          <div className="bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#1E222B] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Workspace Teams</h3>
              </div>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold">{teams.length} Active</span>
            </div>
            
            <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
              {teams.map(team => {
                const teamMembers = members.filter(m => m.teamId === team.id).length;
                return (
                  <div key={team.id} className="border border-slate-200 dark:border-[#1E222B] rounded-lg p-3 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors group">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">{team.name}</h4>
                          <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{teamMembers} member{teamMembers !== 1 ? 's' : ''}</span>
                        </div>
                        {team.description && <p className="text-[10px] text-slate-500 mt-1">{team.description}</p>}
                      </div>
                      <button onClick={() => handleRemoveTeam(team.id)} className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {isAddingTeam ? (
                <form onSubmit={handleAddTeam} className="border border-indigo-200 dark:border-indigo-900/50 rounded-lg p-3 bg-indigo-50/50 dark:bg-indigo-900/10">
                  <input 
                    type="text" 
                    placeholder="Team Name" 
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <input 
                    type="text" 
                    placeholder="Description (Optional)" 
                    value={newTeamDesc}
                    onChange={e => setNewTeamDesc(e.target.value)}
                    className="w-full bg-white dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs mb-3 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex space-x-2">
                    <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-1.5 rounded">Save</button>
                    <button type="button" onClick={() => setIsAddingTeam(false)} className="flex-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold py-1.5 rounded">Cancel</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setIsAddingTeam(true)} className="w-full border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors flex items-center justify-center space-x-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>Create Team</span>
                </button>
              )}
            </div>
          </div>

          {/* Resource Utilization Insights */}
          <div className="bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#1E222B] rounded-xl p-5 shadow-sm flex flex-col space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Resource Utilization Insights</h3>
              <Zap className="w-4 h-4 text-indigo-500" />
            </div>
            
            <div className="bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg p-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Backlog Saturation</h4>
              <div className="text-3xl font-bold text-orange-500 mb-2">
                {grandTotalTasks > 0 ? Math.round(((workloadData.find(d => d.assignee === "Unassigned")?.taskCount || 0) / grandTotalTasks) * 100) : 0}%
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                of all active project tasks are currently <strong>Unassigned</strong>. Dispersing this backlog pool onto specific members will accelerate sprint progress.
              </p>
            </div>
            
            <div className="bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg p-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Active Team Members</h4>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 font-mono">
                {workloadData.filter(m => m.assignee !== "Unassigned").length} Staff
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Currently driving workspace activities. Click <strong>Add Team Member</strong> at the top right to enlist new contractors.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Resource Status Sheets */}
      <div className="mt-8 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E222B] pb-2">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Detailed Resource Status Sheets</h3>
          <span className="text-[10px] text-slate-500">Shows tasks counts by Status Column</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workloadData.map(member => {
            const details = getContactDetails(member.assignee);
            return (
              <div key={member.assignee} className="bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#1E222B] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col space-y-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-full ${details.bg} flex items-center justify-center text-white font-bold shadow-sm shrink-0 text-lg`}>
                      {details.avatar}
                    </div>
                    <div className="flex flex-col">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm leading-snug">{member.assignee}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{details.role}</p>
                    </div>
                  </div>
                  {member.assignee !== "Unassigned" && (
                    <button
                      onClick={() => {
                        handleRemoveMember(member.assignee);
                      }}
                      className="text-slate-400 hover:text-rose-500 transition-colors bg-white dark:bg-[#14171C] border border-slate-200 dark:border-slate-800 rounded p-1.5 shadow-sm opacity-0 group-hover:opacity-100"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <div className="flex items-center space-x-1.5 pt-0.5">
                  <span className="text-[9px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
                    {details.teamName}
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 text-[10px] font-bold bg-slate-200 dark:bg-slate-800/60 border border-slate-200 dark:border-[#1E222B] px-2 py-0.5 rounded">
                    {member.taskCount} tasks
                  </span>
                </div>
                
                {/* Micro stat meters */}
                <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200 dark:border-[#1E222B]/60 text-center">
                  <div className="bg-slate-50 dark:bg-[#0F1115]/40 p-1.5 rounded">
                    <div className="text-[8px] text-slate-500 dark:text-slate-400 uppercase font-bold">Todo</div>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono mt-0.5">{member.notStarted || "-"}</div>
                  </div>
                  <div className="bg-blue-500/5 p-1.5 rounded">
                    <div className="text-[8px] text-blue-400 uppercase font-bold">Active</div>
                    <div className="text-xs font-bold text-blue-400 font-mono mt-0.5">{member.inProgress || "-"}</div>
                  </div>
                  <div className="bg-rose-500/5 p-1.5 rounded">
                    <div className="text-[8px] text-rose-400 uppercase font-bold">Blocked</div>
                    <div className="text-xs font-bold text-rose-400 font-mono mt-0.5">{member.blocked || "-"}</div>
                  </div>
                  <div className="bg-emerald-500/5 p-1.5 rounded">
                    <div className="text-[8px] text-emerald-400 uppercase font-bold">Done</div>
                    <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">{member.completed || "-"}</div>
                  </div>
                </div>
                
                {/* Hours logged details */}
                <div className="flex justify-between items-center text-[10px] pt-1.5 text-slate-500 dark:text-slate-400">
                  <span>Est. Work Capacity:</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 font-semibold">{member.totalHours} hrs</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Actual Logged Focus:</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 font-semibold">{member.actualHours} hrs</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Member Popup Modal Dialog */}
      {isAddMemberOpen && (
        <div id="add-member-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div id="add-member-modal-container" className="bg-slate-50 dark:bg-[#1C1F26] border border-slate-200 dark:border-[#1E222B] rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 bg-white dark:bg-[#17191E] border-b border-slate-200 dark:border-[#1E222B] flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400">
                <UserPlus className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Enlist Team Member</h3>
              </div>
              <button 
                onClick={() => setIsAddMemberOpen(false)} 
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-black text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddMember} id="add-member-form" className="p-5 space-y-4 text-xs">
              <div>
                <label htmlFor="new-member-name" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Full Name *</label>
                <input 
                  id="new-member-name"
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                  required
                />
              </div>
              <div>
                <label htmlFor="new-member-role" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Job Role / Designation</label>
                <input 
                  id="new-member-role"
                  type="text"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  placeholder="e.g. Fullstack Engineer"
                  className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
              <div>
                <label htmlFor="new-member-email" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
                <input 
                  id="new-member-email"
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="e.g. jane@workspace.io"
                  className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>
              <div>
                <label htmlFor="new-member-team" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Assign to Team</label>
                <select
                  id="new-member-team"
                  value={newMemberTeamId}
                  onChange={(e) => setNewMemberTeamId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 text-xs font-semibold cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-[#1E222B] text-xs">
                <button 
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold cursor-pointer"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
