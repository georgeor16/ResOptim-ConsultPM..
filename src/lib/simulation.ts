/**
 * What-If Simulation: step types and apply logic.
 * Simulated data = replay steps on a deep clone of live data.
 */

import type { AppData, Allocation, Task, User, CalendarProfile } from './types';
import { getCapacityConflict } from './bandwidth';
import { getMemberTotalPeakFte, getMemberProjectFtePercent, getDefaultPeriodBounds } from './bandwidth';

const VIEW_PERIOD = 'month' as const;

export type SimulationStepType =
  | 'add_allocation'
  | 'remove_allocation'
  | 'update_allocation_capacity'
  | 'reassign_task'
  | 'add_task'
  | 'update_task'
  | 'update_user_calendar';

export interface SimulationStepBase {
  id: string;
  type: SimulationStepType;
  label: string;
}

export interface StepAddAllocation extends SimulationStepBase {
  type: 'add_allocation';
  allocation: Allocation;
}

export interface StepRemoveAllocation extends SimulationStepBase {
  type: 'remove_allocation';
  allocationId: string;
  projectId: string;
  userId: string;
}

export interface StepUpdateAllocationCapacity extends SimulationStepBase {
  type: 'update_allocation_capacity';
  allocationId: string;
  ftePercent: number;
}

export interface StepReassignTask extends SimulationStepBase {
  type: 'reassign_task';
  taskId: string;
  fromUserId: string;
  toUserId: string;
}

export interface StepAddTask extends SimulationStepBase {
  type: 'add_task';
  task: Task;
}

export interface StepUpdateTask extends SimulationStepBase {
  type: 'update_task';
  taskId: string;
  patch: Partial<Pick<Task, 'assigneeIds' | 'durationValue' | 'durationUnit' | 'startDate' | 'dueDate' | 'estimatedHours'>>;
}

export interface StepUpdateUserCalendar extends SimulationStepBase {
  type: 'update_user_calendar';
  userId: string;
  calendar: CalendarProfile;
}

export type SimulationStep =
  | StepAddAllocation
  | StepRemoveAllocation
  | StepUpdateAllocationCapacity
  | StepReassignTask
  | StepAddTask
  | StepUpdateTask
  | StepUpdateUserCalendar;

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function cloneAppData(data: AppData): AppData {
  return deepClone(data);
}

/** Mutates `data` in place. Use for replaySteps to avoid N deep clones. */
function applyStepInPlace(data: AppData, step: SimulationStep): void {
  switch (step.type) {
    case 'add_allocation': {
      if (!data.allocations.some((a) => a.id === step.allocation.id)) {
        data.allocations.push(deepClone(step.allocation));
      }
      break;
    }
    case 'remove_allocation': {
      data.allocations = data.allocations.filter((a) => a.id !== step.allocationId);
      break;
    }
    case 'update_allocation_capacity': {
      const alloc = data.allocations.find((a) => a.id === step.allocationId);
      if (alloc) {
        alloc.ftePercent = step.ftePercent;
        alloc.agreedMonthlyHours = Math.round((173 * step.ftePercent) / 100);
      }
      break;
    }
    case 'reassign_task': {
      const task = data.tasks.find((t) => t.id === step.taskId);
      if (task && task.assigneeIds) {
        task.assigneeIds = task.assigneeIds.filter((id) => id !== step.fromUserId);
        if (!task.assigneeIds.includes(step.toUserId)) {
          task.assigneeIds = [...task.assigneeIds, step.toUserId];
        }
      }
      break;
    }
    case 'add_task': {
      if (!data.tasks.some((t) => t.id === step.task.id)) {
        data.tasks.push(deepClone(step.task));
      }
      break;
    }
    case 'update_task': {
      const t = data.tasks.find((x) => x.id === step.taskId);
      if (t) {
        if (step.patch.assigneeIds != null) t.assigneeIds = step.patch.assigneeIds;
        if (step.patch.durationValue != null) t.durationValue = step.patch.durationValue;
        if (step.patch.durationUnit != null) t.durationUnit = step.patch.durationUnit;
        if (step.patch.startDate != null) t.startDate = step.patch.startDate;
        if (step.patch.dueDate != null) t.dueDate = step.patch.dueDate;
        if (step.patch.estimatedHours != null) t.estimatedHours = step.patch.estimatedHours;
      }
      break;
    }
    case 'update_user_calendar': {
      const u = data.users.find((x) => x.id === step.userId);
      if (u) {
        u.calendar = deepClone(step.calendar);
      }
      break;
    }
    default:
      break;
  }
}

export function applyStep(data: AppData, step: SimulationStep): AppData {
  const next = cloneAppData(data);
  applyStepInPlace(next, step);
  return next;
}

export function replaySteps(data: AppData, steps: SimulationStep[]): AppData {
  const result = cloneAppData(data);
  steps.forEach((step) => applyStepInPlace(result, step));
  return result;
}

/** Conflict key: "userId:projectId" where task FTE > capacity */
function getConflictKeys(data: AppData): Set<string> {
  const periodBounds = getDefaultPeriodBounds(VIEW_PERIOD);
  const keys = new Set<string>();
  const activeProjects = data.projects.filter((p) => p.status === 'Active');
  for (const alloc of data.allocations.filter((a) => activeProjects.some((p) => p.id === a.projectId))) {
    const user = data.users.find((u) => u.id === alloc.userId);
    if (!user) continue;
    const taskFte = getMemberProjectFtePercent(
      data,
      user,
      alloc.projectId,
      VIEW_PERIOD,
      periodBounds.start,
      periodBounds.end
    );
    const conflict = getCapacityConflict(taskFte, alloc.ftePercent);
    if (conflict.status === 'exceeds') keys.add(`${alloc.userId}:${alloc.projectId}`);
  }
  return keys;
}

export interface SimulationDeltaSummary {
  newConflicts: number;
  resolvedConflicts: number;
  affectedMemberIds: Set<string>;
  affectedProjectIds: Set<string>;
}

export function computeSimulationDelta(current: AppData, simulated: AppData): SimulationDeltaSummary {
  const currentConflicts = getConflictKeys(current);
  const simulatedConflicts = getConflictKeys(simulated);
  const newConflicts = [...simulatedConflicts].filter((k) => !currentConflicts.has(k)).length;
  const resolvedConflicts = [...currentConflicts].filter((k) => !simulatedConflicts.has(k)).length;

  const affectedMemberIds = new Set<string>();
  const affectedProjectIds = new Set<string>();

  const currAllocKeys = new Set(current.allocations.map((a) => `${a.userId}:${a.projectId}:${a.ftePercent}`));
  const simAllocKeys = new Set(simulated.allocations.map((a) => `${a.userId}:${a.projectId}:${a.ftePercent}`));
  for (const a of current.allocations) {
    const simKey = `${a.userId}:${a.projectId}:${simulated.allocations.find((x) => x.id === a.id)?.ftePercent ?? a.ftePercent}`;
    if (!simAllocKeys.has(simKey) || current.allocations.length !== simulated.allocations.length) {
      affectedMemberIds.add(a.userId);
      affectedProjectIds.add(a.projectId);
    }
  }
  for (const a of simulated.allocations) {
    affectedMemberIds.add(a.userId);
    affectedProjectIds.add(a.projectId);
  }

  const currTaskKeys = new Set(
    current.tasks.map((t) => `${t.id}:${(t.assigneeIds ?? []).join(',')}:${t.startDate}:${t.dueDate}`)
  );
  for (const t of simulated.tasks) {
    const simKey = `${t.id}:${(t.assigneeIds ?? []).join(',')}:${t.startDate}:${t.dueDate}`;
    if (!currTaskKeys.has(simKey)) {
      (t.assigneeIds ?? []).forEach((id) => affectedMemberIds.add(id));
      affectedProjectIds.add(t.projectId);
    }
  }

  return {
    newConflicts,
    resolvedConflicts,
    affectedMemberIds,
    affectedProjectIds,
  };
}

export function genStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Saved simulation snapshots (30-day retention) ----
const SAVED_SIMULATIONS_KEY = 'consultpm_saved_simulations';
const RETENTION_DAYS = 30;

export interface SavedSimulationSnapshot {
  id: string;
  name?: string;
  steps: SimulationStep[];
  summary: string;
  applied: boolean;
  createdAt: string; // ISO
}

export function getSavedSimulations(): SavedSimulationSnapshot[] {
  try {
    const raw = localStorage.getItem(SAVED_SIMULATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSimulationSnapshot[];
    const cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    const filtered = (Array.isArray(parsed) ? parsed : []).filter(
      (s) => new Date(s.createdAt) >= cut
    );
    if (filtered.length !== parsed.length) {
      localStorage.setItem(SAVED_SIMULATIONS_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

export function saveSimulationSnapshot(snapshot: Omit<SavedSimulationSnapshot, 'id' | 'createdAt'>): void {
  const list = getSavedSimulations();
  const entry: SavedSimulationSnapshot = {
    ...snapshot,
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  list.unshift(entry);
  // Keep last 50
  const trimmed = list.slice(0, 50);
  localStorage.setItem(SAVED_SIMULATIONS_KEY, JSON.stringify(trimmed));
}
