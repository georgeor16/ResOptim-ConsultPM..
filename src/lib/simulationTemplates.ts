/**
 * Adaptive simulation template library: starter templates, pattern learning, personal templates.
 */

import type { AppData, Allocation } from './types';
import type { SimulationStep } from './simulation';
import { genStepId } from './simulation';
import { genId } from './store';

export type TemplateCategory = 'starter' | 'suggested' | 'personal' | 'team';

export interface SimulationTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** Estimated number of steps when run */
  estimatedSteps: number;
  /** For starter/suggested: required param keys for the run form */
  paramSchema?: { key: string; label: string; type: 'member' | 'project' | 'projects' | 'capacity' | 'dateRange' | 'number' }[];
  /** For personal: stored steps (concrete); for starter/suggested: undefined, steps built from buildStarterSteps */
  storedSteps?: SimulationStep[];
  usageCount: number;
  appliedCount: number;
  discardedCount: number;
  lastUsedAt: string | null; // ISO
  createdAt: string; // ISO
  /** Suggested only: number of similar runs this was generated from */
  confidenceCount?: number;
  /** Suggested only: dismiss so we don't re-suggest unless pattern strengthens */
  dismissed?: boolean;
  /** Personal/team: owner userId */
  ownerId?: string;
  /** Team-wide shared */
  sharedWithTeam?: boolean;
  /** User IDs who pinned this template */
  pinnedByUserIds?: string[];
  /** Number of times an applied run was later marked reversed (for this template) */
  reversalCount?: number;
  /** Health: green = working well, amber = needs refinement, red = flagged for review */
  health?: 'green' | 'amber' | 'red';
  /** Frustrated discard count (high-value signal) */
  frustratedDiscardCount?: number;
}

export interface TemplateRunRecord {
  id: string;
  templateId?: string;
  stepSignature: string;
  stepsSummary: unknown;
  /** Full steps for pattern-replay (suggested templates) */
  steps?: SimulationStep[];
  applied: boolean;
  /** When this run was recorded (apply or discard time) */
  createdAt: string;
  /** If applied then later reversed by user; set when user marks "reversed" */
  reversedAt?: string;
  /** Session length in minutes when run was recorded (for discard classification) */
  sessionDurationMinutes?: number;
  /** Whether simulation was shared for review before apply/discard */
  wasShared?: boolean;
}

const TEMPLATES_STORAGE_KEY = 'consultpm_simulation_templates';
const RUNS_STORAGE_KEY = 'consultpm_simulation_runs';
const PATTERN_DISMISSED_KEY = 'consultpm_pattern_dismissed';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Starter template definitions: build steps from (data, params) ----

export type StarterTemplateId =
  | 'onboard_new_member'
  | 'cover_sick_leave'
  | 'kick_off_new_project'
  | 'wind_down_project'
  | 'ramp_up_member'
  | 'ramp_down_member'
  | 'resolve_overallocation'
  | 'parallel_stress_test';

export interface TemplateParams {
  userId?: string;
  projectId?: string;
  projectIds?: string[];
  capacity?: number;
  dateFrom?: string;
  dateTo?: string;
  /** For cover: replace this user (absent) with this user (cover) */
  coverUserId?: string;
  absentUserId?: string;
  /** For resolve overallocation: overallocated userId */
  targetUserId?: string;
}

/** Coerce capacity to 0–100; use default when value is NaN or not a number (avoids "NaN%" in labels). */
function normalizeCapacity(value: unknown, defaultPct: number): number {
  const n = Number(value);
  if (typeof value !== 'number' && typeof value !== 'string') return defaultPct;
  if (!Number.isFinite(n)) return defaultPct;
  return Math.min(100, Math.max(0, n));
}

const STARTER_DEFINITIONS: Record<
  StarterTemplateId,
  { name: string; description: string; tags: string[]; paramSchema: SimulationTemplateMeta['paramSchema']; buildSteps: (data: AppData, params: TemplateParams) => SimulationStep[] }
> = {
  onboard_new_member: {
    name: 'Onboard a new team member',
    description: 'Simulate adding a new member across one or more projects at a specified capacity, previewing full bandwidth impact before their first day.',
    tags: ['onboarding', 'new hire'],
    paramSchema: [
      { key: 'userId', label: 'Team member', type: 'member' },
      { key: 'projectId', label: 'Project', type: 'project' },
      { key: 'capacity', label: 'Capacity %', type: 'capacity' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const user = data.users.find((u) => u.id === params.userId);
      const projects = (params.projectIds ?? (params.projectId ? [params.projectId] : [])).filter((pid) =>
        data.projects.some((p) => p.id === pid && p.status === 'Active')
      );
      const capacity = normalizeCapacity(params.capacity, 100);
      if (!user || projects.length === 0) return steps;
      projects.forEach((projectId) => {
        const project = data.projects.find((p) => p.id === projectId);
        const allocation: Allocation = {
          id: genId(),
          projectId,
          userId: user.id,
          ftePercent: capacity,
          agreedMonthlyHours: Math.round((173 * capacity) / 100),
          billableHourlyRate: user.billableHourlyRate,
        };
        steps.push({
          id: genStepId(),
          type: 'add_allocation',
          label: `Added ${user.name} to ${project?.name ?? 'project'} at ${capacity}%`,
          allocation,
        });
      });
      return steps;
    },
  },
  cover_sick_leave: {
    name: 'Cover sick leave or absence',
    description: 'Simulate replacing one member with another across all their active task assignments for a date range, with automatic FTE % redistribution.',
    tags: ['sick leave', 'absence', 'cover'],
    paramSchema: [
      { key: 'absentUserId', label: 'Absent member', type: 'member' },
      { key: 'coverUserId', label: 'Cover member', type: 'member' },
      { key: 'dateFrom', label: 'From date', type: 'dateRange' },
      { key: 'dateTo', label: 'To date', type: 'dateRange' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const fromId = params.absentUserId;
      const toId = params.coverUserId;
      if (!fromId || !toId || fromId === toId) return steps;
      const tasks = data.tasks.filter(
        (t) => (t.assigneeIds ?? []).includes(fromId) && t.status !== 'Done'
      );
      const fromUser = data.users.find((u) => u.id === fromId);
      const toUser = data.users.find((u) => u.id === toId);
      if (!fromUser || !toUser) return steps;
      tasks.forEach((task) => {
        steps.push({
          id: genStepId(),
          type: 'reassign_task',
          label: `Reassigned "${task.title}" from ${fromUser.name} to ${toUser.name}`,
          taskId: task.id,
          fromUserId: fromId,
          toUserId: toId,
        });
      });
      return steps;
    },
  },
  kick_off_new_project: {
    name: 'Kick off a new project',
    description: 'Simulate adding an entirely new project with estimated phases, task durations, and team assignments, previewing bandwidth impact across the existing portfolio.',
    tags: ['new project', 'kickoff'],
    paramSchema: [
      { key: 'projectId', label: 'Existing project to clone or use as base', type: 'project' },
      { key: 'userId', label: 'Lead / first member', type: 'member' },
      { key: 'capacity', label: 'Initial capacity %', type: 'capacity' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const projectId = params.projectId;
      const user = data.users.find((u) => u.id === params.userId);
      const project = data.projects.find((p) => p.id === projectId);
      const capacity = normalizeCapacity(params.capacity, 50);
      if (!user || !project) return steps;
      const existingAlloc = data.allocations.find((a) => a.projectId === projectId && a.userId === user.id);
      if (!existingAlloc) {
        const allocation: Allocation = {
          id: genId(),
          projectId,
          userId: user.id,
          ftePercent: capacity,
          agreedMonthlyHours: Math.round((173 * capacity) / 100),
          billableHourlyRate: user.billableHourlyRate,
        };
        steps.push({
          id: genStepId(),
          type: 'add_allocation',
          label: `Added ${user.name} to ${project.name} at ${capacity}%`,
          allocation,
        });
      }
      return steps;
    },
  },
  wind_down_project: {
    name: 'Wind down a project',
    description: "Simulate removing a project and releasing its team members' bandwidth, previewing how capacity redistributes across remaining projects.",
    tags: ['wind down', 'closure'],
    paramSchema: [{ key: 'projectId', label: 'Project to wind down', type: 'project' }],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const projectId = params.projectId;
      if (!projectId) return steps;
      const allocs = data.allocations.filter((a) => a.projectId === projectId);
      const project = data.projects.find((p) => p.id === projectId);
      allocs.forEach((alloc) => {
        const user = data.users.find((u) => u.id === alloc.userId);
        steps.push({
          id: genStepId(),
          type: 'remove_allocation',
          label: `Removed ${user?.name ?? 'member'} from ${project?.name ?? 'project'}`,
          allocationId: alloc.id,
          projectId: alloc.projectId,
          userId: alloc.userId,
        });
      });
      return steps;
    },
  },
  ramp_up_member: {
    name: 'Ramp up a member',
    description: "Simulate gradually increasing a member's capacity across one or more projects over time (e.g., from 25% to 100% over three months).",
    tags: ['ramp up', 'capacity'],
    paramSchema: [
      { key: 'userId', label: 'Member', type: 'member' },
      { key: 'projectId', label: 'Project', type: 'project' },
      { key: 'capacity', label: 'Target capacity %', type: 'capacity' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const user = data.users.find((u) => u.id === params.userId);
      const projects = (params.projectIds ?? (params.projectId ? [params.projectId] : [])).filter((pid) =>
        data.projects.some((p) => p.id === pid)
      );
      const capacity = normalizeCapacity(params.capacity, 100);
      if (!user) return steps;
      projects.forEach((projectId) => {
        const project = data.projects.find((p) => p.id === projectId);
        const alloc = data.allocations.find((a) => a.projectId === projectId && a.userId === user.id);
        if (alloc && alloc.ftePercent !== capacity) {
          steps.push({
            id: genStepId(),
            type: 'update_allocation_capacity',
            label: `Set ${user.name} capacity on ${project?.name ?? 'project'} to ${capacity}%`,
            allocationId: alloc.id,
            ftePercent: capacity,
          });
        } else if (!alloc) {
          const allocation: Allocation = {
            id: genId(),
            projectId,
            userId: user.id,
            ftePercent: capacity,
            agreedMonthlyHours: Math.round((173 * capacity) / 100),
            billableHourlyRate: user.billableHourlyRate,
          };
          steps.push({
            id: genStepId(),
            type: 'add_allocation',
            label: `Added ${user.name} to ${project?.name ?? 'project'} at ${capacity}%`,
            allocation,
          });
        }
      });
      return steps;
    },
  },
  ramp_down_member: {
    name: 'Ramp down a member',
    description: "Simulate gradually reducing a member's capacity in preparation for their departure or role change.",
    tags: ['ramp down', 'capacity', 'departure'],
    paramSchema: [
      { key: 'userId', label: 'Member', type: 'member' },
      { key: 'capacity', label: 'Target capacity %', type: 'capacity' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const user = data.users.find((u) => u.id === params.userId);
      const capacity = normalizeCapacity(params.capacity, 0);
      if (!user) return steps;
      const allocs = data.allocations.filter((a) => a.userId === user.id);
      allocs.forEach((alloc) => {
        const project = data.projects.find((p) => p.id === alloc.projectId);
        if (capacity === 0) {
          steps.push({
            id: genStepId(),
            type: 'remove_allocation',
            label: `Removed ${user.name} from ${project?.name ?? 'project'}`,
            allocationId: alloc.id,
            projectId: alloc.projectId,
            userId: alloc.userId,
          });
        } else if (alloc.ftePercent !== capacity) {
          steps.push({
            id: genStepId(),
            type: 'update_allocation_capacity',
            label: `Set ${user.name} capacity on ${project?.name ?? 'project'} to ${capacity}%`,
            allocationId: alloc.id,
            ftePercent: capacity,
          });
        }
      });
      return steps;
    },
  },
  resolve_overallocation: {
    name: 'Resolve overallocation',
    description: 'Simulate redistribution strategies for a currently overallocated member — auto-populated with their real current conflict state as the starting point.',
    tags: ['overallocation', 'conflict'],
    paramSchema: [
      { key: 'targetUserId', label: 'Overallocated member', type: 'member' },
      { key: 'coverUserId', label: 'Reassign tasks to', type: 'member' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const fromId = params.targetUserId;
      const toId = params.coverUserId;
      if (!fromId || !toId || fromId === toId) return steps;
      const tasks = data.tasks.filter(
        (t) => (t.assigneeIds ?? []).includes(fromId) && t.status !== 'Done'
      );
      const fromUser = data.users.find((u) => u.id === fromId);
      const toUser = data.users.find((u) => u.id === toId);
      if (!fromUser || !toUser) return steps;
      tasks.slice(0, 5).forEach((task) => {
        steps.push({
          id: genStepId(),
          type: 'reassign_task',
          label: `Reassigned "${task.title}" from ${fromUser.name} to ${toUser.name}`,
          taskId: task.id,
          fromUserId: fromId,
          toUserId: toId,
        });
      });
      return steps;
    },
  },
  parallel_stress_test: {
    name: 'Parallel project stress test',
    description: 'Simulate adding a high-demand project during an already busy period to identify peak conflict windows before committing.',
    tags: ['stress test', 'parallel', 'conflict'],
    paramSchema: [
      { key: 'projectId', label: 'Project to add load from', type: 'project' },
      { key: 'userId', label: 'Member to assign additional load', type: 'member' },
      { key: 'capacity', label: 'Additional capacity %', type: 'capacity' },
    ],
    buildSteps(data, params) {
      const steps: SimulationStep[] = [];
      const projectId = params.projectId;
      const user = data.users.find((u) => u.id === params.userId);
      const project = data.projects.find((p) => p.id === projectId);
      const capacity = normalizeCapacity(params.capacity, 50);
      if (!user || !project) return steps;
      const existingAlloc = data.allocations.find((a) => a.projectId === projectId && a.userId === user.id);
      if (!existingAlloc) {
        const allocation: Allocation = {
          id: genId(),
          projectId,
          userId: user.id,
          ftePercent: capacity,
          agreedMonthlyHours: Math.round((173 * capacity) / 100),
          billableHourlyRate: user.billableHourlyRate,
        };
        steps.push({
          id: genStepId(),
          type: 'add_allocation',
          label: `Added ${user.name} to ${project.name} at ${capacity}% (stress test)`,
          allocation,
        });
      }
      return steps;
    },
  },
};

export function getStarterTemplateIds(): StarterTemplateId[] {
  return Object.keys(STARTER_DEFINITIONS) as StarterTemplateId[];
}

export function buildStarterSteps(templateId: StarterTemplateId, data: AppData, params: TemplateParams): SimulationStep[] {
  const def = STARTER_DEFINITIONS[templateId];
  return def ? def.buildSteps(data, params) : [];
}

export function getStarterTemplateMeta(templateId: StarterTemplateId): Omit<SimulationTemplateMeta, 'usageCount' | 'appliedCount' | 'discardedCount' | 'lastUsedAt' | 'createdAt'> {
  const def = STARTER_DEFINITIONS[templateId];
  const paramSchema = def?.paramSchema ?? [];
  const estimatedSteps = paramSchema.length ? 3 : 1;
  return {
    id: templateId,
    name: def?.name ?? templateId,
    description: def?.description ?? '',
    category: 'starter',
    tags: def?.tags ?? [],
    estimatedSteps,
    paramSchema,
  };
}

// ---- Template usage and custom templates (localStorage) ----

interface StoredTemplateState {
  usage: Record<string, { count: number; applied: number; discarded: number; lastUsedAt: string | null }>;
  personal: SimulationTemplateMeta[];
  suggested: SimulationTemplateMeta[];
  pinned: Record<string, string[]>; // templateId -> userId[]
  dismissedPatterns: string[];
  /** Template IDs that have been retired/archived (hidden from main library, restorable) */
  archivedTemplateIds: string[];
}

function loadTemplateState(): StoredTemplateState {
  return loadJson<StoredTemplateState>(TEMPLATES_STORAGE_KEY, {
    usage: {},
    personal: [],
    suggested: [],
    pinned: {},
    dismissedPatterns: [],
    archivedTemplateIds: [],
  });
}

function saveTemplateState(s: StoredTemplateState): void {
  saveJson(TEMPLATES_STORAGE_KEY, s);
}

export function getTemplateUsage(templateId: string): { usageCount: number; appliedCount: number; discardedCount: number; lastUsedAt: string | null } {
  const state = loadTemplateState();
  const u = state.usage[templateId] ?? { count: 0, applied: 0, discarded: 0, lastUsedAt: null };
  return { usageCount: u.count, appliedCount: u.applied, discardedCount: u.discarded, lastUsedAt: u.lastUsedAt };
}

export function recordTemplateRun(templateId: string, applied: boolean): void {
  const state = loadTemplateState();
  const now = new Date().toISOString();
  const u = state.usage[templateId] ?? { count: 0, applied: 0, discarded: 0, lastUsedAt: null };
  u.count += 1;
  if (applied) u.applied += 1; else u.discarded += 1;
  u.lastUsedAt = now;
  state.usage[templateId] = u;
  saveTemplateState(state);
}

export function getMergedTemplates(currentUserId: string): SimulationTemplateMeta[] {
  try {
    return getMergedTemplatesUnsafe(currentUserId);
  } catch {
    return [];
  }
}

const archivedSet = (): Set<string> => new Set(loadTemplateState().archivedTemplateIds);

function getMergedTemplatesUnsafe(currentUserId: string): SimulationTemplateMeta[] {
  const state = loadTemplateState();
  const now = new Date().toISOString();
  const archived = archivedSet();
  const runs = getTemplateRuns();
  const list: SimulationTemplateMeta[] = [];

  const starterIds = getStarterTemplateIds().filter((id) => !archived.has(id));
  starterIds.forEach((id) => {
    const usage = getTemplateUsage(id);
    const meta = getStarterTemplateMeta(id);
    const reversalCount = getReversalCountByTemplate(id);
    const frustratedDiscardCount = runs.filter(
      (r) => !r.applied && r.templateId === id && isFrustratedDiscard(r)
    ).length;
    const health = computeTemplateHealth(usage, reversalCount, frustratedDiscardCount, meta.usageCount);
    list.push({
      ...meta,
      usageCount: usage.usageCount,
      appliedCount: usage.appliedCount,
      discardedCount: usage.discardedCount,
      lastUsedAt: usage.lastUsedAt,
      createdAt: now,
      pinnedByUserIds: state.pinned[id] ?? [],
      reversalCount,
      frustratedDiscardCount,
      health,
    });
  });

  state.suggested.filter((t) => !t.dismissed && !archived.has(t.id)).forEach((t) => {
    const reversalCount = getReversalCountByTemplate(t.id);
    const frustratedDiscardCount = runs.filter(
      (r) => !r.applied && (r.templateId === t.id || (r.stepSignature === (t as { stepSignature?: string }).stepSignature)) && isFrustratedDiscard(r)
    ).length;
    const health = computeTemplateHealth(
      { usageCount: t.usageCount, appliedCount: t.appliedCount, discardedCount: t.discardedCount, lastUsedAt: t.lastUsedAt },
      reversalCount,
      frustratedDiscardCount,
      t.usageCount
    );
    list.push({
      ...t,
      pinnedByUserIds: state.pinned[t.id] ?? [],
      reversalCount,
      frustratedDiscardCount,
      health,
    });
  });

  state.personal.filter((t) => (t.ownerId === currentUserId || t.sharedWithTeam) && !archived.has(t.id)).forEach((t) => {
    const reversalCount = getReversalCountByTemplate(t.id);
    const frustratedDiscardCount = runs.filter(
      (r) => !r.applied && r.templateId === t.id && isFrustratedDiscard(r)
    ).length;
    const health = computeTemplateHealth(
      { usageCount: t.usageCount, appliedCount: t.appliedCount, discardedCount: t.discardedCount, lastUsedAt: t.lastUsedAt },
      reversalCount,
      frustratedDiscardCount,
      t.usageCount
    );
    list.push({
      ...t,
      pinnedByUserIds: state.pinned[t.id] ?? [],
      reversalCount,
      frustratedDiscardCount,
      health,
    });
  });

  return list;
}

type UsageLike = { usageCount: number; appliedCount: number; discardedCount: number; lastUsedAt: string | null };
function computeTemplateHealth(
  usage: UsageLike,
  reversalCount: number,
  frustratedDiscardCount: number,
  usageCount: number
): 'green' | 'amber' | 'red' {
  const applyRate = usageCount > 0 ? usage.appliedCount / usageCount : 1;
  const reversalRate = usage.appliedCount > 0 ? reversalCount / usage.appliedCount : 0;
  if (reversalCount >= 3 || (frustratedDiscardCount >= 3) || (reversalRate >= 0.5 && usage.appliedCount >= 2))
    return 'red';
  if (reversalCount >= 2 || frustratedDiscardCount >= 2 || reversalRate >= 0.25 || (applyRate < 0.5 && usageCount >= 3))
    return 'amber';
  return 'green';
}

/** Full health details for expandable panel (reversals, time to reversal, frustrated vs exploratory). */
export function getTemplateHealthDetails(templateId: string): {
  health: 'green' | 'amber' | 'red';
  applyCount: number;
  discardCount: number;
  reversalCount: number;
  avgTimeToReversalHours: number | null;
  frustratedDiscardCount: number;
  exploratoryDiscardCount: number;
  reversalRunIds: string[];
} {
  const runs = getTemplateRuns().filter((r) => r.templateId === templateId);
  const applied = runs.filter((r) => r.applied);
  const discarded = runs.filter((r) => !r.applied);
  const reversals = applied.filter((r) => r.reversedAt);
  const frustrated = discarded.filter((r) => isFrustratedDiscard(r));
  const exploratory = discarded.filter((r) => isExploratoryDiscard(r));
  const usage = getTemplateUsage(templateId);
  const health = computeTemplateHealth(
    usage,
    reversals.length,
    frustrated.length,
    usage.usageCount
  );
  const times = reversals.map((r) => getTimeToReversalHours(r)).filter((h): h is number => h != null);
  const avgTimeToReversalHours = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null;
  return {
    health,
    applyCount: usage.appliedCount,
    discardCount: usage.discardedCount,
    reversalCount: reversals.length,
    avgTimeToReversalHours,
    frustratedDiscardCount: frustrated.length,
    exploratoryDiscardCount: exploratory.length,
    reversalRunIds: reversals.map((r) => r.id),
  };
}

export function togglePinTemplate(templateId: string, userId: string): void {
  const state = loadTemplateState();
  const arr = state.pinned[templateId] ?? [];
  const idx = arr.indexOf(userId);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(userId);
  state.pinned[templateId] = arr;
  saveTemplateState(state);
}

export function isPinnedByUser(templateId: string, userId: string): boolean {
  const state = loadTemplateState();
  return (state.pinned[templateId] ?? []).includes(userId);
}

export function saveAsPersonalTemplate(params: {
  name: string;
  description: string;
  steps: SimulationStep[];
  ownerId: string;
  tags?: string[];
}): SimulationTemplateMeta {
  const state = loadTemplateState();
  const id = `personal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const template: SimulationTemplateMeta = {
    id,
    name: params.name,
    description: params.description,
    category: 'personal',
    tags: params.tags ?? [],
    estimatedSteps: params.steps.length,
    storedSteps: params.steps,
    usageCount: 0,
    appliedCount: 0,
    discardedCount: 0,
    lastUsedAt: null,
    createdAt: now,
    ownerId: params.ownerId,
    sharedWithTeam: false,
  };
  state.personal.push(template);
  saveTemplateState(state);
  return template;
}

export function dismissSuggestedTemplate(templateId: string): void {
  const state = loadTemplateState();
  const t = state.suggested.find((x) => x.id === templateId);
  if (t) t.dismissed = true;
  saveTemplateState(state);
}

export function getPersonalTemplateSteps(templateId: string): SimulationStep[] | null {
  const state = loadTemplateState();
  const t = state.personal.find((x) => x.id === templateId);
  return t?.storedSteps ?? null;
}

/** Get stored steps for personal or suggested template (for Run). */
export function getTemplateStoredSteps(templateId: string): SimulationStep[] | null {
  const state = loadTemplateState();
  const personal = state.personal.find((x) => x.id === templateId);
  if (personal?.storedSteps?.length) return personal.storedSteps;
  const suggested = state.suggested.find((x) => x.id === templateId);
  return suggested?.storedSteps ?? null;
}

// ---- Pattern learning: record runs and generate suggested templates ----

/** Discard classification: frustrated = high steps, long session, shared — indicates unresolved planning need */
export function isFrustratedDiscard(r: TemplateRunRecord): boolean {
  if (r.applied) return false;
  const stepCount = r.steps?.length ?? (Array.isArray(r.stepsSummary) ? (r.stepsSummary as unknown[]).length : 0);
  const longSession = (r.sessionDurationMinutes ?? 0) >= 10;
  const manySteps = stepCount >= 5;
  const shared = r.wasShared === true;
  return (manySteps && longSession) || (shared && stepCount >= 3);
}

/** Exploratory = low steps, short session, not shared — stress-testing, neutral signal */
export function isExploratoryDiscard(r: TemplateRunRecord): boolean {
  if (r.applied) return false;
  const stepCount = r.steps?.length ?? (Array.isArray(r.stepsSummary) ? (r.stepsSummary as unknown[]).length : 0);
  const shortSession = (r.sessionDurationMinutes ?? 999) < 5;
  const fewSteps = stepCount < 4;
  return fewSteps && (shortSession || !r.wasShared);
}

export function recordSimulationRun(params: {
  steps: SimulationStep[];
  applied: boolean;
  templateId?: string;
  sessionDurationMinutes?: number;
  wasShared?: boolean;
}): void {
  const signature = params.steps.map((s) => s.type).join(',');
  const record: TemplateRunRecord = {
    id: genId(),
    templateId: params.templateId,
    stepSignature: signature,
    stepsSummary: params.steps.map((s) => ({ type: s.type, label: s.label })),
    steps: params.steps,
    applied: params.applied,
    createdAt: new Date().toISOString(),
    sessionDurationMinutes: params.sessionDurationMinutes,
    wasShared: params.wasShared,
  };
  const runs = loadJson<TemplateRunRecord[]>(RUNS_STORAGE_KEY, []);
  runs.unshift(record);
  saveJson(RUNS_STORAGE_KEY, runs.slice(0, 500));

  if (params.templateId) recordTemplateRun(params.templateId, params.applied);

  if (!params.templateId) {
    try {
      refreshSuggestedTemplates(runs);
    } catch (e) {
      console.warn('Simulation template pattern refresh failed:', e);
    }
  }
}

/** Load all run records (for planning insights and reversal stats). */
export function getTemplateRuns(): TemplateRunRecord[] {
  return loadJson<TemplateRunRecord[]>(RUNS_STORAGE_KEY, []);
}

/** Mark an applied run as reversed (user undid the changes). */
export function recordReversal(runId: string): void {
  const runs = loadJson<TemplateRunRecord[]>(RUNS_STORAGE_KEY, []);
  const run = runs.find((r) => r.id === runId);
  if (run && run.applied && !run.reversedAt) {
    run.reversedAt = new Date().toISOString();
    saveJson(RUNS_STORAGE_KEY, runs);
  }
}

/** Recent applied runs (for "Mark as reversed" UI). */
export function getRecentAppliedRuns(limit = 20): TemplateRunRecord[] {
  const runs = getTemplateRuns();
  return runs.filter((r) => r.applied).slice(0, limit);
}

/** Reversals for a given template (or step-signature for ad-hoc). */
export function getReversalsForTemplate(templateId: string): TemplateRunRecord[] {
  const runs = getTemplateRuns();
  return runs.filter((r) => r.applied && r.reversedAt && (r.templateId === templateId || (templateId === '' && !r.templateId)));
}

export function getReversalCountByTemplate(templateId: string): number {
  const runs = getTemplateRuns();
  return runs.filter((r) => r.applied && r.reversedAt && r.templateId === templateId).length;
}

/** Time to reversal in hours (appliedAt -> reversedAt). */
export function getTimeToReversalHours(r: TemplateRunRecord): number | null {
  if (!r.reversedAt || !r.applied) return null;
  const applied = new Date(r.createdAt).getTime();
  const reversed = new Date(r.reversedAt).getTime();
  return (reversed - applied) / (60 * 60 * 1000);
}

/** Archive (retire) a template — hidden from library, restorable. */
export function archiveTemplate(templateId: string): void {
  const state = loadTemplateState();
  if (!state.archivedTemplateIds.includes(templateId)) {
    state.archivedTemplateIds.push(templateId);
    saveTemplateState(state);
  }
}

export function unarchiveTemplate(templateId: string): void {
  const state = loadTemplateState();
  state.archivedTemplateIds = state.archivedTemplateIds.filter((id) => id !== templateId);
  saveTemplateState(state);
}

export function isTemplateArchived(templateId: string): boolean {
  return loadTemplateState().archivedTemplateIds.includes(templateId);
}

/** Archived template metas for "Archived Templates" section (starters/personal/suggested by id). */
export function getArchivedTemplates(currentUserId: string): SimulationTemplateMeta[] {
  const state = loadTemplateState();
  const archivedIds = new Set(state.archivedTemplateIds);
  const list: SimulationTemplateMeta[] = [];
  getStarterTemplateIds().forEach((id) => {
    if (archivedIds.has(id)) {
      const usage = getTemplateUsage(id);
      const meta = getStarterTemplateMeta(id);
      list.push({
        ...meta,
        usageCount: usage.usageCount,
        appliedCount: usage.appliedCount,
        discardedCount: usage.discardedCount,
        lastUsedAt: usage.lastUsedAt,
        createdAt: new Date().toISOString(),
        pinnedByUserIds: state.pinned[id] ?? [],
      });
    }
  });
  state.personal.filter((t) => archivedIds.has(t.id)).forEach((t) => list.push({ ...t, pinnedByUserIds: state.pinned[t.id] ?? [] }));
  state.suggested.filter((t) => archivedIds.has(t.id)).forEach((t) => list.push({ ...t, pinnedByUserIds: state.pinned[t.id] ?? [] }));
  return list;
}

function refreshSuggestedTemplates(runs: TemplateRunRecord[]): void {
  const state = loadTemplateState();
  const dismissed = new Set(state.dismissedPatterns);
  const bySig = new Map<string, TemplateRunRecord[]>();
  runs.forEach((r) => {
    if (!r.stepSignature) return;
    const list = bySig.get(r.stepSignature) ?? [];
    list.push(r);
    bySig.set(r.stepSignature, list);
  });
  let existingStarterSigs = new Set<string>();
  try {
    existingStarterSigs = new Set(
      getStarterTemplateIds().map((id) => {
        const def = STARTER_DEFINITIONS[id];
        const steps = def?.buildSteps({ users: [], projects: [], allocations: [], phases: [], tasks: [], subtasks: [], timelogs: [], alerts: [] } as AppData, {}) ?? [];
        return Array.isArray(steps) ? steps.map((s) => s.type).join(',') : '';
      })
    );
  } catch {
    // ignore: use empty set so we don't block pattern suggestions
  }
  bySig.forEach((list, sig) => {
    if (list.length < 2 || existingStarterSigs.has(sig)) return;
    if (dismissed.has(sig)) return;
    const existing = state.suggested.find((t) => (t as { stepSignature?: string }).stepSignature === sig);
    if (existing) {
      existing.confidenceCount = list.length;
      existing.usageCount = list.length;
      const withSteps = list[0];
      if (withSteps?.steps?.length) existing.storedSteps = withSteps.steps;
      return;
    }
    const first = list[0];
    const steps = first?.steps;
    const name = first?.stepsSummary && Array.isArray(first.stepsSummary)
      ? (first.stepsSummary as { label?: string }[])[0]?.label?.slice(0, 40) ?? 'Custom pattern'
      : 'Custom pattern';
    const newTemplate: SimulationTemplateMeta & { stepSignature?: string } = {
      id: `suggested-${sig}-${Date.now()}`,
      name: `Suggested: ${name}`,
      description: `Generated from your patterns — based on ${list.length} similar simulation${list.length !== 1 ? 's' : ''}.`,
      category: 'suggested',
      tags: ['generated'],
      estimatedSteps: steps?.length ?? (Array.isArray(first?.stepsSummary) ? first.stepsSummary.length : 1),
      confidenceCount: list.length,
      usageCount: list.length,
      appliedCount: list.filter((r) => r.applied).length,
      discardedCount: list.filter((r) => !r.applied).length,
      lastUsedAt: list[0]?.createdAt ?? null,
      createdAt: new Date().toISOString(),
      dismissed: false,
      pinnedByUserIds: [],
      storedSteps: steps?.length ? steps : undefined,
      stepSignature: sig,
    };
    state.suggested.push(newTemplate);
  });
  saveTemplateState(state);
}

export function getEffectivenessScore(t: SimulationTemplateMeta): number {
  if (t.usageCount === 0) return 0;
  return Math.round((t.appliedCount / t.usageCount) * 100);
}
