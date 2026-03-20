# Decision Log — MtB PM Tool

_Last updated: 2026-03-19_
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

### TanStack Query v5 as server state layer
- **Date:** 2026-03-15
- **What:** Data fetching uses TanStack Query (`@tanstack/react-query` v5) on top of the Supabase JS client, not raw Supabase calls directly in components
- **Why:** Provides caching, background refetch, loading/error states, and query invalidation without manual state management; keeps components clean
- **Tradeoffs:** Adds an abstraction layer; queries must be invalidated explicitly after mutations or data can go stale
- **Alternatives considered:** Raw Supabase JS client calls in components — rejected (no caching, verbose loading state boilerplate)

### Manager role gets admin-level RLS access
- **Date:** 2026-03-15
- **What:** The `manager` role is treated identically to `admin` in all RLS policies — full SELECT/INSERT/UPDATE/DELETE on all tables
- **Why:** Managers run core PM workflows (creating projects, allocating team, running simulations); restricting them to member-level access would break the app for them
- **Tradeoffs:** `manager` and `admin` are functionally identical at the database layer; any future distinction between them would require a migration
- **Alternatives considered:** Treating manager as member-level — rejected as it would block managers from creating and editing projects

### RLS member visibility scope _(superseded — see "Remove all member access restrictions" below)_
- **Date:** 2026-03-15
- **What:** Members can SELECT all rows in projects, phases, tasks, subtasks, allocations, timelogs; write access restricted to own data only
- **Why:** This is an internal tool used by a single trusted team — full project visibility is needed for coordination; write isolation prevents accidental cross-member edits
- **Tradeoffs:** Members can see all project data (including revenue figures); if sensitivity becomes a concern this will need to be tightened to allocation-scoped visibility
- **Alternatives considered:** Strict isolation (members see only projects they're allocated to) — rejected as too restrictive for a small internal team

### Supabase Auth integration approach (auth_id column, not re-keying)
- **Date:** 2026-03-16
- **What:** Added `auth_id uuid` column to `public.users` to link each row to a Supabase Auth account. `get_my_role()` now resolves role via `auth_id = auth.uid()` instead of `id = auth.uid()`. Existing app-managed `id` values are kept intact.
- **Why:** The app used mock auth (no Supabase Auth session) so `auth.uid()` was always NULL, silently blocking all RLS writes. Proper auth was needed to unblock deletions and any other write operations. The `auth_id` column approach avoids re-keying all FK relationships.
- **Tradeoffs:** Two ID columns on `public.users` (`id` for app relations, `auth_id` for auth lookup) — slightly surprising but clean. Email-based fallback matching auto-links `auth_id` on first login so no manual SQL is needed per user.
- **Alternatives considered:**
  - Re-key `public.users.id` to match Supabase Auth UIDs — rejected, would require cascading FK updates across all tables
  - Anon RLS policies (bypass auth entirely) — rejected, defeats the purpose of RLS

### Supabase Auth: email fallback with auto-link
- **Date:** 2026-03-16
- **What:** On login, `AuthContext` first tries to match `public.users` by `auth_id`. If not found, falls back to email match and automatically writes `auth_id` for that row. Subsequent logins use the fast path.
- **Why:** Avoids requiring every user to run a manual SQL `UPDATE` to link their Auth account. Sign up with matching email → app self-configures.
- **Tradeoffs:** On first login there's one extra Supabase write (updating `auth_id`). If a user signs up with a different email than their `public.users` record, they'll see an "Account not linked" message instead of silently failing.
- **Alternatives considered:** Manual SQL linking by an admin — rejected as too much friction for initial setup

### Leaked password protection deferred to Pro plan
- **Date:** 2026-03-16
- **What:** Supabase's HaveIBeenPwned.org integration ("Prevent use of leaked passwords") is a Pro plan feature and cannot be enabled on the Free tier. Frontend error handling for the HIBP error code (`"commonly used password"`) was added to the signup flow in `Login.tsx` as a precaution.
- **Why:** The Supabase dashboard flags this as a security advisory. The frontend handling is future-proof: when the project upgrades to Pro and the feature is enabled, the user-facing error message will already be clean.
- **Tradeoffs:** No server-side password breach check on Free tier — users can sign up with compromised passwords. The frontend message alone provides no real protection.
- **Alternatives considered:** Client-side zxcvbn password strength meter — rejected as over-engineering for an internal tool with a small, trusted user base

---

### Remove all member access restrictions — members now identical to admin/manager
- **Date:** 2026-03-16
- **What:** All `isManagerOrAbove` frontend guards removed from 11 files; RLS policies for `users`, `timelogs`, and `alerts` updated via migration 012 to give members full SELECT/INSERT/UPDATE/DELETE access identical to admin/manager. Pages previously blocked to members (Resources, Bandwidth, Team, Insights, Simulation, New Project) are now fully accessible. Project/task/phase filtering by assignee removed. Financial metrics, export, and all edit/delete controls are now visible to all roles.
- **Why:** The member role distinction was adding friction for a small, trusted internal team where all members need to operate the full tool. Maintaining dual UI surfaces and restrictive RLS was costing development time and causing UX inconsistencies.
- **Tradeoffs:** The `role` field on `public.users` is retained and still accurate — it drives `isAdmin` checks in Settings. If access restrictions need to be reintroduced later, the infrastructure (RLS policies, `isManagerOrAbove` flag in AuthContext) is still in place and just needs to be rewired.
- **Alternatives considered:** Flipping `isManagerOrAbove` to always return `true` — rejected; leaves a semantically incorrect flag that traps future developers. Removing guards at each call site (option b) is cleaner and honest.

---

### Gantt real-time subscription scope: tasks + allocations only
- **Date:** 2026-03-19
- **What:** Gantt uses a single Supabase realtime channel (`gantt-live`) subscribed to `postgres_changes` on `tasks` and `allocations`. Any change to either table calls `onDataRefresh` which re-runs `loadData()`.
- **Why:** Both tables directly affect what the Gantt renders — task dates drive bar positions, allocations drive the bandwidth overlay. Subscribing to all tables would cause unnecessary re-renders from unrelated changes (e.g. timelogs, alerts).
- **Tradeoffs:** Project date changes (edits to `projects` table) do not auto-refresh the Gantt; the existing `location.pathname` effect in Dashboard covers this when the user navigates back to the dashboard.
- **Alternatives considered:** Subscribe to all tables — rejected (too noisy); subscribe to tasks only — rejected, allocation changes affect bandwidth overlay which is a core part of the feature.

---

### Google export OAuth: server-side Edge Function, not client PKCE
- **Date:** 2026-03-19
- **What:** Google OAuth exchange and token storage happen in a Supabase Edge Function (`google-oauth`), not directly in the browser. Refresh tokens are stored in a `user_google_tokens` table (RLS-scoped) and never sent to the client. All Slides/Docs API calls are proxied through a second Edge Function (`google-export`).
- **Why:** Keeping refresh tokens server-side prevents token theft via XSS. The `google-export` function auto-refreshes expired tokens before calling the Google API, so the client never needs to manage token lifecycle.
- **Tradeoffs:** Two extra Edge Functions to deploy and maintain; Google API rate limit errors surface as Edge Function 502 responses. Token refresh is synchronous-in-line which adds ~200ms latency when a refresh is needed.
- **Alternatives considered:** Client-side PKCE with tokens in localStorage — rejected (tokens exposed to XSS); client-side PKCE with tokens in Supabase — rejected (client still handles the exchange, refresh token written from client context which is avoidable)

---

### Simulation share link auth pattern
- **Date:** 2026-03-15
- **What:** Share link reads (`/simulation/review/:shareId`) bypass RLS via a server-side service role key, not an anon Supabase policy
- **Why:** Keeps the `simulations` table closed to unauthenticated reads; the server validates the `share_token` and returns only the matched simulation
- **Tradeoffs:** Requires a server-side function or edge function to handle share link lookups — cannot be a pure client-side Supabase query
- **Alternatives considered:** Anon SELECT policy on `simulations` WHERE `share_token` matches — rejected because it exposes the table to unauthenticated enumeration risk
