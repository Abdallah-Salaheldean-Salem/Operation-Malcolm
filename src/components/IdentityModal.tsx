import React, { useState } from "react";
import { UserCircle2, UserPlus, X } from "lucide-react";
import { TeamMember } from "../types";
import { sameName } from "../lib/identity";

interface IdentityModalProps {
  spaceName: string;
  members: TeamMember[];
  me: string | null; // who this device currently thinks it is (may not be a member here)
  onPick: (name: string) => void; // choose an existing member
  onJoin: (name: string, role: string) => void; // add a new member to this space and choose them
  onSkip: () => void;
}

// "Who are you?" — shown after unlocking a space so notifications know whose
// watched tasks to show. Joining is open: anyone in the space can add themselves.
export default function IdentityModal({ spaceName, members, me, onPick, onJoin, onSkip }: IdentityModalProps) {
  const listed = members.filter((m) => m.name && m.name !== "Unassigned");
  const knownElsewhere = !!me && !listed.some((m) => sameName(m.name, me));
  const [mode, setMode] = useState<"suggest" | "list" | "new">(knownElsewhere ? "suggest" : listed.length ? "list" : "new");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2) return setError("Please enter your name.");
    if (sameName(n, "Unassigned")) return setError("Please use your real name.");
    const existing = listed.find((m) => sameName(m.name, n));
    if (existing) onPick(existing.name); // already a member — no duplicate
    else onJoin(n, role.trim());
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onSkip}>
      <div
        id="identity-modal"
        className="w-full max-w-sm bg-white dark:bg-[#1C1F26] border border-slate-200 dark:border-[#1E222B] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
              <UserCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">Who are you?</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">in “{spaceName}”</p>
            </div>
          </div>
          <button onClick={onSkip} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1E222B]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          So you get notifications for the tasks you tick <b>Notify me</b> on (and tasks assigned to you). Remembered on this device.
        </p>

        <div className="p-5 pt-3 space-y-2">
          {mode === "suggest" && me && (
            <>
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-slate-700 dark:text-slate-200">
                You're <b>{me}</b>, but you're not a member of this space yet.
              </div>
              <button
                id="identity-add-me"
                onClick={() => onJoin(me, "")}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
              >
                Add me to this space
              </button>
              <button onClick={() => setMode(listed.length ? "list" : "new")} className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-500">
                I'm someone else
              </button>
            </>
          )}

          {mode === "list" && (
            <>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {listed.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(m.name)}
                    className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-[#262B35] px-3 py-2 text-left hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors"
                  >
                    <span className={`w-7 h-7 rounded-full ${m.bg || "bg-slate-500"} text-white text-[11px] font-black flex items-center justify-center shrink-0`}>
                      {(m.avatar || m.name[0] || "?").toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                      {m.role && <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">{m.role}</span>}
                    </span>
                  </button>
                ))}
              </div>
              <button
                id="identity-new"
                onClick={() => setMode("new")}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 dark:border-[#333A46] py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-500"
              >
                <UserPlus className="w-3.5 h-3.5" /> I'm new — add me
              </button>
            </>
          )}

          {mode === "new" && (
            <form onSubmit={submitNew} className="space-y-2">
              <input
                id="identity-name-input"
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="Your name"
                className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role (optional) — e.g. Thesis student"
                className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {error && <p className="text-[11px] font-semibold text-rose-500">{error}</p>}
              <button id="identity-join" type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold">
                Join “{spaceName}”
              </button>
              {listed.length > 0 && (
                <button type="button" onClick={() => setMode("list")} className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-500">
                  ← Pick from the member list
                </button>
              )}
            </form>
          )}

          <button id="identity-skip" onClick={onSkip} className="w-full pt-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
