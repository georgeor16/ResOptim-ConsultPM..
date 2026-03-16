# Decision Log — MtB PM Tool

_Last updated: 2026-03-15_
_Log every meaningful architectural or product decision here. Include tradeoffs._

---

## Template

### [Decision title]
- **Date:**
- **What:** 
- **Why:** 
- **Tradeoffs:** 
- **Alternatives considered:** 

---

## Decisions

### Gantt chart is read-only
- **Date:** 2026-03-13
- **What:** Gantt chart is a read-only mirror of Tasks by Phase data
- **Why:** Keeps editing surfaces consolidated in one place, prevents data conflicts
- **Tradeoffs:** Users cannot edit directly from Gantt view
- **Alternatives considered:** Bidirectional Gantt editing — rejected to keep architecture clean

### Documentation lives in Git repo
- **Date:** 2026-03-13
- **What:** All technical docs stored as markdown in /docs, synced to Notion via GitHub Action
- **Why:** Docs version-control alongside code, no extra tooling needed
- **Tradeoffs:** Notion is always slightly behind Git (syncs on push only)
- **Alternatives considered:** Laser.io, Notion-native docs — rejected to keep everything in one repo

---

### RLS member visibility scope
- **Date:** 2026-03-15
- **What:** Members can SELECT all rows in projects, phases, tasks, subtasks, allocations, timelogs; write access restricted to own data only
- **Why:** This is an internal tool used by a single trusted team — full project visibility is needed for coordination; write isolation prevents accidental cross-member edits
- **Tradeoffs:** Members can see all project data (including revenue figures); if sensitivity becomes a concern this will need to be tightened to allocation-scoped visibility
- **Alternatives considered:** Strict isolation (members see only projects they're allocated to) — rejected as too restrictive for a small internal team

### Simulation share link auth pattern
- **Date:** 2026-03-15
- **What:** Share link reads (`/simulation/review/:shareId`) bypass RLS via a server-side service role key, not an anon Supabase policy
- **Why:** Keeps the `simulations` table closed to unauthenticated reads; the server validates the `share_token` and returns only the matched simulation
- **Tradeoffs:** Requires a server-side function or edge function to handle share link lookups — cannot be a pure client-side Supabase query
- **Alternatives considered:** Anon SELECT policy on `simulations` WHERE `share_token` matches — rejected because it exposes the table to unauthenticated enumeration risk
