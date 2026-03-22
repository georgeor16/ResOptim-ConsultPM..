# Scheduling Assistant — Feature Doc

_Last updated: 2026-03-21_

---

## Overview
Slide-in panel for batch-scheduling unscheduled tasks across all projects. Calendar-aware: respects per-member working days, timezones, and blackout dates.

## Behaviour
- Surfaces unscheduled tasks grouped by project and phase; counter badge on the panel button
- **Manual scheduling:** enter start/end dates per task; previews resulting FTE demand per assignee; shows inline blackout conflict warnings (e.g. "⚠ Alice has 2 blackout dates in this range")
- **Auto-schedule all:** walks calendar days from phase start, finds earliest window where all assignees are available (correct working day + no blackout dates), counts forward required working days, assigns dates in bulk; tasks that cannot fit within the phase window surface in a toast
- Calendar awareness uses member timezone via `Intl.DateTimeFormat` for correct day-of-week boundaries across timezones
- Reads all calendar profiles via `calendarStore.getAllCalendarProfiles`

## Status
**Stage:** Complete
All scheduling flows (manual, auto-schedule, blackout conflict detection) fully shipped as of 2026-03-20.
