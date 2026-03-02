/**
 * FTE (Full-Time Equivalent) calculation utilities.
 * Standard: 40 hours/week, 8 hours/day.
 * Handles task durations from hours to weeks.
 */

const HOURS_PER_WEEK = 40;
const HOURS_PER_DAY = 8;

/**
 * Get available working hours in a date range.
 * - Sub-day spans: use calendar hours (for short tasks/sprints)
 * - Day+ spans: use 40 hrs/week (8 hrs/day × 5/7)
 */
export function getAvailableHours(startDate: string, dueDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(dueDate).getTime();
  const spanMs = Math.max(0, end - start);
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  if (spanDays < 1 / 24) return 0.1; // avoid division by zero for same-day/short tasks
  if (spanDays < 1) return spanDays * 24; // sub-day: use calendar hours (e.g. 2hr span = 2 available)
  return spanDays * (HOURS_PER_WEEK / 7); // day+: 40/7 ≈ 5.7 hrs per calendar day
}

/**
 * Compute FTE % for a task: estimatedHours / available working hours in its span.
 * Can exceed 100% to indicate overallocation.
 */
export function computeTaskFtePercent(estimatedHours: number, startDate: string, dueDate: string): number {
  const available = getAvailableHours(startDate, dueDate);
  return Math.round((estimatedHours / available) * 100);
}

/**
 * Compute phase-level FTE %: total task hours / available hours across the phase span.
 * Phase span = earliest task start to latest task due.
 */
export function computePhaseFtePercent(
  tasks: { estimatedHours: number; startDate: string; dueDate: string }[]
): number {
  if (tasks.length === 0) return 0;
  const totalHours = tasks.reduce((s, t) => s + t.estimatedHours, 0);
  const minStart = tasks.reduce((a, t) => (t.startDate < a ? t.startDate : a), tasks[0].startDate);
  const maxDue = tasks.reduce((a, t) => (t.dueDate > a ? t.dueDate : a), tasks[0].dueDate);
  const available = getAvailableHours(minStart, maxDue);
  return Math.round((totalHours / available) * 100);
}
