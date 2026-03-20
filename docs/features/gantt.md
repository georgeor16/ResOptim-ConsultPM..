# Gantt Chart — Feature Doc

_Last updated: 2026-03-19_

---

## Overview
Auto-generated timeline view per project and aggregated on dashboard.

## Behaviour
- Read-only — editing surfaces live in Tasks by Phase
- Auto-refreshes in real time when `tasks` or `allocations` change (Supabase subscription)
- Bandwidth overlay toggle shows per-member FTE demand as coloured month-level bands below each project bar

## Bandwidth Overlay

Toggle the **Bandwidth** button in the Gantt header to show or hide per-member FTE bands.

- Each project row expands with one sub-row per allocated member
- Each sub-row shows coloured month segments across the timeline:
  - Green — < 75% FTE
  - Amber — 75–89%
  - Orange — 90–99%
  - Red — ≥ 100% (overallocated)
- Hovering a band shows: member name, month label, FTE%, and committed hours
- Bands are calculated using `getMemberSlotFtes()` from `src/lib/bandwidth.ts`

## Real-Time Updates

A single Supabase realtime channel (`gantt-live`) subscribes to `postgres_changes` on both `tasks` and `allocations`. Any INSERT/UPDATE/DELETE on either table triggers `onDataRefresh`, which re-runs `loadData()` and re-renders the Gantt without a full page reload.

- Subscription is opened once on mount and cleaned up on unmount
- Falls back gracefully when Supabase is not configured (localStorage mode)

## Status
**Stage:** Complete
