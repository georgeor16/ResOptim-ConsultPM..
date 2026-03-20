# Session Summaries — MtB PM Tool

_Paste end-of-session summaries here. Most recent at the top._

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
