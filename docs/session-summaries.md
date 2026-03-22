# Session Summaries — MtB PM Tool

_Paste end-of-session summaries here. Most recent at the top._

---

## Session — 2026-03-21 (Delete bug fix)

- **Built:** Fix for project and task deletion — deleted items were reappearing after every page refresh. The confirmation dialog closed correctly but items came back immediately on reload.
- **Changed:** `src/lib/store.ts` — `deleteItem` and `deleteProject` now always clean the localStorage mirror after a Supabase delete, not only on Supabase failure. Removed two early-return exits that were skipping the localStorage cleanup block.
- **Changed:** `docs/decisions.md` — new entry documenting the write-through mirror pattern for deletes.
- **Decisions made:** Delete must mirror `addItem`'s write-through pattern (both Supabase + localStorage). Root cause: `loadFromSupabase` merges any localStorage row absent from Supabase back into state on every load — Supabase-only deletes were silently undone. Kept the merge logic intact as it protects items that failed to sync on create.
- **Open questions:** CSV export still unresolved. Google export deployment still on hold.
- **Next session:** Run deployment steps from `docs/google-export-setup.md` and smoke-test Google Slides / Docs export end-to-end.

---

## Session — 2026-03-19 (Google Export)

- **Built:** Google Slides + Google Docs export integration — full OAuth 2.0 flow server-side via Supabase Edge Functions; refresh tokens never touch the client
- **New files:**
  - `supabase/migrations/013_google_oauth_tokens.sql` — `user_google_tokens` table + RLS (per-user, own row only)
  - `supabase/functions/google-oauth/index.ts` — Edge Function handling `auth_url`, `exchange`, `refresh`, `revoke` actions
  - `supabase/functions/google-export/index.ts` — Edge Function calling Slides/Docs/Drive APIs; auto-refreshes token if within 60s of expiry
  - `src/lib/googleAuth.ts` — frontend OAuth helpers (initiate redirect, callback handler, connection status, revoke)
  - `src/lib/ganttExportGoogle.ts` — `exportGanttToSlides`, `exportGanttToDocs`, `buildExportTableData` (chart PNG + allocation table)
- **Changed:** `GanttExportPanel.tsx` — replaced stub alert with real Connect/Disconnect flow, shows connected Google email, wires up Slides/Docs export with error display
- **Decisions made:** Server-side OAuth exchange (keeps refresh tokens off client); export content = chart screenshot + FTE allocation table (member, project, FTE%, period)
- **On hold:** GCP project creation + Supabase secrets + migration push + Edge Function deploy — full step-by-step guide at `docs/google-export-setup.md`
- **Open questions:** CSV export still unresolved
- **Next session:** Run deployment steps from `docs/google-export-setup.md` and smoke-test end-to-end

---

## Session — 2026-03-19

- **Built:** Gantt bandwidth overlay toggle — per-member FTE bands rendered as coloured month-level sub-rows below each project bar (green < 75%, amber 75–89%, orange 90–99%, red ≥ 100%); hover tooltip shows member name, month, FTE%, and committed hours
- **Built:** Gantt real-time updates — Supabase channel `gantt-live` subscribes to `postgres_changes` on `tasks` and `allocations`; any change triggers `onDataRefresh` → `loadData()` re-render without a page reload; no-ops gracefully in localStorage mode
- **Changed:** `UnifiedGantt` — added `onDataRefresh` prop, `bandwidthOverlay` local state, `memberSlotFtes` useMemo, subscription `useEffect`, toggle button + colour legend in header; removed unused `Badge` import
- **Changed:** `Dashboard` — `refreshData` stabilised with `useCallback`, passed as `onDataRefresh` to `UnifiedGantt`
- **Decisions made:** Subscription scope = tasks + allocations (both affect Gantt rendering); overlay granularity = per-member rows; toggle placement = local Gantt header
- **Open questions:** None
- **Next session:** —

---

## Template

### Session — [Date]
- Built:
- Changed:
- Decisions made:
- Open questions:
- Next session:

---
