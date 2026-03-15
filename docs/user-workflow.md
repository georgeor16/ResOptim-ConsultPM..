# User Workflow — MtB Resource Optimization & PM Tool

_Last updated: 2026-03-15_
_This is the onboarding map for new team members. Update after every new or changed feature._

---

## What is this tool?

An internal platform for the Mind the Bridge consulting team to manage projects, allocate team members, track bandwidth, and plan resourcing. It covers the full lifecycle from project creation through to timeline visualization, what-if planning, and export.

---

## Roles

| Role | What they can do |
|---|---|
| **Admin / Manager** | Full access: create projects, allocate team, view all data, run simulations, export |
| **Team member** | View their own allocations, tasks assigned to them, and bandwidth status |

Role is set per user and determines what pages and data are visible.

---

## Core User Journeys

### 1. First run / onboarding

On first load the app seeds demo data automatically (projects, team members, allocations). This gives a working starting point to explore all features without manual setup.

---

### 2. Creating a project

**Route:** `/projects/new`

1. Go to **Projects** in the sidebar
2. Click **New Project**
3. Fill in: name, category, start date, end date, status
4. Optionally add phases and tasks at creation time, or do it later in the project detail view
5. Save — project appears in the project list and on the dashboard Gantt

**Project statuses:** Active, On Hold, Completed, Cancelled

---

### 3. Managing a project

**Route:** `/projects/:id`

Inside a project detail page:

- **Phases** — break the project into sequential phases; each phase has a start/end date
- **Tasks** — tasks belong to a phase; each task can be assigned to one or more team members, given a start/end date, and marked complete
- **Subtasks** — tasks can be broken down further into subtasks
- **Time logs** — team members can log hours against tasks
- Completing a task automatically releases the allocated FTE% for that period

---

### 4. Allocating team members

**Route:** `/resources`

1. Go to **Resource Allocation**
2. Select a project and a team member
3. Set FTE% for the allocation period (month is the base unit)
4. Use the period toggle (Week / Month / Quarter / Half Year / Year) to view allocations across different time horizons
5. The system derives FTE% automatically from task duration where possible

**Bandwidth thresholds:**
- Green — below 75%
- Amber — 75–89%
- Orange — 90–99%
- Red / pulsing — 100%+ (overallocated)

---

### 5. Monitoring bandwidth

**Route:** `/bandwidth`

The Bandwidth Overview shows every team member's current load:

- FTE bar per member, colour-coded by status
- Filter by: FTE status (available / approaching / at capacity / overallocated), primary role, search by name
- Sort by: name, total FTE, remaining capacity, number of projects
- Drill into a member to see their project breakdown and allocation history
- Shared simulation links can be reviewed here — managers can revoke shared links

---

### 6. Dashboard

**Route:** `/`

The dashboard is the daily landing page. It shows:

- **KPI cards** — active projects, total team FTE, overallocated members, upcoming deadlines
- **Project cards** — status and health at a glance
- **Unified Gantt** — cross-project timeline with per-member allocation bars (read-only)
- **Team heatmap** — capacity heat across the team over time
- **Revenue forecast** — project revenue projection (currency-aware, with FX rates)
- **Overdue resources** — members or tasks flagged as overdue
- **Activity feed** — recent events from the last 7 days

Managers see all projects; team members see only projects they are allocated to or assigned tasks on.

---

### 7. Insights

**Route:** `/insights`

High-level analytical view across the portfolio. Surfaces patterns in utilization, project health, and team load. Use for planning conversations and reporting.

---

### 8. What-If Simulation

**Route:** `/simulation`

Lets managers model allocation changes without affecting live data.

**How it works:**
1. Enter simulation mode (toggle in the Simulation page)
2. Add steps: add/remove allocations, adjust FTE%, reschedule tasks
3. Each step is replayed on top of a deep clone of the live data — nothing is saved yet
4. Review the delta (what changes vs. current state) in the Planning Insights panel
5. **Share** — generate a share link so stakeholders can review the simulation without edit access
6. **Apply** — when satisfied, apply all steps to the real data in one action
7. **Templates** — save a simulation as a personal template for reuse; system also records recent runs

**Shared simulation review:** `/simulation/review/:shareId`
Recipients open the link, see the proposed changes, and can approve or flag concerns.

---

### 9. Team management

**Route:** `/team`

- View all team members and their roles
- Edit role and skill assignments inline
- Role and skill taxonomy is maintained at the org level (stored in localStorage even when Supabase is active)
- Role/skill change history is tracked per member

---

### 10. Exporting

Accessible via the **Export panel** on the Dashboard (Gantt export button).

- Formats: PDF, PNG, Google Slides, Google Docs
- Granular filters on what to include
- Captures the current state of the Gantt view

---

### 11. Settings

**Route:** `/settings`

- **Calendar profiles** — set per-member working patterns: timezone, working days, daily hours, blackout dates (leave, public holidays). Used by the Scheduling Assistant and FTE calculator to adjust effective availability.
- **Currency** — set the base currency; FX rates are fetched and refreshed automatically
- **User switching** — for demo / multi-user testing, switch active user context without logging out

---

## Scheduling Assistant

Surfaces unscheduled tasks and suggests optimal assignment based on current bandwidth and calendar profiles. Configurable review cadence. Shows a health score and emits toast notifications when scheduling issues are detected.

---

## Notifications

The app maintains an in-app notification system. Events (task completion, overallocation, simulation applied, etc.) are logged to an activity feed and surfaced as notifications. Org-level alerts are generated automatically based on configured rules.

---

## Data persistence

| Mode | When active |
|---|---|
| **Supabase** | When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set |
| **localStorage** | Fallback when Supabase is not configured |

Core tables (Supabase): `users`, `projects`, `allocations`, `phases`, `tasks`, `subtasks`, `timelogs`, `alerts`

Org/team/taxonomy metadata always stays in `localStorage` even when Supabase is active.
