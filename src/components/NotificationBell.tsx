import React, { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { TaskAlert } from "../lib/notifications";

export type PopupPermission = "default" | "granted" | "denied" | "unsupported";

interface NotificationBellProps {
  alerts: TaskAlert[];
  readKeys: Set<string>;
  me: string | null;
  popupPermission: PopupPermission;
  onOpenAlert: (alert: TaskAlert) => void;
  onMarkAllRead: () => void;
  onEnablePopups: () => void;
  onSwitchIdentity: () => void;
  size?: "sm" | "md";
}

const DOT: Record<TaskAlert["severity"], string> = {
  danger: "bg-rose-500",
  warn: "bg-amber-500",
  info: "bg-sky-500",
  event: "bg-indigo-500",
};

const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function NotificationBell({
  alerts, readKeys, me, popupPermission, onOpenAlert, onMarkAllRead, onEnablePopups, onSwitchIdentity, size = "md",
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = alerts.filter((a) => !readKeys.has(a.key)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const Icon = unread > 0 ? BellRing : Bell;
  const btn =
    size === "sm"
      ? "p-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1C2027]"
      : "p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1C2027]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="notif-bell"
        onClick={() => setOpen((v) => !v)}
        title={unread ? `${unread} new notification${unread === 1 ? "" : "s"}` : "Notifications"}
        className={`relative transition-colors ${btn} ${open ? "bg-slate-200 dark:bg-[#1C2027]" : ""}`}
      >
        <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5"} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notif-panel"
          className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-[22rem] bg-white dark:bg-[#17191E] border border-slate-200 dark:border-[#262B35] rounded-xl shadow-2xl overflow-hidden text-left"
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 dark:border-[#262B35]">
            <span className="text-xs font-black text-slate-800 dark:text-slate-100">Notifications</span>
            {unread > 0 && (
              <button onClick={onMarkAllRead} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!me ? (
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Choose who you are to get notifications for the tasks you watch.</p>
                <button onClick={() => { setOpen(false); onSwitchIdentity(); }} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold">
                  Choose who I am
                </button>
              </div>
            ) : alerts.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                Nothing new. Tick <b>Notify me</b> in a task to follow it — tasks assigned to you are followed automatically.
              </p>
            ) : (
              ([
                ["Coming up", alerts.filter((a) => a.source !== "event")],
                ["Activity", alerts.filter((a) => a.source === "event")],
              ] as [string, TaskAlert[]][])
                .filter(([, list]) => list.length > 0)
                .map(([label, list]) => (
                  <div key={label}>
                    <div className="px-3.5 pt-2 pb-1 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
                    {list.map((a) => {
                      const isUnread = !readKeys.has(a.key);
                      return (
                        <button
                          key={a.key}
                          data-testid="notif-item"
                          onClick={() => { setOpen(false); onOpenAlert(a); }}
                          className={`w-full text-left flex items-start gap-2.5 px-3.5 py-2.5 border-b border-slate-100 dark:border-[#1E222B] last:border-0 hover:bg-slate-50 dark:hover:bg-[#1C2027] transition-colors ${isUnread ? "bg-indigo-500/5" : ""}`}
                        >
                          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[a.severity]}`} />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs truncate ${isUnread ? "font-black text-slate-900 dark:text-white" : "font-semibold text-slate-600 dark:text-slate-300"}`}>
                              {a.taskTitle}
                            </span>
                            <span className="block text-[11px] text-slate-500 dark:text-slate-400 break-words">{a.message}</span>
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">
                              {a.projectName}
                              {a.createdAt ? ` · ${ago(a.createdAt)}` : ""}
                            </span>
                          </span>
                          {isUnread && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))
            )}
          </div>

          <div className="px-3.5 py-2 border-t border-slate-200 dark:border-[#262B35] bg-slate-50 dark:bg-[#14171C] space-y-1.5">
            {popupPermission === "default" && (
              <button onClick={onEnablePopups} className="w-full py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                Enable pop-up notifications on this device
              </button>
            )}
            {popupPermission === "denied" && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Pop-ups are blocked — allow notifications for this site in your browser settings.</p>
            )}
            {popupPermission === "granted" && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Pop-ups on — shown while the app is open or in the background.</p>
            )}
            {me && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>You are <b className="text-slate-700 dark:text-slate-200">{me}</b></span>
                <button onClick={() => { setOpen(false); onSwitchIdentity(); }} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Switch
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
