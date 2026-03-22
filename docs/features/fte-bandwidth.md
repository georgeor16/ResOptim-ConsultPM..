# FTE % & Bandwidth — Feature Doc

_Last updated: 2026-03-21_

---

## Overview
Core allocation engine. Tracks FTE% per member per project and warns on overallocation.

## Behaviour
- FTE% allocation per member per project; month is base unit
- **Multi-period view toggle:** Week / Month / Quarter / Half Year / Year across Resource Allocation and Bandwidth views
- **Automatic FTE% derivation:** derived from task effort and duration (duration unit dropdown: hours, days, weeks, month)
- **projectSharePercent:** member's share of a project drives FTE% as `share × project FTE demand ÷ 100`
- Warning thresholds: green <75%, amber 75–89%, orange 90–99%, red/pulsing 100%+
- Task completion triggers automatic FTE% release for that period
- Conflict resolution sheet surfaces automatically when a change causes overallocation

## Status
**Stage:** Complete
All features shipped: core allocation, overallocation warnings, multi-period toggle, automatic FTE% derivation from task duration, conflict resolution panel.
