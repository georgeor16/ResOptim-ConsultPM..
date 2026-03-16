# Supabase Schema — MtB PM Tool

_Last updated: 2026-03-15_
_Update this file immediately when any table, column, or relationship changes._

---

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key (matches Supabase Auth uid) |
| name | text | Display name |
| email | text | User email |
| role | text | `admin` or `member` |
| created_at | timestamp | Auto-generated |

### projects
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Project name |
| category | text | Project category/type |
| status | text | `active`, `on_hold`, `completed`, `cancelled` |
| start_date | date | Project start |
| end_date | date | Project end |
| revenue | numeric | Revenue figure for forecast (in base currency) |
| created_at | timestamp | Auto-generated |

### team_members
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Member full name |
| email | text | Member email |
| primary_role | text | e.g. Consultant, PM, Analyst |
| skills | text[] | Skill tags |
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

### phases
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| project_id | uuid | FK → projects |
| name | text | Phase name |
| start_date | date | Phase start |
| end_date | date | Phase end |
| created_at | timestamp | Auto-generated |

### tasks
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| phase_id | uuid | FK → phases |
| assigned_to | uuid | FK → team_members (nullable) |
| name | text | Task name |
| status | text | `unscheduled`, `in_progress`, `complete` |
| start_date | date | Task start |
| end_date | date | Task end |
| completed_at | timestamp | Set when status → complete; triggers FTE% release |
| created_at | timestamp | Auto-generated |

### subtasks
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| task_id | uuid | FK → tasks |
| name | text | Subtask name |
| status | text | `open`, `complete` |
| created_at | timestamp | Auto-generated |

### timelogs
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| task_id | uuid | FK → tasks |
| member_id | uuid | FK → team_members |
| hours | numeric | Hours logged |
| logged_date | date | Date of log entry |
| created_at | timestamp | Auto-generated |

### calendar_profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| member_id | uuid | FK → team_members |
| timezone | text | Member timezone (IANA format) |
| working_days | text[] | e.g. `["Mon","Tue","Wed","Thu","Fri"]` |
| daily_hours | numeric | Default 8 |
| blackout_dates | date[] | Leave, public holidays |
| created_at | timestamp | Auto-generated |

### alerts
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → users (nullable — org-wide if null) |
| type | text | Alert type (e.g. `overallocation`, `deadline`, `simulation_applied`) |
| target_id | uuid | ID of the affected resource (member, project, etc.) |
| target_type | text | `member`, `project`, `task` |
| message | text | Human-readable alert text |
| read_at | timestamp | Null until dismissed |
| created_at | timestamp | Auto-generated |

### simulations
Persisted in Supabase because share links (`/simulation/review/:shareId`) must be accessible to users other than the creator.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| created_by | uuid | FK → users |
| name | text | Optional label |
| steps | jsonb | Ordered array of steps. Each step: `{ type, payload }` where type is `add_allocation`, `remove_allocation`, `adjust_fte`, or `reschedule_task` |
| share_token | text | Unique token for the share link URL; null if not shared (UNIQUE constraint) |
| applied_at | timestamp | Set when simulation is applied to live data; null if pending |
| created_at | timestamp | Auto-generated |

### simulation_templates
User-saved simulation step sequences for reuse.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| created_by | uuid | FK → users |
| name | text | Template name |
| steps | jsonb | Saved step sequence (same shape as `simulations.steps`) |
| created_at | timestamp | Auto-generated |

### scheduling_config
Stores Scheduling Assistant review cadence per user (or org-wide when `user_id` is null).

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → users (nullable — org-wide config if null) |
| review_cadence_days | integer | How often to prompt for a scheduling review |
| last_reviewed_at | timestamp | Timestamp of last completed review |
| created_at | timestamp | Auto-generated |

---

## Relationships

- `projects` → `phases` (one to many)
- `projects` → `allocations` (one to many)
- `phases` → `tasks` (one to many)
- `tasks` → `subtasks` (one to many)
- `tasks` → `timelogs` (one to many)
- `team_members` → `allocations` (one to many)
- `team_members` → `tasks` via `assigned_to` (one to many)
- `team_members` → `timelogs` (one to many)
- `team_members` → `calendar_profiles` (one to one)
- `users` → `simulations` via `created_by` (one to many)
- `users` → `simulation_templates` via `created_by` (one to many)
- `users` → `scheduling_config` (one to one, optional)
- `users` → `alerts` via `user_id` (one to many)

---

## localStorage (not Supabase)

Org-level taxonomy data is always stored in localStorage, even when Supabase is active:
- Role taxonomy (role names and definitions)
- Skill taxonomy (skill tags)
- Role/skill change history per member
- User switching state (demo/testing)
- Gantt view preferences (bandwidth overlay toggle, zoom level)
- Export filter configurations

---

## RLS Rules

RLS is enabled on all tables. Two roles: `admin` (full access to all tables) and `member` (per-table rules below).

**Determining role:** The app reads `users.role` for the authenticated user (`auth.uid()`).

### `projects`, `phases`, `tasks`, `subtasks`, `allocations`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | All rows |
| INSERT / UPDATE / DELETE | Allowed | Denied |

### `team_members`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | All rows |
| UPDATE | Allowed | Own row only (`id = auth.uid()`) |
| INSERT / DELETE | Allowed | Denied |

### `users`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | Own row only (`id = auth.uid()`) |
| UPDATE | Allowed | Own row only |
| INSERT / DELETE | Allowed | Denied |

### `timelogs`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | All rows |
| INSERT / UPDATE / DELETE | Allowed | Own rows only (`member_id = auth.uid()`) |

### `calendar_profiles`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | Own row only (`member_id = auth.uid()`) |
| INSERT / UPDATE | Allowed | Own row only |
| DELETE | Allowed | Denied |

### `alerts`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | Own (`user_id = auth.uid()`) + org-wide (`user_id IS NULL`) |
| INSERT / UPDATE / DELETE | Allowed | Denied (system-generated only) |

### `simulations`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | Own rows (`created_by = auth.uid()`) |
| INSERT / UPDATE / DELETE | Allowed | Own rows only |
| Share link reads (`/simulation/review/:shareId`) | — | Handled via **service role key** server-side; no anon RLS policy |

### `simulation_templates`
| Operation | Admin | Member |
|---|---|---|
| SELECT / INSERT / UPDATE / DELETE | All rows | Own rows only (`created_by = auth.uid()`) |

### `scheduling_config`
| Operation | Admin | Member |
|---|---|---|
| SELECT | All rows | Own (`user_id = auth.uid()`) + org-wide (`user_id IS NULL`) |
| INSERT / UPDATE | Allowed | Own row only (`user_id = auth.uid()`) |
| DELETE | Allowed | Denied |

---

## Changelog

| Date | Change | Commit |
|---|---|---|
| 2026-03-15 | Defined RLS rules for all 13 tables; resolved share link auth pattern (service role key) | — |
| 2026-03-15 | Added simulations, simulation_templates, scheduling_config tables; added user_id to alerts; updated localStorage section | — |
| 2026-03-15 | Added phases, tasks, subtasks, timelogs, alerts, users tables; expanded projects/team_members/calendar_profiles columns; fixed calendar_ps typo | — |
| 2026-03-13 | Initial schema doc generated | — |
