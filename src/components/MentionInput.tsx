import React, { useRef, useState } from "react";
import { activeMention, insertMention, mentionSuggestions, splitMentions } from "../lib/mentions";

// Comment box with @mention suggestions. Enter posts; while the suggestion list
// is open, Enter/Tab picks the highlighted name instead.
export function MentionInput({
  id,
  value,
  onChange,
  onSubmit,
  names,
  placeholder,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  names: string[];
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<{ start: number; query: string } | null>(null);
  const [hi, setHi] = useState(0);
  const suggestions = active ? mentionSuggestions(active.query, names) : [];
  const open = !!active && suggestions.length > 0;

  const refresh = (text: string, caret: number | null) => {
    const a = caret === null ? null : activeMention(text, caret);
    setActive(a);
    setHi(0);
  };

  const pick = (name: string) => {
    if (!active) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = insertMention(value, active.start, caret, name);
    onChange(next.text);
    setActive(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={id ? `${id}-mentions` : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => refresh(value, (e.target as HTMLInputElement).selectionStart)}
        onBlur={() => setTimeout(() => setActive(null), 150)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => (h + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(suggestions[hi]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setActive(null);
              return;
            }
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
            setActive(null);
          }
        }}
        className={`w-full ${className}`}
      />
      {open && (
        <ul
          id={id ? `${id}-mentions` : undefined}
          role="listbox"
          className="absolute left-0 bottom-full mb-1 w-56 max-w-full z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#17191E] shadow-xl py-1 text-xs"
        >
          {suggestions.map((n, i) => (
            <li key={n} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(n);
                }}
                onMouseEnter={() => setHi(i)}
                className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 ${
                  i === hi ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[9px] font-black flex items-center justify-center shrink-0">
                  {n.substring(0, 2).toUpperCase()}
                </span>
                <span className="truncate font-semibold">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Comment text with @mentions highlighted (the reader's own name stands out more).
export function MentionText({ text, names, me }: { text: string; names: string[]; me?: string | null }) {
  return (
    <>
      {splitMentions(text, names).map((part, i) =>
        part.mention ? (
          <span
            key={i}
            data-testid="mention"
            className={`font-semibold rounded px-0.5 ${
              me && part.mention.toLowerCase() === me.trim().toLowerCase()
                ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                : "text-indigo-600 dark:text-indigo-400"
            }`}
          >
            {part.text}
          </span>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}
