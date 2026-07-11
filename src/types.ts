export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskComment {
  id: string;
  author: string;
  text: string;
  date: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string; // Column ID
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
  assignee: string;
  tags: string[];
  estimatedHours: number;
  actualHours: number;
  subtasks: SubTask[];
  comments: TaskComment[];
  createdAt: string;
  location?: string;
  notes?: string;
  dependencies?: string[]; // IDs of tasks that must be finished first
  isMilestone?: boolean;   // Diamond milestone flag
  progress?: number;       // Progress percentage (0 - 100)
  moduleId?: string;       // Explicit module/subsystem assignment
}

// Hardware/engineering readiness lifecycle for a module (subsystem)
export type ModuleReadiness =
  | "design"
  | "prototype"
  | "bench-test"
  | "integrated"
  | "done";

export interface ProjectModule {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  owner?: string;
  readiness?: ModuleReadiness;
  dependsOn?: string[]; // ids of modules this one depends on
  description?: string;
  tags?: string[];
}

// SMART goal-setting framework (Specific, Measurable, Achievable, Relevant, Time-bound)
export interface SmartGoal {
  id: string;
  title: string;       // the goal statement
  specific: string;    // S — precisely what will be accomplished
  measurable: string;  // M — the metric / definition of done
  achievable: string;  // A — resources and why it's realistic
  relevant: string;    // R — why it matters
  timeBound: string;   // T — target date (YYYY-MM-DD)
  progress?: number;   // completion toward the goal (0 - 100)
  moduleIds?: string[];  // optional links to modules
  tags?: string[];
}

export interface IdeaItem {
  id: string;
  timeHorizon: "Next Month" | "Someday" | string;
  title: string;
  description: string;
  targetDate: string;
  status: string;
  priority: string;
  zone: string; // e.g. "Zone 1", "Zone 4"
}

export interface BoardColumn {
  id: string;
  title: string;
  color: string; // CSS color string (e.g., "#ef4444" or Tailwind-compatible color)
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  teamId?: string; // links to a Team
  avatar?: string;
  bg?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  columns: BoardColumn[];
  tasks: Task[];
  tags: string[]; // Set of available tags in the project
  ideas?: IdeaItem[];
  teams?: Team[];
  members?: TeamMember[];
  color?: string;    // Space accent color (hex)
  icon?: string;     // Space icon (emoji)
  archived?: boolean; // Hidden from active lists but retained
  favorite?: boolean; // Pinned to the top of the Spaces list
  parentId?: string;  // Parent Space id (this Space is a sub-space)
  modules?: ProjectModule[]; // Subsystem breakdown
  goals?: SmartGoal[];       // SMART goals
}

export interface SuggestedAction {
  title: string;
  priority: TaskPriority;
  assignee: string;
  reason: string;
  imported?: boolean;
}

export interface GeneratedReport {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  content: string; // Markdown content
  reportType: "summary" | "bottlenecks" | "resources" | "custom";
  suggestedActions: SuggestedAction[];
  createdAt: string;
}

export type AppView = "list" | "board" | "team" | "gantt" | "ideas" | "activity" | "settings" | "calendar" | "modules";
