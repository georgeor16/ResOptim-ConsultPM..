# User Workflow — MtB Resource Optimization & PM Tool

_Last updated: 2026-03-16_
_This is the onboarding map for new team members. Update after every new or changed feature._

---

## What is this tool?

An internal platform for the Mind the Bridge consulting team to manage projects, allocate team members, track bandwidth, and plan resourcing. It covers the full lifecycle from project creation through to timeline visualization, what-if planning, and export.

---

## Roles

| Role | What they can do |
|---|---|
| **Admin / Manager** | Full access: create projects, allocate team, view all data, run simulations, export |
| **Member** | Full access — identical to Admin/Manager in all operations |

Role is set per user. All three roles (`admin`, `manager`, `member`) have identical access at both the database and UI layers. `isAdmin` is still used for org-level admin settings in Settings.

---

## Core User Journeys

### 1. Login / logout

**Route:** `/login`

When Supabase is configured, all routes (except `/login` and `/simulation/review/:shareId`) require an authenticated session.

- **Sign in** — email + password via Supabase Auth
- **Create account** — toggle to "Create one" on the login page; sign up with the email that matches your record in the system. If your password has appeared in a known data breach (when the Pro plan feature is enabled), you'll see: *"This password has appeared in a data breach. Please choose a different password."*
- **Sign out** — user chip in the bottom of the sidebar → **Sign out**

Email matching: on first login the app resolves your `public.users` record by email and links your Auth account automatically. Subsequent logins use the linked ID directly.

If your login email doesn't match any user in the system, you'll see an "Account not linked" message — ask an admin to check your email in the team records.

When Supabase is **not** configured (localStorage mode), login is not required — the app loads with a default user and supports manual user switching via the sidebar user chip.

---

### 2. First run / onboarding

On first load the app seeds demo data automatically (projects, team members, allocations). This gives a working starting point to explore all features without manual setup.

---

### 3. Creating a project

**Route:** `/projects/new`

1. Go to **Projects** in the sidebar
2. Click **New Project**
3. Fill in project details:
   - **Name** and **client**
   - **Category** — choose a template: Scouting, Event, Full Report, Light Report, or Other (with custom specify field). Selecting a category auto-populates standard phases.
   - **Priority** and **Status** (Active, On Hold, Completed, Cancelled)
   - **Start / end dates**
   - **Fee** — set amount, fee type (Monthly or Project Fee), and currency
4. Add or edit **phases** — each phase has a name, duration, and FTE percentage
5. Allocate **team members** by % of project ownership; the form calculates derived FTE demand per person and warns if anyone would be overallocated
6. Save — project appears in the project list and on the dashboard Gantt

---

### 4. Managing a project

**Route:** `/projects/:id`

The project detail page is a multi-tab hub:

**Tasks tab**
- Tasks belong to phases; each task has a name, status (Backlog / In Progress / Complete), assignees (multi-select), start/end dates, duration, and client involvement level (Input / Approval / Review — shown as a badge)
- Drag tasks between status columns or edit inline
- Completing a task automatically releases the allocated FTE% for that period
- Deleting a task shows a confirmation dialog before removing it and its timelogs

**Phases tab**
- Add, edit, or remove phases; each phase has start/end dates and an Effort field (with units: hours, days, weeks, month) that drives Auto FTE calculation

**Subtasks**
- Tasks can be broken into subtasks (open / complete); tracked inside the task detail

**Time logs**
- Team members log hours against tasks with a date; visible in the task and aggregated in the Analytics tab

**Team tab**
- Add or remove team members from the project; set Required % and view total FTE per member

**Analytics tab**
- Financial summary, FTE burn-down, and status breakdown for the project

**Timeline tab**
- Read-only Gantt showing phases and tasks for this project

**Activity log**
- Per-project change history

**Mark as Complete**
- A CheckCircle button in the project list marks a project complete; completed projects are excluded from the overdue task panel on the Dashboard

---

### 5. Allocating team members

**Route:** `/resources`

1. Go to **Resource Allocation**
2. Select a project and a team member
3. Set FTE% for the allocation period (month is the base unit)
4. Use the period toggle (Week / Month / Quarter / Half Year / Year) to view allocations across different time horizons
5. FTE% can also be derived automatically from task effort and duration

**projectSharePercent:** when adding a member to a project, set the % of the project they own. The system derives their FTE% as: `share × project FTE demand ÷ 100`. This flows into the Bandwidth view.

**Bandwidth thresholds:**
- Green — below 75%
- Amber — 75–89%
- Orange — 90–99%
- Red / pulsing — 100%+ (overallocated)

---

### 6. Monitoring bandwidth

**Route:** `/bandwidth`

The Bandwidth Overview shows every team member's current load:

- FTE bar per member, colour-coded by status; total FTE = max(task FTE, allocation FTE)
- Filter by: FTE status (available / approaching / at capacity / overallocated), primary role, search by name
- Sort by: name, total FTE, remaining capacity, number of projects
- Drill into a member to see their project breakdown and allocation history
- Conflict resolution panel appears when a change causes someone to exceed 100% capacity

---

### 7. Dashboard

**Route:** `/`

The dashboard is the daily landing page. It shows:

- **KPI cards** — active projects, total team FTE, overallocated members, upcoming deadlines (responsive grid)
- **Project cards** — status and health at a glance
- **Unified Gantt** — cross-project timeline (read-only); Gantt rows are clickable and navigate to the project. Click **Bandwidth** in the Gantt header to toggle per-member FTE bands coloured by utilisation (green < 75%, amber 75–89%, orange 90–99%, red ≥ 100%). The Gantt auto-refreshes when tasks or allocations change in another tab.
- **Team heatmap** — capacity heat across the team over time; columns are clickable to filter
- **Revenue forecast** — project revenue projection (currency-aware, with FX rates)
- **Overdue resources** — tasks flagged as overdue; clicking an overdue task navigates directly to the project view. Completed projects are excluded.
- **Activity feed** — recent events from the last 7 days

All roles can see all projects on the dashboard.

---

### 8. Insights

**Route:** `/insights`

High-level analytical view across the portfolio:

- **Demand trends** — 3/6/12-month team FTE curves
- **Bottleneck overview** — role and skill scarcity (Critical / Active / Emerging / Monitored severity); drill down to see supply/demand bars, affected projects, contributing tasks, and historical 6-month trend lines
- **Planning insights** — active planning flags (capacity warnings, assignment conflicts, recently applied simulations, template retirement recommendations); flags can be dismissed with a reason
- **Member utilization trends** — peak FTE by person over time
- **Monthly digest** — summary snapshots
- **Simulation templates** — view, apply, or discard saved simulation runs

---

### 9. What-If Simulation

**Route:** `/simulation`

Lets any team member model allocation changes without affecting live data.

**How it works:**
1. Enter simulation mode (toggle in the Simulation page)
2. Add steps: add/remove allocations, adjust FTE%, reschedule tasks
3. Each step is replayed on top of a deep clone of the live data — nothing is saved yet
4. Review the delta vs. current state in the **Planning Insights** panel
5. **Share** — generate a share link so stakeholders can review without edit access
6. **Apply** — when satisfied, apply all steps to live data in one action
7. **Discard** — remove individual steps or reset entirely
8. **Templates** — save a simulation as a personal template for reuse; system also records recent runs

**Shared simulation review:** `/simulation/review/:shareId`
Recipients open the link and see the proposed changes. No login required.

---

### 10. Team management

**Route:** `/team`

- View all team members and their roles
- Edit role and skill assignments inline with the **Role/Skill Inline Editor**
- Role and skill taxonomy is maintained at the org level (stored in localStorage even when Supabase is active)
- Role/skill change history is tracked per member
- Audit trail records who changed what

---

### 11. Exporting

Accessible via the **Export panel** on the Dashboard (Gantt export button).

- Formats: PDF, PNG, Google Slides, Google Docs
- Granular filters on what to include
- Captures the current state of the Gantt view

---

### 12. Settings

**Route:** `/settings`

- **Calendar profiles** — set per-member working patterns: timezone, working days, daily hours, blackout dates (leave, public holidays). Used by the Scheduling Assistant and FTE calculator to adjust effective availability.
- **Currency** — set the base currency; FX rates are fetched and refreshed automatically
- **Project templates** — create custom phase templates for reuse across new projects
- **Role taxonomy** — define and manage org-level role names (e.g. Senior Analyst, PM)
- **Skill taxonomy** — define and manage org-level skill tags
- **Notification settings** — configure external notification channels and routing (see Notifications section below)
- **Dark mode** — toggle light/dark theme
- **User switching** — only available in localStorage mode (no Supabase). In Supabase mode, use Sign out and log in as a different user.

---

## Scheduling Assistant

A slide-in panel (button in the top header) that surfaces unscheduled tasks grouped by project and phase. Users can batch-set phase dates and individual task dates; the panel previews the resulting FTE demand for assigned members. A counter badge on the button shows how many tasks need scheduling. Configurable review cadence determines how often the assistant prompts for a review. Shows a health score and emits toast notifications when scheduling issues are detected.

---

## Conflict Resolution

When a change (adding an allocation or task) causes someone to exceed 100% capacity, a **Conflict Resolution** sheet appears automatically. It shows:
- Who is overallocated and by how much
- Which projects are affected, ranked by resolution priority
- Options to reduce capacity on source/target projects, reassign tasks, or navigate to the Bandwidth page

---

## Notifications

**In-app notifications**
The notification bell (top header) shows events: task completion, overallocation, simulation applied, deadline approaching, etc. An activity feed on the Dashboard shows the last 7 days of org events.

**Org-level alert engine**
Automatically generates alerts for overallocation, upcoming deadlines, bottlenecks, and other thresholds. Alerts are written to the `alerts` table and surfaced in the notification center.

**External notifications**
Configurable in Settings → Notifications. Supported channels:
- Email
- Slack
- Microsoft Teams
- Push (browser / device)

For each channel, users set:
- **Routing** — which alert categories and priority levels (Critical / Attention / Info) go to which channel
- **Quiet hours** — time windows when non-critical notifications are suppressed per channel
- **Scheduled pause** — recurring windows (e.g. "9 PM – 8 AM weekdays") or one-off pauses (e.g. "until tomorrow 2 PM") where external notifications stop. Critical alerts can be set to override pauses.
- **Do-Not-Disturb profiles** — named DnD configurations that can be toggled on/off quickly

---

## Access control

Row-level security (RLS) is enforced at the database layer for all tables. Role is set on the `users` record and cannot be self-assigned. All three roles (`admin`, `manager`, `member`) have identical database access.

| What | Admin / Manager | Member |
|---|---|---|
| Create / view / edit / delete projects, phases, tasks, subtasks, allocations | All | All |
| Log time against tasks | All entries | All entries |
| Edit team member records | All | All |
| Edit calendar profiles | All | All |
| View user records | All | All |
| Run simulations | Yes | Yes |
| View simulation share links | Yes (+ recipients via link) | Yes (+ recipients via link) |
| Export | Yes | Yes |
| Delete timelogs / alerts | Yes | Yes |

Share links (`/simulation/review/:shareId`) are accessible without login — the server validates the token server-side.

---

## Data persistence

| Mode | When active |
|---|---|
| **Supabase** | When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set |
| **localStorage** | Fallback when Supabase is not configured |

Core tables (Supabase): `users`, `projects`, `allocations`, `phases`, `tasks`, `subtasks`, `timelogs`, `alerts`, `simulations`, `simulation_templates`, `scheduling_config`

Org/team/taxonomy metadata always stays in `localStorage` even when Supabase is active.
