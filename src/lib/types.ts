// All data models structured for 1:1 migration to Supabase tables

export type Role = 'admin' | 'manager' | 'member';

export type ProjectCategory = 'Scouting' | 'Event' | 'Full Report' | 'Light Report' | 'Other';

export type FeeType = 'monthly' | 'project';
export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';
export type Priority = 'High' | 'Medium' | 'Low';
export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Done';

export type AllocationContributionMode = 'full' | 'part' | 'custom';

/** Task duration unit for single source of truth; converted to hours internally. */
export type TaskDurationUnit = 'hours' | 'days' | 'weeks' | 'months' | 'quarters';

/** 0 = Sunday, 1 = Monday, ... 6 = Saturday. Default [1,2,3,4,5] = Mon–Fri. */
export type WorkingDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarProfile {
  /** IANA timezone (e.g. "Europe/London"). Used to anchor task dates to local working day. */
  timezone: string;
  /** Days of week the member works. Default [1,2,3,4,5]. */
  workingDays: WorkingDay[];
  /** Hours per working day. Default 8. */
  dailyWorkingHours: number;
  /** Override for weekly hours; otherwise derived as workingDays.length × dailyWorkingHours. */
  weeklyWorkingHours?: number;
  /** Non-working dates (YYYY-MM-DD) — holidays/blackout. Excluded from available hour calc. */
  blackoutDates: string[];
}

export type AvailabilityType = 'full_time' | 'part_time' | 'contractor' | 'shared';

export interface RoleTaxonomy {
  id: string;
  name: string;
  orgId: string;
  color?: string;
  order?: number;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillTaxonomy {
  id: string;
  name: string;
  orgId: string;
  category?: string;
  order?: number;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  monthlySalary: number;
  billableHourlyRate: number;
  avatarColor: string;
  currency: string; // CurrencyCode
  /** Optional calendar for timezone, working days, and availability. */
  calendar?: CalendarProfile;
  /** Optional team identifier for multi-team organisations. */
  teamId?: string;
  /** Optional organisation identifier for multi-organisation setups. */
  organisationId?: string;
  /** Primary role in the organisation taxonomy (foreign key to RoleTaxonomy.id). */
  primaryRole?: string | null;
  /** Skill/specialisation tag ids (foreign keys to SkillTaxonomy.id). */
  skills?: string[];
  /** Availability type (full-time, part-time, contractor, shared). */
  availabilityType?: AvailabilityType;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  category: ProjectCategory;
  categoryOtherSpec?: string; // required when category is Other
  priority: Priority;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  feeType?: FeeType; // 'monthly' | 'project'; default monthly
  monthlyFee: number; // amount: monthly fee or total project fee depending on feeType
  currency: string; // CurrencyCode
  createdAt: string;
  /** Optional team identifier that owns this project. */
  teamId?: string;
  /** Optional organisation identifier (for multi-org setups). */
  organisationId?: string;
  /** Optional client workspace identifier when running in client deployment mode. */
  clientWorkspaceId?: string;
}

export interface Allocation {
  id: string;
  projectId: string;
  userId: string;
  ftePercent: number; // 0-100
  agreedMonthlyHours: number;
  billableHourlyRate: number;
  contributionMode?: AllocationContributionMode;
  roleOnProject?: string; // e.g. "Lead", "Support" — role on this project
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  order: number;
  plannedDurationWeeks?: number;
  plannedEffortHours?: number;
  plannedFtePercent?: number;
}

export interface Task {
  id: string;
  projectId: string;
  phaseId: string;
  title: string;
  description: string;
  assigneeIds: string[];
  /** Optional: duration as value + unit (single source of truth). When set, estimatedHours is derived. */
  durationValue?: number;
  durationUnit?: TaskDurationUnit;
  /** Effort in hours. Derived from durationValue+durationUnit when present; else manual/legacy. */
  estimatedHours: number;
  /** Optional: % of task effort per assignee (userId -> 0–100). Must sum to 100; default equal split. */
  assigneeSplit?: Record<string, number>;
  status: TaskStatus;
  startDate: string;
  dueDate: string;
  order: number;
}

export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  assigneeIds: string[];
  status: TaskStatus;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
}

export interface TimeLog {
  id: string;
  taskId: string;
  userId: string;
  projectId: string;
  hours: number;
  date: string;
  note: string;
}

export interface Alert {
  id: string;
  type: 'overallocation' | 'behind_schedule' | 'overage';
  projectId?: string;
  userId?: string;
  message: string;
  createdAt: string;
}

/** High-level organisation entity above teams. */
export interface Organisation {
  id: string;
  name: string;
  /** Organisation-level toggle for client workspaces to use shared taxonomy (if implemented). */
  useOrgTaxonomyByDefault?: boolean;
}

/** Logical team within an organisation. */
export interface Team {
  id: string;
  name: string;
  organisationId?: string;
}

export interface AppData {
  users: User[];
  projects: Project[];
  allocations: Allocation[];
  phases: Phase[];
  tasks: Task[];
  subtasks: SubTask[];
  timelogs: TimeLog[];
  alerts: Alert[];
  /** Optional multi-org / multi-team structures. */
  organisations?: Organisation[];
  teams?: Team[];
  /** Organisation-scoped taxonomy tables (RoleTaxonomy/SkillTaxonomy). */
  roles?: RoleTaxonomy[];
  skills?: SkillTaxonomy[];
}
