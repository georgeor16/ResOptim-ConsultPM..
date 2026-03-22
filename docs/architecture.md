# Architecture — MtB Resource Optimization & PM Tool

_Last updated: 2026-03-22_
_Update this file at every commit that changes system structure._

---

## System Overview

An internal project management and resource allocation tool for the Mind the Bridge consulting team. Enables tracking of team members across projects, FTE% allocation, bandwidth planning, timeline visualization, what-if simulation, and multi-format export.

---

## High-Level Architecture

```
UI (Frontend - React/Vite) --> Supabase --> PostgreSQL
                                  Supabase --> Supabase Auth
Claude Code (Cursor) --> Git Repository --> Notion (via GitHub Action)
```

---

## Component Map

**Frontend Components:**

| Component | Route | Notes |
|---|---|---|
| Dashboard | `/` | KPIs, Gantt, heatmap, revenue forecast, activity feed |
| Project List | `/projects` | |
| Project Detail | `/projects/:id` | Phases, tasks, subtasks, time logs |
| Resource Allocation | `/resources` | FTE% per member per project |
| Bandwidth Overview | `/bandwidth` | Colour-coded FTE bars, filters, drill-down |
| Team Management | `/team` | Inline role/skill editing |
| Insights | `/insights` | Portfolio analytics |
| What-If Simulation | `/simulation` | Sandbox via SimulationContext |
| Simulation Review | `/simulation/review/:shareId` | Read-only share link view |
| Settings | `/settings` | Calendar profiles, currency, user switching |
| Scheduling Assistant | _(panel, no route)_ | Surfaces unscheduled tasks |
| Export | _(panel, no route)_ | PDF, PNG, Google Slides, Google Docs |
| Notifications / Activity Feed | _(panel, no route)_ | In-app event log |

**Supabase Tables:**
- `users`
- `projects`
- `team_members`
- `allocations`
- `phases`
- `tasks`
- `subtasks`
- `timelogs`
- `calendar_profiles` _(migration 014 — was previously a JSON blob on `users`)_
- `alerts`
- `simulations`
- `simulation_templates`
- `scheduling_config`

**localStorage (not Supabase):**
- Role taxonomy, skill taxonomy, role/skill change history, user switching state

---

## Data Flow

**Normal allocation flow:**
1. User sets FTE% for a member on a project
2. Frontend sends UPSERT to Supabase `allocations` table
3. Supabase confirms write
4. Frontend recalculates bandwidth warnings
5. Updated Gantt + warnings displayed to user

**Simulation flow:**
1. User enters simulation mode (no writes to live data)
2. Live data is deep-cloned in memory
3. User adds steps (add/remove allocations, FTE% changes, reschedule tasks)
4. Each step replays on the clone — delta vs. live state shown in Planning Insights
5. User can share a read-only review link (`/simulation/review/:shareId`)
6. On Apply: all steps written to live Supabase data in one action

---

## Key Modules

### FTE % and Bandwidth
- Each member has total available FTE (default 100%)
- Allocations stored per member per project per time period (month is base unit)
- Bandwidth thresholds: green <75%, amber 75–89%, orange 90–99%, red/pulsing 100%+
- Task completion triggers automatic FTE% release

### Gantt Chart
- Read-only — editing happens in task management views, not the Gantt
- Project-level and aggregated dashboard views
- Driven by project/phase/task dates in Supabase
- **Bandwidth overlay toggle** — per-member FTE bands, coloured by utilisation threshold, rendered below each project bar
- **Real-time updates** — Supabase channel `gantt-live` subscribes to `tasks` and `allocations`; any change triggers a `loadData()` refresh via `onDataRefresh` callback

### Scheduling Assistant
- Surfaces unscheduled tasks grouped by project and phase
- **Calendar-aware:** loads all member calendar profiles via `calendarStore.getAllCalendarProfiles`; shows inline blackout conflict warnings per assignee when task dates overlap with their blackout dates
- **Auto-schedule:** walks calendar days from phase start, finds the earliest window where all assignees are available (correct working day + no blackout), counts forward the required working days, assigns start/due dates in bulk
- Manual date entry still available with FTE preview per task

### What-If Simulation
- Sandbox mode: deep-clone of live data, no live writes until Apply
- Shareable review links for stakeholder sign-off
- Simulation templates (personal saves + recent runs)

### Insights
- Portfolio-level analytical view
- Surfaces utilization patterns, project health, team load
- Used for planning conversations and reporting

### Calendar Profiles
- Per-member working patterns: timezone (IANA), working days, daily hours, blackout dates
- Stored in dedicated `calendar_profiles` Supabase table (one row per user, `user_id` FK); legacy `users.calendar` blob silently migrated on first read via `src/lib/calendarStore.ts`
- `isWorkingDay()` uses `Intl.DateTimeFormat('en-US')` with the member's timezone — avoids UTC/local-time mismatch for cross-timezone teams
- `calendarStore` (`getCalendarProfile`, `upsertCalendarProfile`, `getAllCalendarProfiles`) is the async read/write path; `getMemberCalendar(user)` stays sync for bandwidth/FTE calculations
- Blackout dates managed via `BlackoutDatePicker` component (react-day-picker multi-select)

### Export
- Formats: PDF, PNG, Google Slides, Google Docs (all implemented)
- Granular filters: time period, projects, team members, clients, content toggles
- PDF/PNG: captured via html2canvas + jsPDF directly in the browser
- Google Slides/Docs: chart screenshot + allocation table sent to `google-export` Edge Function, which calls the Google Slides/Docs/Drive APIs
- OAuth: server-side via `google-oauth` Edge Function; refresh tokens stored in `user_google_tokens` (never on client)

### Revenue Forecast
- Project revenue projection on the dashboard
- Currency-aware with FX rate fetching and refresh

---

## Frontend Tech Stack

| Concern | Implementation |
|---|---|
| Framework | React 18 (`react` ^18.3.1) |
| Language | TypeScript (`typescript` ^5.8.3) |
| Build tool | Vite 5 (`vite` ^5.4.19) |
| Routing | React Router v6 (`react-router-dom` ^6.30.1) |
| Styling | Tailwind CSS + shadcn/ui (Radix UI + `class-variance-authority`) |
| State — simulation | SimulationContext (React Context) |
| State — server | TanStack Query v5 (`@tanstack/react-query` ^5.83.0) |
| Data fetching | Supabase JS client (`@supabase/supabase-js` ^2.98.0) |
| Charts | Recharts (`recharts` ^2.15.4) |
| Drag and drop | dnd-kit (`@dnd-kit/core`, sortable, utilities) |
| PDF / PNG export | jsPDF + html2canvas |
| Google Slides / Docs export | Google Slides API, Google Docs API, Google Drive API (via Supabase Edge Functions) |
| Forms | react-hook-form + Zod |
| Notifications (toast) | Sonner (`sonner` ^1.7.4) |
| Testing | Vitest + Testing Library |

---

## Routing

| Route | View |
|---|---|
| `/` | Dashboard |
| `/projects` | Project list |
| `/projects/new` | New project form |
| `/projects/:id` | Project detail (phases, tasks, subtasks, time logs) |
| `/resources` | Resource allocation |
| `/bandwidth` | Bandwidth overview |
| `/team` | Team management |
| `/insights` | Insights analytics |
| `/simulation` | What-If Simulation |
| `/simulation/review/:shareId` | Shared simulation review (read-only, no auth required) |
| `/settings` | Settings (calendar profiles, currency, user switching) |

---

## SimulationContext

React Context that owns all What-If Simulation state. Lives above the router so simulation state survives navigation within a session.

Responsibilities:
- Holds deep-clone of live data (projects, allocations, tasks)
- Maintains ordered step list (`add_allocation`, `remove_allocation`, `adjust_fte`, `reschedule_task`)
- Computes delta: live state vs. simulation state, surfaced in the Planning Insights panel
- Manages share token (written to Supabase `simulations` table on Share)
- Exposes **Apply**: replays all steps against live Supabase data in one transaction
- Exposes **Reset**: discards clone and steps, returns to live data view

---

## Infrastructure

| Layer | Tool |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router v6 |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| IDE | Cursor |
| AI Layer | Claude Code (Anthropic) |
| Version Control | Git |
| Stakeholder Docs | Notion (synced via GitHub Action on `/docs` changes) |

---

## Security

### Row-Level Security (RLS)
RLS is enabled on all Supabase tables. Access is governed by a `get_my_role()` security-definer function that reads `users.role` for the authenticated user.

**Roles:** `admin`, `manager`, `member` — all three have identical full CRUD access on all tables as of migration 012.

**Migrations:**
- `007_rls_role_based_policies.sql` — `get_my_role()` function + initial role-based policies on 8 tables
- `008_projects_member_full_access.sql` — corrected projects to give members full access
- `009_phases_tasks_allocations_member_full_access.sql` — corrected phases, tasks, subtasks, allocations to give members full access
- `010_fix_cascade_delete_rls.sql` — extended timelog/alert delete to all authenticated users (cascade delete fix)
- `011_add_auth_id_to_users.sql` — added `auth_id uuid` column to `public.users`; updated `get_my_role()` to resolve role via Supabase Auth UID
- `012_member_full_access_users_timelogs_alerts.sql` — extended member full access to `users`, `timelogs`, `alerts`; all roles now identical at the DB layer

**Auth integration:** `AuthContext` uses `supabase.auth.getSession()` / `onAuthStateChange()` when Supabase is configured. Falls back to mock auth (localStorage user switching) when Supabase is not configured. A `/login` route (email + password) is the entry point for authenticated sessions. Users are linked via `public.users.auth_id = auth.uid()`.

**Share link auth:** `/simulation/review/:shareId` uses a server-side service role key — no anon RLS policy on the `simulations` table.

See `docs/supabase-schema.md` → RLS Rules for the full per-table policy breakdown.

---

## Open Decisions

- CSV export: in scope or out? (PDF/PNG/GSlides/GDocs confirmed; CSV unresolved)

---

## Changelog

| Date | Change | Commit |
|---|---|---|
| 2026-03-22 | Bug fix: `updateItem` now always mirrors to localStorage before Supabase (same pattern as `addItem`); `handleStatusChange` gets an optimistic UI update so task status dropdowns reflect selection immediately | — |
| 2026-03-19 | Export: Google Slides + Google Docs integration — server-side OAuth via Edge Functions, user_google_tokens table (migration 013), chart screenshot + allocation table export | — |
| 2026-03-19 | Gantt: bandwidth overlay toggle (per-member FTE bands) + Supabase realtime subscription on tasks + allocations | — |
| 2026-03-16 | Removed all member access restrictions: migration 012 + 11 frontend files updated; all roles now identical | — |
| 2026-03-16 | Added Supabase Auth integration: auth_id column, Login page, AuthContext rewrite, Layout redirect, AppSidebar sign-out | — |
| 2026-03-15 | Added Security section: RLS roles, get_my_role() function, migration references, share link auth pattern | edd8cdf |
| 2026-03-15 | Confirmed full stack from package.json: added TanStack Query, Recharts, dnd-kit, jsPDF, shadcn/ui, Sonner, Vitest; removed TBD styling entry; pinned versions | — |
| 2026-03-15 | Corrected frontend stack to React 18 + TypeScript + Vite; added Frontend Tech Stack, Routing, SimulationContext sections; formalised Component Map as table; added simulations/simulation_templates/scheduling_config to table list | — |
| 2026-03-15 | Added What-If Simulation, Insights, Revenue Forecast, Notifications modules; expanded table list; updated data flow with simulation layer; resolved export format decision | — |
| 2026-03-13 | Initial architecture doc generated | — |
