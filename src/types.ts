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

export type AppView = "list" | "board" | "team" | "gantt" | "ideas" | "activity" | "settings" | "calendar";
