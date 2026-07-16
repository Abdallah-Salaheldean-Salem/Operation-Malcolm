import React, { useState } from "react";
import { Lock, ShieldCheck, KeyRound, X } from "lucide-react";

export type AccessModalMode = "unlock" | "admin" | "setpw";

interface AccessModalProps {
  mode: AccessModalMode;
  spaceName?: string;
  // Returns an error message to show, or null on success (modal then closes).
  onSubmit: (password: string) => Promise<string | null>;
  onClose: () => void;
}

export default function AccessModal({ mode, spaceName, onSubmit, onClose }: AccessModalProps) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = {
    unlock: {
      Icon: Lock,
      title: `“${spaceName}” is locked`,
      desc: "Enter this space's password to view and edit it. The admin password also works.",
      cta: "Unlock",
    },
    admin: {
      Icon: ShieldCheck,
      title: "Admin access required",
      desc: "Enter the admin password to continue.",
      cta: "Continue",
    },
    setpw: {
      Icon: KeyRound,
      title: `Set a password for “${spaceName}”`,
      desc: "Anyone opening this space will need this password (admins always have access).",
      cta: "Save password",
    },
  }[mode];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!pw.trim()) {
      setError("Please enter a password.");
      return;
    }
    if (mode === "setpw" && pw !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(pw);
    setBusy(false);
    if (err) {
      setError(err);
      setPw("");
      setConfirm("");
    } else {
      onClose();
    }
  };

  const { Icon } = copy;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#1C1F26] border border-slate-200 dark:border-[#1E222B] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight mt-1.5">
              {copy.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1E222B] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 pb-5 space-y-3">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{copy.desc}</p>

          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />

          {mode === "setpw" && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className="w-full bg-slate-50 dark:bg-[#0F1115] border border-slate-200 dark:border-[#1E222B] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          )}

          {error && <p className="text-[11px] font-semibold text-rose-500">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#0F1115] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition-colors"
            >
              {busy ? "Checking…" : copy.cta}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
