# Operation Malcolm Task Management Workspace

The Code of Operation Malcolm task management workspace is a comprehensive, multi-view productivity application designed to streamline team collaboration, project tracking, and workload management. It solves the fragmentation of project management tools by providing a unified data model that can be visualized and manipulated through multiple lenses—all while maintaining blazing-fast performance through a local-first architecture and background synchronization.

[**View the Live Application on Vercel**](https://your-vercel-deployment-link.vercel.app)

## Features and Scope
This application focuses on delivering a seamless and responsive end-user experience for project tracking:
- **Interactive Multi-View System**: Switch instantly between a List View, Kanban Board, Gantt Timeline, and Eisenhower Matrix (Ideas View) to visualize tasks in the most effective format.
- **Team Workload Allocation**: A dedicated Team View allows managers to monitor capacity, track task distribution, and balance workloads across team members.
- **Daily Activity Logging**: Easily record daily team updates with precise scheduling times.
- **Local-First with Sync**: Experience zero-latency UI updates driven by `localStorage`, complemented by background synchronization to a Supabase backend to ensure data safety without sacrificing speed.
- **AI-Powered Project Reporting**: Leverage integrated Gemini AI to automatically generate comprehensive project status reports.
- **Dark/Light Mode**: Full support for user-toggled theme settings.

## Getting Started (Local Setup)
Follow these instructions to get the project running on your local machine for development and testing.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/innovation-hub-workspace.git
   cd innovation-hub-workspace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   *The application will now be running locally on your machine.*

## Usage and Visuals

When you launch the application, you are greeted with the primary workspace dashboard. 

*(Placeholder for Screenshot/GIF)*
`![Workspace Dashboard Screenshot](./public/screenshot.png)`

**Key Interactions:**
- **Kanban Board**: Drag and drop tasks between columns to update their status instantly.
- **Gantt Timeline**: Visually adjust task start and end dates by dragging task bars along the timeline.
- **Task Creation**: Use the universal "New Task" button or quick-add triggers within specific views to capture work items rapidly.

## Project Navigation
For a deeper understanding of the project's inner workings, deployment, and future plans, refer to our detailed documentation:

- **[Architecture Guide (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)**: Understand how the system is built, the technology stack, and key technical decisions.
- **[Deployment Guide (docs/DEPLOYMENT.md)](docs/DEPLOYMENT.md)**: Step-by-step instructions for deploying this application to Vercel and linking the Supabase database.
- **[Roadmap (docs/ROADMAP.md)](docs/ROADMAP.md)**: Discover upcoming features, planned milestones, and the uncommitted backlog.

## License and Contact

**License:**
This project is licensed under the MIT License.

**Maintainers:**
- Abdallah Salaheldean (Operation Malcolm Lead) - abdallah.salaheldean@gmail.com
- Sallam (Operation Malcolm Engineer ) - mohamedsallam899@gmail.com
