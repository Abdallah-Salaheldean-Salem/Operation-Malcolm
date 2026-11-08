import React, { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { formatElapsed } from "../lib/timer";

interface TimerButtonProps {
  startedAt?: string | null; // running when set
  onToggle: () => void;
  size?: "sm" | "md";
  className?: string;
}

// Start / stop button for a task timer; shows the live elapsed time while running.
export default function TimerButton({ startedAt, onToggle, size = "md", className = "" }: TimerButtonProps) {
  const running = !!startedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";
  return (
    <button
      type="button"
      data-testid="timer-button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={running ? "Stop timer and log the time" : "Start timer"}
      className={`inline-flex items-center gap-1.5 rounded-lg font-bold transition-colors ${pad} ${
        running
          ? "bg-rose-600 hover:bg-rose-500 text-white"
          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25"
      } ${className}`}
    >
      {running ? (
        <>
          <Square className="w-3 h-3 fill-current" />
          <span>Stop</span>
          <span className="font-mono tabular-nums">{formatElapsed(now - Date.parse(startedAt!))}</span>
        </>
      ) : (
        <>
          <Play className="w-3 h-3 fill-current" />
          <span>Start timer</span>
        </>
      )}
    </button>
  );
}
