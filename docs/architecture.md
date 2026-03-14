# Architecture — MtB Resource Optimization & PM Tool

_Last updated: 2026-03-13_
_Update this file at every commit that changes system structure._

---

## System Overview

An internal project management and resource allocation tool for the Mind the Bridge consulting team. Enables tracking of team members across projects, FTE% allocation, bandwidth planning, and timeline visualization.

---

## High-Level Architecture

UI (Frontend - Lovable/React) --> Supabase --> PostgreSQL
Supabase --> Supabase Auth
Claude Code (Cursor) --> Git Repository --> Notion

---

## Component Map

Frontend Components:
- Gantt Chart View
- Scheduling Assistant
- FTE % Calculator
- Bandwidth Warning System
- Calendar Profiles
- Export Module

Supabase Tables:
- Projects
- Team Members
- Allocations
- Calendar Profiles

---

## Data Flow

1. User sets FTE% for a member on a project
2. Frontend sends UPSERT to Supabase allocations table
3. Supabase confirms write
4. Frontend recalculates bandwidth warnings
5. Updated Gantt + warnings displayed to user

---

## Key Modules

### FTE % and Bandwidth
- Each member has total available FTE (default 100%)
- Allocations stored per member per project per time period
- Warning at over 90%, red alert at over 100%

### Gantt Chart
- Project-level timeline view
- Driven by project start/end dates in Supabase
- Renders per-member allocation bars

### Scheduling Assistant
- Suggests optimal allocation based on current bandwidth
- Reads calendar profiles for member availability

### Calendar Profiles
- Per-member working patterns (days/week, leave, part-time)
- Used by Scheduling Assistant and FTE calculator

### Export
- Outputs allocation reports
- Snapshot of current Gantt view

---

## Infrastructure

| Layer | Tool |
|---|---|
| Frontend | Lovable (React-based) |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| IDE | Cursor |
| AI Layer | Claude Code (Anthropic) |
| Version Control | Git |
| Stakeholder Docs | Notion |

---

## Open Decisions

- Export format: CSV only or PDF as well?
- Multi-tenant support: single org or future multi-client?
- RLS strategy: row-level security rules not yet documented
- Real-time updates: Supabase realtime subscriptions in scope?

---

## Changelog

| Date | Change | Commit |
|---|---|---|
| 2026-03-13 | Initial architecture doc generated | — |