/**
 * External bandwidth conflict detection, change log, and priority ranking.
 * When a change on one project affects a member's bandwidth, we re-evaluate
 * their commitments on other projects and surface conflicts.
 */

import type { AppData, Project, User } from './types';
import { logActivityEvent } from './notifications';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getCapacityConflict,
  getDefaultPeriodBounds,
  type ViewPeriod,
} from './bandwidth';

export type BandwidthChangeType =
  | 'member_added'
  | 'task_assigned'
  | 'capacity_raised'
  | 'calendar_changed'
  | 'phase_dates_changed'
  | 'task_dates_changed';

export interface BandwidthChangeLogEntry {
  id: string;
  userId: string;
  userName: string;
  changeType: BandwidthChangeType;
  sourceProjectId: string;
  sourceProjectName: string;
  previousTotalFte: number;
  newTotalFte: number;
  affectedProjectIds: string[];
  createdAt: string;
}

export interface ExternalConflictResult {
  userId: string;
  userName: string;
  sourceProjectId: string;
  sourceProjectName: string;
  changeType: BandwidthChangeType;
  previousTotalFte: number;
  newTotalFte: number;
  affectedProjects: { projectId: string; projectName: string; taskFte: number; capacity: number; overBy: number }[];
}

const VIEW_PERIOD: ViewPeriod = 'month';
const LOG_KEY_PREFIX = 'bandwidth:change-log:';
const MAX_LOG_ENTRIES_PER_USER = 50;

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getLogKey(userId: string): string {
  return `${LOG_KEY_PREFIX}${userId}`;
}

export function getBandwidthHistory(userId: string): BandwidthChangeLogEntry[] {
  try {
    const raw = localStorage.getItem(getLogKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BandwidthChangeLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendBandwidthLog(entry: BandwidthChangeLogEntry): void {
  const key = getLogKey(entry.userId);
  const list = getBandwidthHistory(entry.userId);
  list.unshift(entry);
  const trimmed = list.slice(0, MAX_LOG_ENTRIES_PER_USER);
  try {
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

/**
 * Returns true if this project was affected by an external bandwidth change for this user
 * (e.g. in the last 7 days there's a log entry listing this project in affectedProjectIds).
 */
export function wasProjectAffectedByExternalChange(userId: string, projectId: string): boolean {
  const history = getBandwidthHistory(userId);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return history.some(
    (e) =>
      new Date(e.createdAt).getTime() >= cutoff && e.affectedProjectIds.includes(projectId)
  );
}

/**
 * Find all projects (other than sourceProjectId) where this member has a capacity conflict
 * after the given data state. Pass sourceProjectId as '' for calendar/global changes.
 */
export function getExternalConflictsForMember(
  data: AppData,
  userId: string,
  sourceProjectId: string
): ExternalConflictResult | null {
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;

  const periodBounds = getDefaultPeriodBounds(VIEW_PERIOD);
  const newTotalFte = getMemberTotalPeakFte(
    data,
    user,
    VIEW_PERIOD,
    periodBounds.start,
    periodBounds.end
  );

  const sourceProject = sourceProjectId ? data.projects.find((p) => p.id === sourceProjectId) : undefined;
  const allocations = data.allocations.filter((a) => a.userId === userId);
  const affectedProjects: ExternalConflictResult['affectedProjects'] = [];

  for (const alloc of allocations) {
    if (sourceProjectId && alloc.projectId === sourceProjectId) continue;
    const proj = data.projects.find((p) => p.id === alloc.projectId);
    if (!proj || proj.status !== 'Active') continue;

    const taskFte = getMemberProjectFtePercent(
      data,
      user,
      alloc.projectId,
      VIEW_PERIOD,
      periodBounds.start,
      periodBounds.end
    );
    const conflict = getCapacityConflict(taskFte, alloc.ftePercent);
    if (conflict.status !== 'exceeds' || conflict.overBy == null) continue;

    affectedProjects.push({
      projectId: alloc.projectId,
      projectName: proj.name ?? 'Unknown',
      taskFte,
      capacity: alloc.ftePercent,
      overBy: conflict.overBy,
    });
  }

  if (affectedProjects.length === 0) return null;

  return {
    userId,
    userName: user.name,
    sourceProjectId: sourceProjectId || '_global',
    sourceProjectName: sourceProject?.name ?? (sourceProjectId ? 'Unknown' : 'Calendar / global'),
    changeType: 'member_added', // caller can override when building the toast
    previousTotalFte: newTotalFte, // we don't have previous; use new for display
    newTotalFte,
    affectedProjects,
  };
}

/**
 * Priority ranking for "resolve in this order": deadline proximity, client tier (simplified),
 * phase start imminence, member's task FTE % contribution.
 */
export function rankProjectsForConflictResolution(
  data: AppData,
  userId: string,
  projectIds: string[]
): string[] {
  const periodBounds = getDefaultPeriodBounds(VIEW_PERIOD);
  const user = data.users.find((u) => u.id === userId);
  if (!user) return projectIds;

  const now = Date.now();
  const projects = projectIds
    .map((id) => data.projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p && p.status === 'Active');

  const score = (p: Project): number => {
    const endMs = new Date(p.endDate + 'T23:59:59').getTime();
    const deadlineProximity = endMs - now;
    const phases = data.phases.filter((ph) => ph.projectId === p.id);
    const nextPhaseStart = phases
      .filter((ph) => ph.startDate)
      .map((ph) => new Date(ph.startDate!).getTime())
      .filter((t) => t >= now)
      .sort((a, b) => a - b)[0];
    const phaseImminence = nextPhaseStart != null ? nextPhaseStart - now : 0;
    const taskFte = getMemberProjectFtePercent(
      data,
      user,
      p.id,
      VIEW_PERIOD,
      periodBounds.start,
      periodBounds.end
    );
    const clientTier = p.priority === 'High' ? 3 : p.priority === 'Medium' ? 2 : 1;
    return (
      -Math.min(deadlineProximity, 0) * 0.001 +
      clientTier * 1000 +
      -phaseImminence * 0.0001 +
      taskFte * 10
    );
  };

  return [...projects]
    .sort((a, b) => score(b) - score(a))
    .map((p) => p.id);
}

/**
 * After a mutation that affects a member's bandwidth, check for external conflicts
 * on other projects, record in log, and optionally fire a toast.
 */
export function checkExternalConflictsAfterChange(
  data: AppData,
  opts: {
    userId: string;
    sourceProjectId: string;
    changeType: BandwidthChangeType;
    previousTotalFte?: number;
    onToast?: (result: ExternalConflictResult) => void;
  }
): ExternalConflictResult | null {
  const result = getExternalConflictsForMember(data, opts.userId, opts.sourceProjectId);
  if (!result) return null;

  result.changeType = opts.changeType;
  if (opts.previousTotalFte != null) result.previousTotalFte = opts.previousTotalFte;

  const entry: BandwidthChangeLogEntry = {
    id: genId(),
    userId: result.userId,
    userName: result.userName,
    changeType: result.changeType,
    sourceProjectId: result.sourceProjectId,
    sourceProjectName: result.sourceProjectName,
    previousTotalFte: result.previousTotalFte,
    newTotalFte: result.newTotalFte,
    affectedProjectIds: result.affectedProjects.map((a) => a.projectId),
    createdAt: nowIso(),
  };
  appendBandwidthLog(entry);

  opts.onToast?.(result);

  const firstAffected = result.affectedProjects[0];
  if (firstAffected) {
    logActivityEvent({
      userId: result.userId,
      projectId: firstAffected.projectId,
      type: 'bandwidth_alert',
      message: `${result.userName}'s bandwidth changed (${getChangeTypeLabel(result.changeType)} on ${result.sourceProjectName}) — conflict on: ${result.affectedProjects.map((a) => a.projectName).join(', ')}`,
    });
  }

  return result;
}

export function getChangeTypeLabel(changeType: BandwidthChangeType): string {
  switch (changeType) {
    case 'member_added':
      return 'Added to project';
    case 'task_assigned':
      return 'Task assigned';
    case 'capacity_raised':
      return 'Capacity raised';
    case 'calendar_changed':
      return 'Calendar changed';
    case 'phase_dates_changed':
      return 'Phase dates changed';
    case 'task_dates_changed':
      return 'Task dates changed';
    default:
      return 'Bandwidth change';
  }
}
