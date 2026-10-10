import React, { useRef } from "react";
import { Calendar } from "lucide-react";

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

// A date field that always opens the calendar: tapping/clicking anywhere on it
// or the calendar button calls showPicker() (the native indicator is hidden in
// index.css because it is nearly invisible in dark mode).
export default function DateInput({ className = "", onClick, disabled, ...props }: DateInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el || disabled) return;
    try {
      if (el.showPicker) el.showPicker();
      else el.focus();
    } catch {
      el.focus(); // e.g. picker already open, or not allowed in this context
    }
  };
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type="date"
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          open();
        }}
        className={`${className} pr-8 cursor-pointer`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={open}
        title="Open calendar"
        aria-label="Open calendar"
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-[#1C2027] transition-colors disabled:opacity-40"
      >
        <Calendar className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
