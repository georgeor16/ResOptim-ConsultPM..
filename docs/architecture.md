# Architecture — MtB Resource Optimization & PM Tool

_Last updated: 2026-03-15_
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
- `calendar_profiles`
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
- Bandwidth overlay toggle per member

### Scheduling Assistant
- Surfaces unscheduled tasks and suggests optimal assignment
- Reads calendar profiles for member availability
- Configurable review cadence; health score chip + toast notifications

### What-If Simulation
- Sandbox mode: deep-clone of live data, no live writes until Apply
- Shareable review links for stakeholder sign-off
- Simulation templates (personal saves + recent runs)

### Insights
- Portfolio-level analytical view
- Surfaces utilization patterns, project health, team load
- Used for planning conversations and reporting

### Calendar Profiles
- Per-member working patterns: timezone, working days, daily hours, blackout dates
- Used by Scheduling Assistant and FTE calculator to adjust effective availability

### Export
- Formats: PDF, PNG, Google Slides, Google Docs
- Granular filters on what to include
- Captures current state of the Gantt view

### Revenue Forecast
- Project revenue projection on the dashboard
- Currency-aware with FX rate fetching and refresh

---

## Frontend Tech Stack

| Concern | Implementation |
|---|---|
| Framework | React 18 |
| Language | TypeScript |
| Build tool | Vite |
| Routing | React Router (client-side, SPA) |
| State — simulation | SimulationContext (React Context) |
| Styling | TBD |
| Data fetching | Supabase JS client; localStorage fallback |

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

## Open Decisions

- CSV export: in scope or out? (PDF/PNG/GSlides/GDocs confirmed; CSV unresolved)
- Real-time updates: Supabase realtime subscriptions not yet in scope

---

## Changelog

| Date | Change | Commit |
|---|---|---|
| 2026-03-15 | Corrected frontend stack to React 18 + TypeScript + Vite; added Frontend Tech Stack, Routing, SimulationContext sections; formalised Component Map as table; added simulations/simulation_templates/scheduling_config to table list | — |
| 2026-03-15 | Added What-If Simulation, Insights, Revenue Forecast, Notifications modules; expanded table list; updated data flow with simulation layer; resolved export format decision | — |
| 2026-03-13 | Initial architecture doc generated | — |
