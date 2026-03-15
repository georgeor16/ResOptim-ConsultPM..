# Supabase Schema — MtB PM Tool

_Last updated: 2026-03-13_
_Update this file immediately when any table, column, or relationship changes._

---

## Tables

### projects
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Project name |
| start_date | date | Project start |
| end_date | date | Project end |
| created_at | timestamp | Auto-generated |

### team_members
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Member full name |
| email | text | Member email |
| available_fte | numeric | Default 100 |
| created_at | timestamp | Auto-generated |

### allocations
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| member_id | uuid | FK → team_members |
| fte_percentage | numeric | Allocated FTE% |
| start_date | date | Allocation start |
| end_date | date | Allocation end |
| created_at | timestamp | Auto-generated |

### calendar_ps
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| member_id | uuid | FK → team_members |
| working_days | text[] | e.g. Mon-Fri |
| daily_hours | numeric | Default 8 |
| blackout_dates | date[] | Leave, holidays |
| created_at | timestamp | Auto-generated |

---

## Relationships

- projects → allocations (one to many)
- team_members → allocations (one to many)
- team_members → calendar_profiles (one to one)

---

## RLS Rules

- Not yet configured — TBD

---

## Changelog

| Date | Change | Commit |
|---|---|---|
| 2026-03-13 | Initial schema doc generated | — |
