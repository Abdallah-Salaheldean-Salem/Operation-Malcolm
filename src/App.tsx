import React, { useState, useEffect, useRef } from "react";
import { Project, Task, AppView } from "./types";
import { INITIAL_PROJECTS } from "./data";
import { fetchProjects, saveProjectsBulk, deleteProjectRemote, stableStringify } from "./lib/supabase-sync";
import Sidebar from "./components/Sidebar";
import KanbanBoard from "./components/KanbanBoard";
import ListView from "./components/ListView";
import TimelineView from "./components/TimelineView";
import TeamView from "./components/TeamView";
import IdeasView from "./components/IdeasView";
import ActivityView from "./components/ActivityView";
import CalendarView from "./components/CalendarView";
import SettingsView from "./components/SettingsView";
import ModulesView from "./components/ModulesView";
import TaskModal from "./components/TaskModal";
import AccessModal, { AccessModalMode } from "./components/AccessModal";
import { fetchAppState, saveAppState } from "./lib/supabase-sync";
import {
  loadAccess,
  persistAccess,
  hashPassword,
  isAdminPassword,
  canAccess,
  hasPassword,
  AccessState,
  SpaceSecurity,
} from "./lib/access";
import {
  LayoutGrid, 
  Undo2, 
  Redo2, 
  Copy, 
  Eye, 
  Menu, 
  Plus, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Folder, 
  Info,
  Clock,
  AlertTriangle,
  FileCode,
  Search,
  Filter,
  Users,
  Sun,
  Moon,
  Settings,
  ListTodo,
  Kanban,
  CalendarDays,
  Lightbulb,
  Lock,
  ShieldCheck,
  ShieldQuestion
} from "lucide-react";

// ClickUp-style Space accent colors offered in the sidebar picker.
const SPACE_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#f43f5e", "#ec4899", "#8b5cf6",
];
const SPACE_ICONS = ["🗂️", "🚀", "💡", "🛠️", "🎯", "🧪", "📦", "🌐", "⚙️", "🔬"];

export default function App() {
  // Global States
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem("clickup_projects_v5");
    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const saved = localStorage.getItem("clickup_active_project_id_v5");
    return saved || INITIAL_PROJECTS[0].id;
  });

  const [activeView, setActiveView] = useState<AppView>(() => {
    // Deep link support: /?view=board opens straight into a view (also used
    // by PWA app shortcuts).
    const urlView = new URLSearchParams(window.location.search).get("view");
    if (urlView) return urlView as AppView;
    const saved = localStorage.getItem("clickup_active_view");
    return (saved as AppView) || "activity"; // default to Daily Logs for high similarity on load
  });

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>(undefined);

  // Layout states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);

  // Undo/Redo historical stacks
  const [undoStack, setUndoStack] = useState<Project[][]>([]);
  const [redoStack, setRedoStack] = useState<Project[][]>([]);

  // Filter States
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalPriority, setGlobalPriority] = useState("all");
  const [globalAssignee, setGlobalAssignee] = useState("all");
  const [globalStatus, setGlobalStatus] = useState("all");

  // --- Workspace access control (client-side soft gate) ---
  const [access, setAccessState] = useState<AccessState>(() => loadAccess());
  const accessRef = useRef(access);
  const [spaceSecurity, setSpaceSecurity] = useState<SpaceSecurity>({});
  const spaceSecurityRef = useRef<SpaceSecurity>({});
  const [accessModal, setAccessModal] = useState<
    { mode: AccessModalMode; spaceName?: string; onSubmit: (pw: string) => Promise<string | null> } | null
  >(null);
  const pendingAfterModal = useRef<null | (() => void)>(null);

  useEffect(() => {
    accessRef.current = access;
    persistAccess(access);
  }, [access]);

  // Load the shared space password map on start.
  useEffect(() => {
    fetchAppState("space_security").then((res) => {
      if (res.ok && res.value && typeof res.value === "object") {
        const map = res.value as SpaceSecurity;
        spaceSecurityRef.current = map;
        setSpaceSecurity(map);
      }
    });
  }, []);

  const grantAdmin = () => {
    accessRef.current = { ...accessRef.current, admin: true };
    setAccessState({ ...accessRef.current });
  };
  const unlockSpace = (id: string) => {
    if (accessRef.current.unlocked.includes(id)) return;
    accessRef.current = { ...accessRef.current, unlocked: [...accessRef.current.unlocked, id] };
    setAccessState({ ...accessRef.current });
  };
  const lockEverything = () => {
    accessRef.current = { admin: false, unlocked: [] };
    setAccessState({ admin: false, unlocked: [] });
  };
  const setSpacePassword = async (id: string, pw: string) => {
    const h = await hashPassword(pw);
    const next = { ...spaceSecurityRef.current, [id]: h };
    spaceSecurityRef.current = next;
    setSpaceSecurity(next);
    await saveAppState("space_security", next);
  };
  const closeAccessModal = () => {
    setAccessModal(null);
    const p = pendingAfterModal.current;
    pendingAfterModal.current = null;
    if (p) setTimeout(p, 0);
  };
  // Prompt for admin, running `next` once granted (or immediately if already admin).
  const requireAdmin = (next: () => void) => {
    if (accessRef.current.admin) {
      next();
      return;
    }
    setAccessModal({
      mode: "admin",
      onSubmit: async (pw) => {
        if (await isAdminPassword(pw)) {
          grantAdmin();
          pendingAfterModal.current = next;
          return null;
        }
        return "Incorrect admin password.";
      },
    });
  };
  const promptUnlock = (id: string, onOpen?: () => void) => {
    setAccessModal({
      mode: "unlock",
      spaceName: projects.find((p) => p.id === id)?.name,
      onSubmit: async (pw) => {
        if (await isAdminPassword(pw)) {
          grantAdmin();
          pendingAfterModal.current = onOpen || null;
          return null;
        }
        const h = await hashPassword(pw);
        if (spaceSecurityRef.current[id] && h === spaceSecurityRef.current[id]) {
          unlockSpace(id);
          pendingAfterModal.current = onOpen || null;
          return null;
        }
        return spaceSecurityRef.current[id]
          ? "Incorrect password."
          : "This space has no password yet — only an admin can open it.";
      },
    });
  };

  // Theme State
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("clickup_theme");
    return (saved as "dark" | "light") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("clickup_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Sync to localStorage (fast local cache for instant loads)
  useEffect(() => {
    localStorage.setItem("clickup_projects_v5", JSON.stringify(projects));
  }, [projects]);

  // --- Shared workspace synchronization ---
  // Supabase is the shared source of truth: on load we adopt the remote
  // workspace (seeding it only on the very first run anywhere), and only
  // after that do local edits get pushed. This prevents a fresh visitor's
  // seed data from overwriting everyone's shared workspace.
  const [syncReady, setSyncReady] = useState(false);
  const syncReadyRef = useRef(false);
  const projectsRef = useRef(projects);
  const lastSyncedRef = useRef<Map<string, Project>>(new Map());
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const adoptRemote = (remote: Project[]) => {
    lastSyncedRef.current = new Map(remote.map((p) => [p.id, p]));
    setProjects(remote);
    setActiveProjectId((prev) =>
      remote.some((p) => p.id === prev) ? prev : remote[0].id
    );
  };

  const initialLoad = async () => {
    const remote = await fetchProjects();
    if (remote === null || syncReadyRef.current) return;
    if (remote.length > 0) {
      adoptRemote(remote);
    } else {
      // Empty table: first run anywhere — publish the local workspace.
      const seeded = await saveProjectsBulk(projectsRef.current);
      if (!seeded) return;
      projectsRef.current.forEach((p) => lastSyncedRef.current.set(p.id, p));
    }
    syncReadyRef.current = true;
    setSyncReady(true);
  };
  const initialLoadRef = useRef(initialLoad);
  initialLoadRef.current = initialLoad;

  useEffect(() => {
    initialLoadRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push only the projects that actually changed, debounced.
  useEffect(() => {
    if (!syncReady) return;
    const changed = projects.filter((p) => lastSyncedRef.current.get(p.id) !== p);
    if (changed.length === 0) return;
    dirtyRef.current = true;
    const timer = setTimeout(async () => {
      savingRef.current = true;
      const ok = await saveProjectsBulk(changed);
      savingRef.current = false;
      if (ok) {
        changed.forEach((p) => lastSyncedRef.current.set(p.id, p));
        dirtyRef.current = projectsRef.current.some(
          (p) => lastSyncedRef.current.get(p.id) !== p
        );
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [projects, syncReady]);

  // When the tab regains focus, pull the latest shared workspace — unless
  // there are unsaved local edits in flight, which take precedence.
  useEffect(() => {
    const onFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!syncReadyRef.current) {
        initialLoadRef.current();
        return;
      }
      if (dirtyRef.current || savingRef.current) return;
      fetchProjects().then((remote) => {
        if (!remote || remote.length === 0) return;
        if (dirtyRef.current || savingRef.current) return;
        if (stableStringify(remote) === stableStringify(projectsRef.current)) return;
        adoptRemote(remote);
      });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("clickup_active_project_id_v5", activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    localStorage.setItem("clickup_active_view", activeView);
  }, [activeView]);

  // Active Project Selection (archived spaces are hidden from active use;
  // favorites are pinned to the top, original order preserved otherwise)
  const visibleProjects = projects
    .filter((p) => !p.archived)
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
  const activeProject =
    visibleProjects.find((p) => p.id === activeProjectId) ||
    visibleProjects[0] ||
    projects[0];

  // Depth-ordered flattening of visible Spaces for the selector (sub-spaces
  // nested under parents; orphans whose parent is hidden are treated as roots).
  const visibleIds = new Set(visibleProjects.map((p) => p.id));
  const effectiveParent = (p: Project) =>
    p.parentId && visibleIds.has(p.parentId) ? p.parentId : undefined;
  const orderedVisibleSpaces: { proj: Project; depth: number }[] = [];
  const walkSpaces = (parentId: string | undefined, depth: number) => {
    visibleProjects
      .filter((p) => effectiveParent(p) === parentId)
      .forEach((p) => {
        orderedVisibleSpaces.push({ proj: p, depth });
        walkSpaces(p.id, depth + 1);
      });
  };
  walkSpaces(undefined, 0);

  const doSelectProject = (id: string) => {
    setActiveProjectId(id);
    setSelectedTask(null);
  };
  const handleSelectProject = (id: string) => {
    if (canAccess(id, accessRef.current, spaceSecurityRef.current)) {
      doSelectProject(id);
    } else {
      promptUnlock(id, () => doSelectProject(id));
    }
  };

  // Create Project Space (optionally nested under a parent = sub-space)
  const handleCreateProject = (name: string, desc: string, parentId?: string) => {
    // Creating a space is admin-only; on success prompt for the new space's
    // password so it's protected from the start.
    requireAdmin(() => {
      const newId = doCreateProject(name, desc, parentId);
      unlockSpace(newId);
      setAccessModal({
        mode: "setpw",
        spaceName: name,
        onSubmit: async (pw) => {
          await setSpacePassword(newId, pw);
          return null;
        },
      });
    });
  };

  const doCreateProject = (name: string, desc: string, parentId?: string): string => {
    // Push old state to undo
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);

    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name,
      description: desc,
      parentId,
      color: SPACE_COLORS[projects.length % SPACE_COLORS.length],
      icon: SPACE_ICONS[projects.length % SPACE_ICONS.length],
      tags: ["Frontend", "Backend", "Design", "DevOps", "QA"],
      columns: [
        { id: "col-todo", title: "To Do", color: "#64748b" },
        { id: "col-progress", title: "In Progress", color: "#3b82f6" },
        { id: "col-done", title: "Completed", color: "#10b981" },
      ],
      tasks: [],
      teams: [
        { id: "team-sw", name: "Software Team", description: "Cloud services, development, and system dashboard integrations." },
        { id: "team-hw", name: "Hardware & IoT", description: "Physical device installations, circuits, and microcontroller systems." },
        { id: "team-fab", name: "Fabrication & Design", description: "Workshop fabrications, 3D printing tasks, and CAD modeling." },
        { id: "team-ops", name: "Operations & Safety", description: "Lab supervision, standards compliance, and safety auditing." }
      ],
      members: [
        { id: "m-abdallah", name: "Abdallah", role: "Innovation Lead", email: "abdallah.salaheldean@gmail.com", teamId: "team-sw", avatar: "A", bg: "bg-indigo-600" },
        { id: "m-sallam", name: "Sallam", role: "Systems Engineer", email: "sallam.workspace@gmail.com", teamId: "team-hw", avatar: "S", bg: "bg-blue-600" },
        { id: "m-alice", "name": "Alice", role: "Lab Contributor", email: "alice@workspace.io", teamId: "team-fab", avatar: "A", bg: "bg-emerald-600" }
      ],
    };
    setProjects([...projects, newProj]);
    setActiveProjectId(newProj.id);
    return newProj.id;
  };

  // A Space plus all of its descendant sub-spaces (for cascading actions)
  const collectSubtreeIds = (rootId: string): string[] => {
    const ids = [rootId];
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      projects.forEach((p) => {
        if (p.parentId === cur) {
          ids.push(p.id);
          stack.push(p.id);
        }
      });
    }
    return ids;
  };

  // Delete a Space and its sub-spaces
  const handleDeleteProject = (id: string) => {
    requireAdmin(() => doDeleteProject(id));
  };

  const doDeleteProject = (id: string) => {
    const ids = collectSubtreeIds(id);
    const remaining = projects.filter((p) => !ids.includes(p.id));
    if (remaining.length === 0) return; // never delete the last Space
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);

    // Drop the removed spaces' passwords from the shared security map.
    if (ids.some((rid) => spaceSecurityRef.current[rid])) {
      const nextSec = { ...spaceSecurityRef.current };
      ids.forEach((rid) => delete nextSec[rid]);
      spaceSecurityRef.current = nextSec;
      setSpaceSecurity(nextSec);
      saveAppState("space_security", nextSec);
    }

    setProjects(remaining);
    if (ids.includes(activeProjectId)) {
      const nextActive = remaining.find((p) => !p.archived) || remaining[0];
      setActiveProjectId(nextActive.id);
    }
    ids.forEach((rid) => {
      lastSyncedRef.current.delete(rid);
      deleteProjectRemote(rid);
    });
  };

  // Duplicate a Space (deep clone with a fresh id, ClickUp-style "(Copy)")
  const handleDuplicateProject = (id: string) => {
    const source = projects.find((p) => p.id === id);
    if (!source) return;
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);

    const clone: Project = {
      ...JSON.parse(JSON.stringify(source)),
      id: `proj-${Date.now()}`,
      name: `${source.name} (Copy)`,
      archived: false,
    };
    setProjects([...projects, clone]);
    setActiveProjectId(clone.id);
  };

  // Archive a Space (and its sub-spaces) instead of deleting
  const handleArchiveProject = (id: string) => {
    const ids = collectSubtreeIds(id);
    const remainingActive = projects.filter((p) => !p.archived && !ids.includes(p.id));
    if (remainingActive.length === 0) return; // keep at least one active Space
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);

    const updated = projects.map((p) => (ids.includes(p.id) ? { ...p, archived: true } : p));
    setProjects(updated);
    if (ids.includes(activeProjectId)) {
      const nextActive = updated.find((p) => !p.archived);
      if (nextActive) setActiveProjectId(nextActive.id);
    }
  };

  // Restore a Space. If its parent is still archived/gone, promote it to top level.
  const handleRestoreProject = (id: string) => {
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);
    setProjects(
      projects.map((p) => {
        if (p.id !== id) return p;
        const parent = p.parentId ? projects.find((q) => q.id === p.parentId) : undefined;
        const orphaned = Boolean(p.parentId) && (!parent || parent.archived);
        return { ...p, archived: false, parentId: orphaned ? undefined : p.parentId };
      })
    );
    setActiveProjectId(id);
  };

  // Update a Space's lightweight metadata (color / icon / name / favorite)
  const handleUpdateSpaceMeta = (
    id: string,
    meta: { color?: string; icon?: string; name?: string; favorite?: boolean }
  ) => {
    setProjects(projects.map((p) => (p.id === id ? { ...p, ...meta } : p)));
  };

  // Update current project (With automatic Undo history pushing!)
  const handleUpdateProject = (updatedProj: Project) => {
    setUndoStack((prev) => [...prev, projects]);
    setRedoStack([]);
    setProjects(projects.map((p) => (p.id === updatedProj.id ? updatedProj : p)));
  };

  // Undo Handler
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, projects]);
    setProjects(previous);
  };

  // Redo Handler
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, projects]);
    setProjects(next);
  };

  // Copy Link Action
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const [defaultDates, setDefaultDates] = useState<{ startDate: string; dueDate: string } | undefined>(undefined);

  // Open Task Detail / Creator Modal
  const handleOpenTaskModal = (task: Task | null, colId?: string, dates?: { startDate: string; dueDate: string }) => {
    setSelectedTask(task);
    setDefaultColumnId(colId);
    setDefaultDates(dates);
    setIsTaskModalOpen(true);
  };

  // Save Task (Create or Update)
  const handleSaveTask = (taskData: Partial<Task> & { id?: string }) => {
    if (!taskData.title?.trim()) return;

    let updatedTasks: Task[] = [];

    if (taskData.id) {
      // Update existing task
      updatedTasks = activeProject.tasks.map((t) => {
        if (t.id === taskData.id) {
          return {
            ...t,
            ...taskData,
          } as Task;
        }
        return t;
      });
    } else {
      // Create new task
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: taskData.title,
        description: taskData.description || "",
        status: taskData.status || activeProject.columns[0]?.id || "col-todo",
        priority: taskData.priority || "medium",
        startDate: taskData.startDate || new Date().toISOString().split("T")[0],
        dueDate: taskData.dueDate || new Date().toISOString().split("T")[0],
        assignee: taskData.assignee || "Unassigned",
        tags: taskData.tags || [],
        estimatedHours: Number(taskData.estimatedHours) || 0,
        actualHours: Number(taskData.actualHours) || 0,
        subtasks: taskData.subtasks || [],
        comments: taskData.comments || [],
        createdAt: new Date().toISOString().split("T")[0],
      };
      updatedTasks = [...activeProject.tasks, newTask];
    }

    // Automatically add new tags to the project tags catalog
    const newProjectTags = [...(activeProject.tags || [])];
    const incomingTags = taskData.tags || [];
    incomingTags.forEach((tag) => {
      if (!newProjectTags.includes(tag)) {
        newProjectTags.push(tag);
      }
    });

    handleUpdateProject({
      ...activeProject,
      tags: newProjectTags,
      tasks: updatedTasks,
    });
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  // Delete Task
  const handleDeleteTask = (taskId: string) => {
    const remainingTasks = activeProject.tasks.filter((t) => t.id !== taskId);
    handleUpdateProject({
      ...activeProject,
      tasks: remainingTasks,
    });
  };

  const handleResetWorkspace = () => {
    localStorage.removeItem("clickup_projects_v5");
    localStorage.removeItem("clickup_active_project_id_v5");
    localStorage.removeItem("clickup_active_view");
    localStorage.removeItem("clickup_daily_logs");
    // Shared workspace: remove non-baseline projects remotely; the save
    // effect then republishes the baseline data for everyone.
    projects
      .filter((p) => !INITIAL_PROJECTS.some((init) => init.id === p.id))
      .forEach((p) => {
        lastSyncedRef.current.delete(p.id);
        deleteProjectRemote(p.id);
      });
    setProjects(INITIAL_PROJECTS);
    setActiveProjectId(INITIAL_PROJECTS[0].id);
    setActiveView("activity");
    setUndoStack([]);
    setRedoStack([]);
  };

  // Dynamic Metrics Computation
  const totalTasksCount = activeProject.tasks.length;
  const inProgressCount = activeProject.tasks.filter((t) => {
    const col = activeProject.columns.find(c => c.id === t.status);
    const title = (col ? col.title : t.status).toLowerCase();
    return title.includes("progress") || title.includes("going") || title.includes("active");
  }).length;
  const blockedCount = activeProject.tasks.filter((t) => {
    const col = activeProject.columns.find(c => c.id === t.status);
    const title = (col ? col.title : t.status).toLowerCase();
    return title.includes("block") || title.includes("hold");
  }).length;
  const completedCount = activeProject.tasks.filter((t) => {
    const col = activeProject.columns.find(c => c.id === t.status);
    const title = (col ? col.title : t.status).toLowerCase();
    return title.includes("done") || title.includes("complete") || title.includes("finish");
  }).length;
  const completionPercentage = totalTasksCount > 0 ? Math.round((completedCount / totalTasksCount) * 100) : 0;

  // Extract unique assignees dynamically from active project tasks
  const projectAssignees = Array.from(
    new Set(activeProject.tasks.map((t) => t.assignee).filter((a) => a && a !== "Unassigned"))
  );

  // Tab configurations
  const tabItems = [
    { value: "activity" as AppView, label: "Daily Logs", icon: "☕" },
    { value: "board" as AppView, label: "Board View", icon: "📊" },
    { value: "list" as AppView, label: "Spreadsheet", icon: "📋" },
    { value: "calendar" as AppView, label: "Calendar Grid", icon: "📅" },
    { value: "gantt" as AppView, label: "Gantt Chart", icon: "📈" },
    { value: "modules" as AppView, label: "Modules & Goals", icon: "🧩" },
    { value: "team" as AppView, label: "Team View", icon: "👥" },
    { value: "ideas" as AppView, label: "Ideas & Priorities", icon: "💡" },
    { value: "settings" as AppView, label: "Settings", icon: "⚙️" },
  ];

  // Primary views surfaced in the mobile bottom navigation bar. Gantt is
  // desktop-oriented (dense, drag-driven) so its slot goes to Daily Logs;
  // Gantt stays reachable from the sidebar.
  const mobileNavItems: { value: AppView; label: string; Icon: any }[] = [
    { value: "activity", label: "Logs", Icon: Clock },
    { value: "list", label: "Tasks", Icon: ListTodo },
    { value: "board", label: "Board", Icon: Kanban },
    { value: "calendar", label: "Calendar", Icon: CalendarDays },
    { value: "team", label: "Team", Icon: Users },
    { value: "ideas", label: "Ideas", Icon: Lightbulb },
  ];

  // Quick slide tabs
  const handleSlideTabs = (direction: "left" | "right") => {
    const container = document.getElementById("horizontal-tabs-scrollable");
    if (container) {
      const scrollAmt = direction === "left" ? -150 : 150;
      container.scrollBy({ left: scrollAmt, behavior: "smooth" });
    }
  };

  return (
    <div id="app-workspace-container" data-theme={theme} className="flex h-[100dvh] bg-slate-50 dark:bg-[#0F1115] overflow-hidden text-slate-700 dark:text-slate-300 font-sans">
      
      {/* Conditionally rendered Sidebar */}
      {isSidebarOpen && (
        <>
          {/* Mobile Overlay */}
          <div 
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsSidebarOpen(false)} 
            aria-hidden="true"
          />
          <div 
            id="app-sidebar-container" 
            className="fixed inset-y-0 left-0 z-50 md:relative md:z-auto w-[280px] md:w-64 border-r border-slate-200 dark:border-[#161A22] bg-white dark:bg-[#0B0D11] flex-shrink-0 shadow-2xl md:shadow-none transition-transform"
          >
            <Sidebar
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={(id) => {
                handleSelectProject(id);
                if (window.innerWidth < 768) setIsSidebarOpen(false); // Close on mobile after selection
              }}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onDuplicateProject={handleDuplicateProject}
              onArchiveProject={handleArchiveProject}
              onRestoreProject={handleRestoreProject}
              onUpdateSpaceMeta={handleUpdateSpaceMeta}
              spaceColors={SPACE_COLORS}
              spaceIcons={SPACE_ICONS}
              activeView={activeView}
              onSelectView={(view) => {
                setActiveView(view);
                if (window.innerWidth < 768) setIsSidebarOpen(false); // Close on mobile after selection
              }}
            />
          </div>
        </>
      )}

      {/* Main Workspace Stage */}
      <main id="app-workspace-stage" className="flex-1 flex flex-col overflow-hidden h-full relative pb-16 md:pb-0">
        
        {/* 0. MOBILE APP HEADER (ClickUp-style: identity + theme + quick add) */}
        <div
          className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#0F1115] border-b border-slate-200 dark:border-[#161A22] shrink-0 select-none"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex flex-1 items-center space-x-3 min-w-0 overflow-hidden text-left cursor-pointer mr-2"
            title="Open workspace menu"
          >
            <img src="/icon.svg" alt="Operation Malcolm" className="w-10 h-10 rounded-full shadow-md shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">Operation Malcolm</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{activeProject?.name}</p>
            </div>
          </button>
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo"
              className={`p-2 rounded-full transition-colors ${undoStack.length > 0 ? "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1C2027]" : "text-slate-300 dark:text-slate-700"}`}
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle theme"
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1C2027] transition-colors"
            >
              {theme === "dark" ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-400" />}
            </button>
            <button
              onClick={() => setActiveView("settings")}
              title="Workspace settings"
              className={`p-2 rounded-full transition-colors ${
                activeView === "settings"
                  ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1C2027]"
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleOpenTaskModal(null)}
              title="New task"
              className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-[0_2px_12px_rgba(79,70,229,0.45)] transition-colors"
            >
              <Plus className="w-5 h-5 stroke-[2.75]" />
            </button>
          </div>
        </div>

        {/* 1. TOP UTILITY ACTION BAR (desktop) */}
        <div id="workspace-top-utility-bar" className="h-10 bg-slate-100 dark:bg-[#0B0D11] border-b border-slate-200 dark:border-[#1A1F26] px-3 md:px-6 hidden md:flex items-center justify-between select-none shrink-0">
          <div className="flex items-center space-x-3.5">
            {/* Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Collapse Sidebar" : "Expand Project Sidebar"}
              className={`p-1 rounded transition-colors hover:bg-slate-200 dark:hover:bg-[#1C2027] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer ${isSidebarOpen ? "bg-slate-200 dark:bg-[#1C2027] text-slate-900 dark:text-white" : ""}`}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="text-slate-800 dark:text-slate-200 hidden sm:block truncate">Operation Malcolm Project Tracker Dashboard</span>
            </div>
            
            {/* Workspace quick selector */}
            <div className="hidden md:flex items-center pl-4 border-l border-slate-200 dark:border-[#1E222B]">
              <select
                value={activeProject?.id}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                {orderedVisibleSpaces.map(({ proj, depth }) => (
                  <option key={proj.id} value={proj.id} className="bg-slate-100 dark:bg-[#0B0D11] text-slate-700 dark:text-slate-300">
                    {`${"  ".repeat(depth)}${depth > 0 ? "↳ " : ""}${proj.icon || "📂"} ${proj.name}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Undo Action Trigger */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo Last Action"
              className={`p-1 rounded cursor-pointer transition-colors ${undoStack.length > 0 ? "hover:bg-slate-200 dark:hover:bg-[#1C2027] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-600 cursor-not-allowed"}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            {/* Redo Action Trigger */}
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo Action"
              className={`p-1 rounded cursor-pointer transition-colors ${redoStack.length > 0 ? "hover:bg-slate-200 dark:hover:bg-[#1C2027] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-600 cursor-not-allowed"}`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            {/* Copy Link Trigger */}
            <button
              onClick={handleCopyLink}
              title="Copy Space Direct Link"
              className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">Copy link</span>
            </button>

            {/* View Data Snapshot dialog trigger */}
            <button
              onClick={() => setIsDataModalOpen(true)}
              title="Inspect Workspace Raw Data"
              className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Eye className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">View data</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              className="px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] hover:bg-slate-200 dark:hover:bg-[#1E222B] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. DYNAMIC WORKSPACE HEADER */}
        <div id="workspace-dynamic-header" className="px-3 md:px-6 pt-4 md:pt-5 pb-4 bg-slate-50 dark:bg-[#0F1115] border-b border-slate-200 dark:border-[#161A22] select-none shrink-0">

          {/* Mobile project pills */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3" style={{ scrollbarWidth: "none" }}>
            {orderedVisibleSpaces.filter(({ depth }) => depth === 0).map(({ proj }) => {
              const isActive = proj.id === activeProjectId;
              return (
                <button
                  key={proj.id}
                  onClick={() => handleSelectProject(proj.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-[0_2px_10px_rgba(79,70,229,0.35)]"
                      : "bg-slate-200/70 dark:bg-[#14171C] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#1E222B]"
                  }`}
                >
                  <span>{proj.icon || "📂"}</span>
                  <span className="whitespace-nowrap max-w-[9rem] truncate">{proj.name}</span>
                </button>
              );
            })}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="shrink-0 flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-[#2E3541]"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>

          {/* Mobile stat strip (compact take on the desktop metric cards) */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar mt-3 -mx-3 px-3" style={{ scrollbarWidth: "none" }}>
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{totalTasksCount} Tasks</span>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-bold text-blue-400 whitespace-nowrap">{inProgressCount} Ongoing</span>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[11px] font-bold text-rose-400 whitespace-nowrap">{blockedCount} Blocked</span>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B]">
              <div className="w-10 bg-slate-200 dark:bg-[#0B0D11] rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${completionPercentage}%` }} />
              </div>
              <span className="text-[11px] font-bold text-emerald-400 whitespace-nowrap">{completionPercentage}%</span>
            </div>
          </div>

          <div className="hidden md:flex md:items-center justify-between gap-4">

            {/* Title Block */}
            <div className="flex items-start space-x-4">
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shrink-0"
                style={{
                  backgroundColor: `${activeProject?.color || "#4f46e5"}1a`,
                  borderColor: `${activeProject?.color || "#4f46e5"}33`,
                }}
              >
                {activeProject?.icon ? (
                  <span>{activeProject.icon}</span>
                ) : (
                  <Folder className="w-6 h-6 stroke-[1.5]" style={{ color: activeProject?.color || "#818cf8" }} />
                )}
              </div>
              <div className="space-y-0.5">
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span>{activeProject?.name}</span>
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                  Comprehensive project studio incorporating agile boards, roadmaps, maps, workloads, daily logs and employee views.
                </p>
              </div>
            </div>

            {/* Quick Action Block */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => handleOpenTaskModal(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-[0_2px_8px_rgba(79,70,229,0.2)] hover:shadow-[0_4px_16px_rgba(79,70,229,0.3)] transition-all flex items-center space-x-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>New Task Record</span>
              </button>
            </div>
          </div>

          {/* 3. FOUR INLINE METRIC CARDS */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            
            {/* Card 1: Sprint Velocity */}
            <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                  Sprint Velocity
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-white block">
                  {totalTasksCount} Tasks
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <LayoutGrid className="w-4 h-4 text-indigo-400" />
              </div>
            </div>

            {/* Card 2: Active Progress */}
            <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                  Active Progress
                </span>
                <span className="text-sm font-black text-blue-400 block">
                  {inProgressCount} Ongoing
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            {/* Card 3: Unresolved Blocks */}
            <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                  Unresolved Blocks
                </span>
                <span className="text-sm font-black text-rose-400 block">
                  {blockedCount} Blocked
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
            </div>

            {/* Card 4: Completion Ratio */}
            <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl p-4 flex flex-col justify-center shadow-sm space-y-2">
              <div className="flex items-center justify-between w-full">
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block">
                  Completion Ratio
                </span>
                <span className="text-xs font-black text-emerald-400">
                  {completionPercentage}%
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-[#0B0D11] rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* 4. TABS & GLOBAL FILTER TOOLBAR ROW */}
        <div id="workspace-tabs-filter-bar" className="px-3 md:px-6 py-2 bg-slate-100 dark:bg-[#0B0D11] border-b border-slate-200 dark:border-[#161A22] hidden md:flex flex-col xl:flex-row xl:items-center justify-between gap-3 shrink-0 select-none">
          
          {/* Horizontal custom sliding views tabs (desktop; mobile uses the bottom nav) */}
          <div className="hidden md:flex items-center space-x-1.5">
            <button 
              onClick={() => handleSlideTabs("left")} 
              className="p-1 hover:bg-white dark:hover:bg-[#14171C] hover:text-slate-900 dark:text-white rounded text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            
            <div 
              id="horizontal-tabs-scrollable"
              className="flex items-center space-x-1 overflow-x-auto no-scrollbar scroll-smooth"
              style={{ scrollbarWidth: "none" }}
            >
              {tabItems.map((tab) => {
                const isActive = activeView === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveView(tab.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center space-x-1.5 transition-all cursor-pointer ${
                      isActive 
                        ? "bg-slate-200 dark:bg-[#1C2027] text-slate-900 dark:text-white shadow-sm border border-slate-300 dark:border-[#2E3541]" 
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#14171C]/50"
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button 
              onClick={() => handleSlideTabs("right")} 
              className="p-1 hover:bg-white dark:hover:bg-[#14171C] hover:text-slate-900 dark:text-white rounded text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unified Global Filters row */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search tasks..."
                className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] text-xs text-slate-700 dark:text-slate-300 rounded-lg pl-8 pr-3 py-1 w-44 focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-600"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1">
              <Filter className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <select
                value={globalStatus}
                onChange={(e) => setGlobalStatus(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-500 dark:text-slate-400 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">All Statuses</option>
                {activeProject.columns.map((col) => (
                  <option key={col.id} value={col.id} className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1">
              <Play className="w-3 h-3 text-slate-500 dark:text-slate-400 rotate-90" />
              <select
                value={globalPriority}
                onChange={(e) => setGlobalPriority(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-500 dark:text-slate-400 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">All Priorities</option>
                <option value="high" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">High</option>
                <option value="medium" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">Medium</option>
                <option value="low" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">Low</option>
              </select>
            </div>

            {/* Assignee Filter */}
            <div className="flex items-center space-x-1.5 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-lg px-2 py-1">
              <Users className="w-3 h-3 text-slate-500 dark:text-slate-400" />
              <select
                value={globalAssignee}
                onChange={(e) => setGlobalAssignee(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-500 dark:text-slate-400 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">All Staff</option>
                {projectAssignees.map((assignee) => (
                  <option key={assignee} value={assignee} className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">
                    {assignee}
                  </option>
                ))}
                <option value="Unassigned" className="bg-white dark:bg-[#14171C] text-slate-700 dark:text-slate-300">Unassigned</option>
              </select>
            </div>

          </div>
        </div>

        {/* 5. ACTIVE DYNAMIC STAGE CONTAINER */}
        <div id="workspace-dynamic-view-container" className="flex-1 overflow-hidden bg-slate-50 dark:bg-[#0F1115]">
          {!canAccess(activeProjectId, access, spaceSecurity) ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 select-none">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">“{activeProject?.name}” is locked</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                {hasPassword(activeProjectId, spaceSecurity)
                  ? "Enter this space's password to view and edit it. The admin password also works."
                  : "This space has no password yet — only an admin can open it and set one."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                <button
                  onClick={() => promptUnlock(activeProjectId)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" /> Unlock space
                </button>
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="px-4 py-2 bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-[#1C2027] transition-colors"
                >
                  Switch space
                </button>
              </div>
            </div>
          ) : (
          <>
          {activeView === "list" && (
            <ListView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
              onOpenTaskModal={handleOpenTaskModal}
              globalSearch={globalSearch}
              globalPriority={globalPriority}
              globalAssignee={globalAssignee}
              globalStatus={globalStatus}
            />
          )}

          {activeView === "board" && (
            <KanbanBoard
              project={activeProject}
              onUpdateProject={handleUpdateProject}
              onOpenTaskModal={handleOpenTaskModal}
              globalSearch={globalSearch}
              globalPriority={globalPriority}
              globalAssignee={globalAssignee}
              globalStatus={globalStatus}
              onClearFilter={(field) => {
                if (field === "search") setGlobalSearch("");
                else if (field === "priority") setGlobalPriority("all");
                else if (field === "assignee") setGlobalAssignee("all");
                else if (field === "status") setGlobalStatus("all");
              }}
            />
          )}

          {activeView === "calendar" && (
            <CalendarView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
              onOpenTaskModal={handleOpenTaskModal}
              globalSearch={globalSearch}
              globalPriority={globalPriority}
              globalAssignee={globalAssignee}
              globalStatus={globalStatus}
            />
          )}

          {activeView === "team" && (
            <TeamView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {activeView === "gantt" && (
            <TimelineView
              project={activeProject}
              onOpenTaskModal={handleOpenTaskModal}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {activeView === "ideas" && (
            <IdeasView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {activeView === "activity" && (
            <ActivityView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
            />
          )}

          {activeView === "modules" && (
            <ModulesView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
              onOpenTaskModal={handleOpenTaskModal}
            />
          )}

          {activeView === "settings" && (
            <SettingsView
              project={activeProject}
              onUpdateProject={handleUpdateProject}
              onResetWorkspace={handleResetWorkspace}
              isAdmin={access.admin}
              spaceHasPassword={hasPassword(activeProjectId, spaceSecurity)}
              onSetSpacePassword={() =>
                requireAdmin(() =>
                  setAccessModal({
                    mode: "setpw",
                    spaceName: activeProject?.name,
                    onSubmit: async (pw) => {
                      await setSpacePassword(activeProjectId, pw);
                      return null;
                    },
                  })
                )
              }
              onAdminLogin={() => requireAdmin(() => {})}
              onLockAll={lockEverything}
            />
          )}
          </>
          )}
        </div>

        {/* Toast Notification helper */}
        {showToast && (
          <div className="absolute bottom-20 md:bottom-6 right-4 md:right-6 bg-slate-200 dark:bg-[#1C2027] border border-indigo-500/20 text-indigo-400 text-xs px-4 py-2 rounded-xl shadow-xl z-50 flex items-center space-x-2 animate-bounce">
            <Check className="w-4 h-4 text-indigo-400 stroke-[3]" />
            <span className="font-semibold">Direct link copied to clipboard!</span>
          </div>
        )}

        {/* Mobile bottom navigation bar */}
        <nav
          id="mobile-bottom-nav"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0B0D11]/95 backdrop-blur-lg border-t border-slate-200 dark:border-[#1A1F26] flex items-stretch justify-around"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {mobileNavItems.map(({ value, label, Icon }) => {
            const isActive = activeView === value;
            return (
              <button
                key={value}
                onClick={() => setActiveView(value)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? "text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.4]" : "stroke-2"}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

      </main>

      {/* Task Creation & Detail Editor Modal popup */}
      {accessModal && (
        <AccessModal
          mode={accessModal.mode}
          spaceName={accessModal.spaceName}
          onSubmit={accessModal.onSubmit}
          onClose={closeAccessModal}
        />
      )}

      {isTaskModalOpen && (
        <TaskModal
          task={selectedTask}
          columns={activeProject.columns}
          defaultColumnId={defaultColumnId}
          defaultDates={defaultDates}
          projectTags={activeProject.tags}
          projectMembers={["Unassigned", ...(activeProject.members?.map(m => m.name).filter(n => n !== "Unassigned") || ["Abdallah", "Sallam", "Alice", "Bob", "Charlie", "Diana"])]}
          allTasks={activeProject.tasks}
          onClose={() => {
            setIsTaskModalOpen(false);
            setDefaultDates(undefined);
          }}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Raw Data Snapshot Inspector Modal dialog */}
      {isDataModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-white dark:bg-[#14171C] border border-slate-200 dark:border-[#1E222B] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1E222B] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Workspace Data Inspector</h3>
              </div>
              <button
                onClick={() => setIsDataModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white font-black text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-[11px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#0B0D11]">
              <div className="mb-4 text-xs font-sans text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400" />
                <span>JSON representation of the active space <strong>{activeProject.name}</strong> ({activeProject.tasks.length} total tasks logs).</span>
              </div>
              <pre className="p-4 bg-slate-200 dark:bg-[#07090C] rounded-lg border border-slate-200 dark:border-[#1E222B] overflow-x-auto text-emerald-400">
                {JSON.stringify({
                  id: activeProject.id,
                  name: activeProject.name,
                  description: activeProject.description,
                  columns: activeProject.columns,
                  tags: activeProject.tags,
                  totalTasks: activeProject.tasks.length,
                  tasks: activeProject.tasks.slice(0, 5).map(t => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    assignee: t.assignee
                  }))
                }, null, 2)}
                {activeProject.tasks.length > 5 && `\n\n... and ${activeProject.tasks.length - 5} more tasks`}
              </pre>
            </div>
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-[#1E222B] flex justify-end">
              <button
                onClick={() => setIsDataModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-[#1C2027] hover:bg-slate-300 dark:hover:bg-[#2E3541] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
