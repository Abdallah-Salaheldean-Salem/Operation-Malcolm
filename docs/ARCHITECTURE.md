# System Architecture

This document serves as the master blueprint for the Operation Malcolm task management workspace. It explains how the project is built, why specific technical choices were made, and how the different pieces fit together.

## 1. System Overview
The application is a comprehensive, multi-view task management workspace designed for teams like the Code of Operation Malcolm. It provides a unified data model that can be visualized and manipulated through multiple lenses: List, Kanban Board, Team Workload, Gantt Timeline, Eisenhower Matrix (Ideas), and Daily Activity Logs. The system is designed to be highly responsive, primarily functioning as a local-first application with remote synchronization, and it leverages AI for automated project reporting.

## 2. Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React (Icons)
- **Backend**: Node.js, Express (for custom API routes), @google/genai (Gemini AI integration)
- **Database / Persistence**: LocalStorage (primary), Supabase (PostgreSQL for cloud synchronization)
- **Hosting & Deployment**: Vercel (configured via `vercel.json`), Google Cloud Run (AI Studio environment)

## 3. High-Level Design (Components)
The application follows a monolithic, client-heavy architecture where the frontend manages the bulk of the business logic and view transformations.

- **Global State Controller (`App.tsx`)**: Acts as the central nervous system. It holds the unified state of all `Projects` and `Tasks`, manages the undo/redo stack, and handles the active view routing.
- **View Renderers (`/components/*View.tsx`)**: Components like `KanbanBoard`, `TimelineView`, and `TeamView` act as pure visual transformers. They take the central `Project` state and render it into specific interactive layouts (e.g., calculating Gantt chart coordinates or grouping by status).
- **Persistence Layer**: Data is aggressively cached in the browser's `localStorage` to ensure zero-latency interactions. A background synchronization process (`supabase-sync.ts`) attempts to mirror this state to a remote Supabase instance.
- **AI Service Layer**: Specific heavy-compute or secure tasks, such as generating project reports using the Gemini API, are offloaded to backend API routes (`/api/reports/generate.ts`) to keep API keys secure.

## 4. Directory Structure
```
/api                # Server-side API endpoints (e.g., Gemini report generation)
/docs               # System documentation, architecture, and roadmaps
/src                # Main frontend source code
  /components       # React UI components (Views, Modals, Sidebar)
  /lib              # Utility libraries and integration clients (Supabase)
  App.tsx           # Primary application component and state manager
  data.ts           # Initial seed data and constants
  types.ts          # Global TypeScript interfaces and types
/index.html         # Application entry point
/server.ts          # Express server configuration for full-stack deployment
```

## 5. Data Flow
1. **User Interaction**: A user drags a task card in the `KanbanBoard` to a new column.
2. **State Update**: The `KanbanBoard` component calls the `onUpdateProject` callback passed from `App.tsx` with the mutated task.
3. **Global State Mutation**: `App.tsx` receives the updated project, pushes the previous state to the `undoStack`, and updates the React state.
4. **Local Persistence**: A `useEffect` hook in `App.tsx` detects the state change and immediately serializes the new state to `localStorage` (e.g., `clickup_projects_v3`), ensuring the UI is instantly updated and resilient to page reloads.
5. **Remote Synchronization**: Concurrently, `App.tsx` triggers `saveProjectsBulk()` from `supabase-sync.ts` to push the updated JSON document to the Supabase backend in the background.

## 6. Key Design Decisions & Trade-offs
- **Local-First Architecture**: We chose to make `localStorage` the primary source of truth for the active session. *Reasoning*: This guarantees instant, zero-latency UI updates when dragging tasks or switching views. *Trade-off*: Multi-user real-time collaboration is harder to implement perfectly, as simultaneous edits might overwrite each other during the remote sync phase.
- **Client-Side View Computations**: Instead of relying on a database to query "tasks for the Gantt view" or "tasks for the Kanban view", the frontend receives the entire project object and computes the layouts in memory. *Reasoning*: Reduces backend complexity and network round-trips. Modern browsers are fast enough to filter and sort hundreds of tasks instantly.
- **Tailwind CSS over Component Libraries**: We opted for raw Tailwind CSS instead of heavy UI libraries like Material UI or Ant Design. *Reasoning*: It provides ultimate flexibility for building highly custom, dense data-visualization interfaces (like the Timeline) while keeping the bundle size small and maintaining a strict design system (e.g., our custom dark mode implementation).