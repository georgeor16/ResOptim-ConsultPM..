# ResOptim

**Resource optimization and consulting project management** — plan projects, allocate team members, track tasks and phases, and view timelines and financials in one place.

---

## Features

- **Dashboard** — Key metrics, overdue tasks, project cards, project timeline (Gantt), team utilization heatmap, and revenue forecast
- **Projects** — List, filter, create, edit, and delete projects with categories (Scouting, Event, Full Report, Light Report, Other)
- **Project detail** — Phases and tasks, status updates, FTE % (auto-calculated), Gantt view, fee/margin, and overage alerts
- **New project** — Templates by category, phase planning with **Duration** and **Effort** (hours / days / weeks / month), **Auto FTE %**, team allocation
- **Team** — Manage members, roles, salaries, and billable rates; switch user for role-based views
- **Resource allocation** — View allocations across projects and time
- **Settings** — Custom phase templates per category, base reporting currency, theme (light/dark/system)
- **Optional Supabase** — Use cloud Postgres for persistence and sync, or run with localStorage only

---

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **React Router** v6
- **Tailwind CSS** + **shadcn/ui** (Radix)
- **Recharts**, **date-fns**, **Lucide** icons
- **Supabase** (optional) for backend and Row Level Security

---

## Getting started

### Prerequisites

- Node.js 18+
- npm or yarn

### Install and run (local only)

git clone https://github.com/georgeor16/ResOptim-ConsultPM....git
cd ResOptim-ConsultPM..
npm install
npm run dev
