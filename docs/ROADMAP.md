# Strategic Roadmap

This document serves as the strategic compass for the Code of Operation Malcolm task management workspace. It dictates the project's future timeline, feature prioritization, and long-term vision to ensure alignment and focused development efforts.

## 1. Strategic Vision and Goals
Over the next 6 to 12 months, our objective is to mature this workspace from a single-user rapid prototyping tool into a fully-fledged, multiplayer collaborative environment. We aim to bridge the gap between high-level strategic planning (Eisenhower Matrix, Gantt) and day-to-day execution (Kanban, Activity Logs) for distributed engineering and fabrication teams.

**Success for Version 2.0 (v2.0)** looks like:
- Flawless, conflict-free real-time synchronization between multiple active users via Supabase.
- Comprehensive AI-assisted project breakdowns (turning ideas into actionable task lists automatically).
- Deep integration with hardware monitoring and telemetry logs for engineering tasks.

## 2. Near-Term Milestones (Committed Work)
These are the immediate, actionable tasks scoped for the upcoming development cycles.

**Q3 2026 (v1.2.0 - Stability & Automation)**
- [x] Establish core views (List, Board, Timeline, Ideas, Team, Activity)
- [x] Configure Vercel deployment pipeline
- [x] Implement local-first `localStorage` caching engine
- [ ] Stabilize Supabase background sync engine (handle network drops gracefully)
- [ ] Connect Gemini AI API for one-click weekly project status reports
- [x] Refine mobile responsiveness for the Kanban and Timeline views

**Q4 2026 (v1.5.0 - Team & Analytics)**
- [ ] Implement advanced global search and tag-based filtering
- [ ] Introduce custom data export (CSV/PDF) for reporting
- [ ] Add capacity planning alerts in the Team Workload view

## 3. The Horizon View (Long-Term Backlog)
These features are planned for the future but are not yet scoped for an immediate sprint. 

**User Authentication & Security**
- Migrate from single-workspace identity to true Role-Based Access Control (RBAC).
- Implement GitHub/Google OAuth login.
- Add granular permission levels (Admin, Editor, Viewer).

**Advanced Analytics & AI**
- AI-driven workload prediction (e.g., flagging when a team member is statistically likely to miss a deadline based on past velocity).
- Interactive charting (burn-down charts, velocity tracking) built with D3/Recharts.

**Third-Party Integrations**
- Two-way sync with Jira and GitHub Issues.
- Slack/Discord webhooks for critical task updates.

## 4. Known Issues and Technical Debt
We acknowledge the following structural inefficiencies that require dedicated refactoring time:
- **Client-Side Rendering Bottlenecks**: The Gantt Timeline view currently re-calculates all coordinates on every render. Need to memoize these calculations aggressively or move to a canvas-based renderer if task counts exceed 1,000.
- **Sync Conflicts**: The current Supabase sync relies on "last-write-wins" bulk overwrites. This is technical debt. We must schedule a refactor to use granular CRDTs (Conflict-free Replicated Data Types) or differential syncing before enabling multi-user write access.
- **Component Monoliths**: `App.tsx` handles too much routing and state management. Plan to migrate to a standard router (like React Router) and separate contexts for Projects and UI State.

## 5. Contribution Guidelines
We welcome contributions from the team! If you want to propose a new feature or pick up an unassigned task:
1. **Check the Horizon View**: Ensure your idea isn't already logged.
2. **Open an Issue**: Describe the feature or bug clearly in a GitHub Issue before writing code.
3. **Submit a Pull Request**: Branch off `main`, implement your changes, and submit a PR referencing the Issue. Ensure all local linting passes (`npm run lint`).
