import React, { useMemo, useState } from "react";
import { Project, Task, TaskComment } from "../types";
import { MessageSquare, Search, ArrowUpRight } from "lucide-react";

interface CommentsViewProps {
  project: Project;
  tasks: Task[]; // already filtered by the global search / status / priority / staff filters
  onOpenTask: (task: Task) => void;
}

type SortMode = "recent" | "board";

// Comment ids are `com-<timestamp>`; fall back to the date for older/imported ones.
const commentTime = (c: TaskComment) => {
  const ts = Number(String(c.id).replace(/^com-/, ""));
  if (Number.isFinite(ts) && ts > 1e12) return ts;
  const d = Date.parse(c.date);
  return Number.isFinite(d) ? d : 0;
};

const formatDate = (c: TaskComment) => {
  const t = commentTime(c);
  if (!t) return c.date || "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const AVATAR_COLORS = ["bg-indigo-600", "bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-cyan-600"];
const avatarColor = (name: string) =>
  AVATAR_COLORS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % AVATAR_COLORS.length];

// All comments on the space's tasks in one place — one card per task, its thread
// in order; click a task to open it (and reply there).
export default function CommentsView({ project, tasks, onOpenTask }: CommentsViewProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");

  const columnOf = (id: string) => project.columns.find((c) => c.id === id);
  const columnIndex = (id: string) => project.columns.findIndex((c) => c.id === id);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tasks
      .filter((t) => (t.comments || []).length > 0)
      .map((t) => {
        const all = [...(t.comments || [])].sort((a, b) => commentTime(a) - commentTime(b));
        const shown = q
          ? t.title.toLowerCase().includes(q)
            ? all
            : all.filter((c) => c.text.toLowerCase().includes(q) || (c.author || "").toLowerCase().includes(q))
          : all;
        return { task: t, comments: shown, total: all.length, latest: Math.max(...all.map(commentTime)) };
      })
      .filter((th) => th.comments.length > 0);
    return sort === "recent"
      ? list.sort((a, b) => b.latest - a.latest)
      : list.sort((a, b) => columnIndex(a.task.status) - columnIndex(b.task.status));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, query, sort, project.columns]);

  const commentCount = threads.reduce((n, th) => n + th.comments.length, 0);
  const anyComments = tasks.some((t) => (t.comments || []).length > 0);

  return (
    <div id="comments-view">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-auto">
          {commentCount} comment{commentCount === 1 ? "" : "s"} on {threads.length} task{threads.length === 1 ? "" : "s"}
        </span>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="comments-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comments or authors…"
            className="w-56 max-w-full bg-slate-50 dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="bg-slate-50 dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="recent">Latest comment first</option>
          <option value="board">Board order</option>
        </select>
      </div>

      {threads.length === 0 ? (
        <div className="text-center py-20 text-slate-500 text-sm">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
          {anyComments ? "No comments match your search." : "No comments yet. Open a task and add a comment — it will show up here."}
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(({ task, comments, total }) => {
            const col = columnOf(task.status);
            return (
              <div
                key={task.id}
                data-testid="comment-thread"
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14171C] overflow-hidden"
                style={{ borderLeft: `4px solid ${col?.color || "#64748b"}` }}
              >
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#1A1D24] transition-colors group"
                >
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 min-w-0 truncate">
                    {task.title}
                  </span>
                  {col && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: col.color }}>
                      {col.title}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{task.assignee || "Unassigned"}</span>
                  <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    <MessageSquare className="w-3 h-3" />
                    {comments.length < total ? `${comments.length} of ${total}` : total}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {comments.map((c) => {
                    const author = c.author || "Unknown";
                    return (
                      <li key={c.id} className="flex gap-3 px-4 py-2.5">
                        <span className={`w-7 h-7 rounded-full ${avatarColor(author)} text-white text-[11px] font-black flex items-center justify-center shrink-0`}>
                          {author.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{author}</span>
                            <span className="text-[10px] text-slate-400">{formatDate(c)}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words mt-0.5">{c.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { commentTime, formatDate as formatCommentDate };
