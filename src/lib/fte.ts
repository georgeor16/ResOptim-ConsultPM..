import type { AppData, AllocationContributionMode, Task } from './types';

/**
 * FTE (Full-Time Equivalent) calculation utilities.
 * Standard: 40 hours/week, 8 hours/day.
 * Handles task durations from hours to weeks.
 */

const HOURS_PER_WEEK = 40;
const HOURS_PER_DAY = 8;
/** Approx working hours per month (40h/week × 4.33 weeks). */
export const HOURS_PER_MONTH = 40 * (52 / 12);

/**
 * Legacy helper for date-based availability. Still used by some helpers, but
 * task-level FTE is now computed against a monthly capacity baseline instead.
 *
 * Get available working hours in a date range.
 * - Sub-day spans: use calendar hours (for short tasks/sprints)
 * - Day+ spans: use 40 hrs/week (8 hrs/day × 5/7)
 */
export function getAvailableHours(startDate: string, dueDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(dueDate).getTime();
  const spanMs = Math.max(0, end - start);
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  // Same-day / ultra-short tasks: treat as a full working day so FTE stays realistic.
  if (spanDays < 1 / 24) return HOURS_PER_DAY;
  if (spanDays < 1) return spanDays * 24; // sub-day: use calendar hours (e.g. 2hr span = 2 available)
  return spanDays * (HOURS_PER_WEEK / 7); // day+: 40/7 ≈ 5.7 hrs per calendar day
}

/**
 * Compute FTE % for a task against a monthly capacity baseline.
 *
 * This ignores the exact date span and instead normalises effort to
 * HOURS_PER_MONTH, so e.g. 80h ≈ 50% FTE, 160h ≈ 100% FTE.
 */
export function computeTaskFtePercent(estimatedHours: number, startDate: string, dueDate: string): number {
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) return 0;
  const available = HOURS_PER_MONTH;
  return Math.round((estimatedHours / available) * 100);
}

/**
 * Compute phase-level FTE % as the sum of task-level FTE % values in that phase.
 * This effectively makes the phase FTE act as the aggregate of all tasks' FTE demand.
 */
export function computePhaseFtePercent(
  tasks: { estimatedHours: number; startDate: string; dueDate: string }[]
): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce(
    (sum, t) => sum + computeTaskFtePercent(t.estimatedHours, t.startDate, t.dueDate),
    0,
  );
  return Math.round(total);
}

/**
 * Given phases with a duration (in months) and planned FTE %, compute an overall
 * project-level FTE demand as a duration-weighted average of phase FTEs.
 */
export function computeProjectFteFromPhases(
  phases: { durationMonths: number; ftePercent: number }[]
): number {
  if (!phases.length) return 0;
  const weighted = phases.reduce(
    (acc, p) => {
      const d = Math.max(0, p.durationMonths || 0);
      return {
        wSum: acc.wSum + d * (p.ftePercent || 0),
        dSum: acc.dSum + d,
      };
    },
    { wSum: 0, dSum: 0 }
  );
  if (weighted.dSum === 0) return 0;
  return Math.round(weighted.wSum / weighted.dSum);
}

// --- Utilization helpers ---

/**
 * Rough per-user utilization across all projects, based on allocation FTE %.
 * Returns a map of userId -> utilization percent (can exceed 100 if overloaded).
 * The `basis` argument is reserved for future extensions; currently it does not
 * change the calculation (all values are treated as generic FTE %).
 */
export function computeUserUtilization(
  data: AppData,
  basis: 'week' | 'month' | 'quarter' | 'year' = 'month'
): Record<string, number> {
  const byUser: Record<string, number> = {};
  for (const alloc of data.allocations) {
    const current = byUser[alloc.userId] ?? 0;
    byUser[alloc.userId] = current + (alloc.ftePercent || 0);
  }
  return byUser;
}

/** Remaining free capacity for a user, in percent (0-100). */
export function getUserFreeCapacity(utilizationPercent: number): number {
  const used = Number.isFinite(utilizationPercent) ? utilizationPercent : 0;
  return Math.max(0, 100 - used);
}

/** Bandwidth status for UI warnings (informational only). */
export type BandwidthStatus = 'available' | 'approaching' | 'full' | 'overallocated';

export function getBandwidthStatus(totalFtePercent: number): BandwidthStatus {
  if (!Number.isFinite(totalFtePercent) || totalFtePercent < 75) return 'available';
  if (totalFtePercent < 100) return 'approaching';
  if (totalFtePercent <= 100) return 'full';
  return 'overallocated';
}

export function getBandwidthTooltip(totalFtePercent: number): string {
  const status = getBandwidthStatus(totalFtePercent);
  switch (status) {
    case 'approaching':
      return 'Approaching full capacity';
    case 'full':
      return 'At full capacity — no remaining bandwidth';
    case 'overallocated': {
      const over = Math.round(totalFtePercent - 100);
      return `Overallocated — exceeds available bandwidth by ${over}%`;
    }
    default:
      return '';
  }
}

/**
 * Task effort as FTE % of a month (estimatedHours / HOURS_PER_MONTH × 100).
 * Used when reassigning a task to adjust allocations.
 */
export function taskEffortFtePercent(estimatedHours: number): number {
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) return 0;
  return Math.round((estimatedHours / HOURS_PER_MONTH) * 100);
}

/**
 * Derive an allocation FTE % from:
 * - overall project FTE demand,
 * - the user's current utilization,
 * - and the chosen contribution mode.
 *
 * full  => use all remaining free capacity (up to project demand)
 * part  => use half of remaining free capacity (up to project demand)
 * custom => keep the caller-provided FTE %, only clamped to [0, 100]
 */
export function deriveAllocationFteFromMode(opts: {
  projectFteDemand: number;
  userUtilizationPercent: number;
  mode: AllocationContributionMode;
  currentFtePercent?: number;
}): number {
  const { projectFteDemand, userUtilizationPercent, mode, currentFtePercent = 0 } = opts;

  const demand = Math.max(0, projectFteDemand || 0);
  const free = getUserFreeCapacity(userUtilizationPercent);

  let raw: number;
  if (mode === 'custom') {
    raw = currentFtePercent;
  } else if (mode === 'part') {
    raw = Math.min(free / 2, demand || free / 2);
  } else {
    // 'full'
    raw = Math.min(free, demand || free);
  }

  if (!Number.isFinite(raw)) raw = 0;
  if (raw < 0) raw = 0;
  if (raw > 100) raw = 100;

  // Keep integer percentages for consistency with other FTE helpers
  return Math.round(raw);
}
