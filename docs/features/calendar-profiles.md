# Calendar Profiles — Feature Doc

_Last updated: 2026-03-20_

---

## Overview
Per-member working patterns used by the Scheduling Assistant and FTE calculator.

## Behaviour

### Timezone setting
- Each member has an IANA timezone (e.g. `Asia/Tokyo`, `America/New_York`).
- `isWorkingDay()` in `src/lib/calendar.ts` uses `Intl.DateTimeFormat` to resolve the day-of-week in the member's timezone, not the browser's local time.
- Timezone list in the editor covers 18 common zones (UTC, Europe, Americas, Africa, Asia, Pacific).

### Working days configuration
- Toggle individual days Mon–Sun per member.
- Used by `getWorkingDaysInRange()` and `getAvailableHoursForMember()`.

### Daily hours / weekly override
- Default 8 hours/day. Optional weekly override (e.g. 30h/week part-time).
- FTE percentage calculation scales to available hours in the period.

### Blackout dates (leave, holidays)
- Interactive date picker — click any day to toggle it as a blackout day. Days already marked non-working are greyed out.
- Stored as an array of `YYYY-MM-DD` strings in `calendar_profiles.blackout_dates`.
- `isWorkingDay()` excludes blackout dates from availability calculations.
- Scheduling Assistant shows per-assignee blackout conflict warnings when task dates overlap with blackout days.

### Scheduling Assistant integration
- When manually entering task dates, any assignee blackout conflicts are shown inline as warnings.
- "Auto-schedule all" button: for each unscheduled task in a phase that has dates, the algorithm finds the earliest window where all assignees are available (no blackout, correct working day), then counts forward the required number of working days to set the due date.
- Tasks that cannot be scheduled within the phase window are reported in a toast.

## Data storage
Calendar profiles are stored in the dedicated `calendar_profiles` Supabase table (migration 014). Previously stored as a JSON blob in `users.calendar` — the app automatically migrates existing blobs into the table on first read.

## Status
**Complete.** All four sub-features implemented.

## Related files
- `src/components/CalendarProfileEditor.tsx` — editor UI (timezone, working days, hours, blackout picker)
- `src/components/BlackoutDatePicker.tsx` — interactive calendar picker for blackout dates
- `src/lib/calendar.ts` — `isWorkingDay`, `getDayOfWeekInTimezone`, `getAvailableHoursForMember`
- `src/lib/calendarStore.ts` — `getCalendarProfile`, `upsertCalendarProfile`, `getAllCalendarProfiles`
- `src/components/SchedulingAssistant.tsx` — auto-schedule algorithm + conflict hints
- `src/pages/Team.tsx` — calendar editor trigger per user
- `supabase/migrations/014_calendar_profiles.sql`
