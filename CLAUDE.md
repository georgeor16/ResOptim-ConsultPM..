# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server on port 8080
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Run tests once (vitest)
npm run test:watch # Run tests in watch mode
```

Run a single test file:
```bash
npx vitest run src/test/example.test.ts
```

## Architecture

**ResOptim** is a React 18 + TypeScript + Vite SPA for consulting project management (resource allocation, scheduling, Gantt, financials).

### Path alias
`@/` maps to `src/`.

### Routing (`src/App.tsx`)
All routes are wrapped in: `ThemeProvider > QueryClientProvider > TooltipProvider > BrowserRouter > AuthProvider > SimulationProvider > Layout`.

Key routes:
- `/` — Dashboard
- `/projects`, `/projects/new`, `/projects/:id` — Projects
- `/resources` — Resource Allocation
- `/bandwidth` — Bandwidth Overview
- `/insights` — Insights
- `/simulation`, `/simulation/review/:shareId` — What-If Simulation
- `/team` — Team
- `/settings` — Settings

### Data layer (`src/lib/`)
The app stores data in either **Supabase** (when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars are set) or **`localStorage`** (`consulting_pm_data` key) as a fallback. The persistence layer is abstracted in `src/lib/store.ts` — CRUD helpers (`addItem`, `updateItem`, `deleteItem`) transparently write to whichever backend is active.

- `store.ts` — `loadData()`, `saveData()`, `addItem()`, `updateItem()`, `deleteItem()`, `deleteProject()`. Supabase uses snake_case columns; store handles camelCase↔snake_case mapping automatically.
- `types.ts` — All data models (`AppData`, `User`, `Project`, `Allocation`, `Phase`, `Task`, `SubTask`, `TimeLog`, `Alert`, `Organisation`, `Team`, `RoleTaxonomy`, `SkillTaxonomy`).
- `supabase.ts` — Exports `supabase` client (null if not configured) and `isSupabaseConfigured`.
- `fte.ts` — FTE calculation utilities. Standard: 40 h/week, 8 h/day, ~173 h/month (`HOURS_PER_MONTH = 40 × 52/12`).
- `bandwidth.ts` / `bandwidthConflicts.ts` — Capacity conflict detection.
- `simulation.ts` — Step types and apply logic for the what-if simulation feature.
- `seed.ts` — Creates initial demo data when the app is first loaded.
- `templates.ts` — Phase templates per project category.
- `notifications.ts` / `orgNotificationEngine.ts` — In-app and org-level notification system.

### Contexts
- `AuthContext` (`src/contexts/AuthContext.tsx`) — Provides `currentUser`, `users`, `switchUser()`, `refreshUsers()`, `hasRole()`, `isAdmin`, `isManagerOrAbove`. On init, seeds data if not already seeded, then loads from Supabase or localStorage. Persists `current_user_id` in `localStorage`.
- `SimulationContext` (`src/contexts/SimulationContext.tsx`) — Manages what-if simulation state: `isSimulationMode`, `baseData`, `steps[]`, `simulatedData`. Steps are replayed on top of a deep clone of live data. `applyAll()` persists steps to the real store.

### UI components
- `src/components/ui/` — shadcn/ui primitives (Radix-based, generated — do not manually edit).
- `src/components/` — Feature components.
- `src/pages/` — Page-level components (one per route).
- `src/components/Layout.tsx` — Sidebar navigation wrapper.
- `src/components/dashboard/` — Dashboard-specific panels (Gantt, KPI cards, heatmap, revenue forecast, etc.).

### Supabase setup (optional)
Set env vars to enable cloud persistence:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Without these, the app works entirely via `localStorage`. Core tables: `users`, `projects`, `allocations`, `phases`, `tasks`, `subtasks`, `timelogs`, `alerts`. Org/team/taxonomy metadata stays in `localStorage` even when Supabase is active.

### Testing
Vitest + jsdom + @testing-library/react. Test files live under `src/**/*.{test,spec}.{ts,tsx}`. Setup file: `src/test/setup.ts`.
