/**
 * Task-derived FTE and bandwidth with time-bucketing, parallel timeline handling,
 * and calendar-aware available hours. Single source of truth: task durations.
 */

import type { AppData, Task, User } from './types';
import { getTaskDurationHours } from './duration';
import { getAvailableHoursForMember, getMemberCalendar } from './calendar';
import { getBandwidthStatus, type BandwidthStatus } from './fte';

export type ViewPeriod = 'week' | 'month' | 'quarter' | 'halfyear' | 'year';

/** Slot in the view period for time-bucketed calc. */
export interface TimeSlot {
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Break a range into slots by view period. */
export function getSlotsForPeriod(viewPeriod: ViewPeriod, periodStart: string, periodEnd: string): TimeSlot[] {
  if (!periodStart || !periodEnd) return [];
  const start = new Date(periodStart + 'T00:00:00').getTime();
  const end = new Date(periodEnd + 'T23:59:59').getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const slots: TimeSlot[] = [];

  if (viewPeriod === 'week') {
    let t = start;
    while (t <= end) {
      const d = new Date(t);
      const weekEnd = new Date(d);
      weekEnd.setDate(d.getDate() + 6);
      const slotEnd = weekEnd.getTime() > end ? new Date(end) : weekEnd;
      slots.push({
        label: `W${Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (7 * DAY_MS))}`,
        start: dateStr(d),
        end: dateStr(slotEnd),
      });
      t = slotEnd.getTime() + DAY_MS;
    }
  } else if (viewPeriod === 'month') {
    const d = new Date(start);
    d.setDate(1);
    while (d.getTime() <= end) {
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const slotEndMs = Math.min(monthEnd.getTime(), end);
      slots.push({
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        start: dateStr(d),
        end: dateStr(new Date(slotEndMs)),
      });
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
    }
  } else if (viewPeriod === 'quarter') {
    const d = new Date(start);
    d.setMonth(Math.floor(d.getMonth() / 3) * 3);
    d.setDate(1);
    while (d.getTime() <= end) {
      const qEnd = new Date(d.getFullYear(), d.getMonth() + 3, 0);
      const slotEndMs = Math.min(qEnd.getTime(), end);
      slots.push({
        label: `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`,
        start: dateStr(d),
        end: dateStr(new Date(slotEndMs)),
      });
      d.setMonth(d.getMonth() + 3);
      d.setDate(1);
    }
  } else if (viewPeriod === 'halfyear') {
    const d = new Date(start);
    d.setMonth(Math.floor(d.getMonth() / 6) * 6);
    d.setDate(1);
    while (d.getTime() <= end) {
      const hEnd = new Date(d.getFullYear(), d.getMonth() + 6, 0);
      const slotEndMs = Math.min(hEnd.getTime(), end);
      slots.push({
        label: `H${Math.floor(d.getMonth() / 6) + 1} ${d.getFullYear()}`,
        start: dateStr(d),
        end: dateStr(new Date(slotEndMs)),
      });
      d.setMonth(d.getMonth() + 6);
      d.setDate(1);
    }
  } else {
    // year
    const d = new Date(start);
    d.setMonth(0);
    d.setDate(1);
    while (d.getTime() <= end) {
      const yEnd = new Date(d.getFullYear(), 11, 31);
      const slotEndMs = Math.min(yEnd.getTime(), end);
      slots.push({
        label: String(d.getFullYear()),
        start: dateStr(d),
        end: dateStr(new Date(slotEndMs)),
      });
      d.setFullYear(d.getFullYear() + 1);
    }
  }
  return slots;
}

/** Get member's share of task (0–1). Equal split if no assigneeSplit. */
export function getMemberTaskShare(task: Task, userId: string): number {
  const ids = task.assigneeIds ?? [];
  if (ids.length === 0) return 0;
  if (task.assigneeSplit && typeof task.assigneeSplit[userId] === 'number') {
    return Math.max(0, Math.min(1, task.assigneeSplit[userId] / 100));
  }
  return 1 / ids.length;
}

/** Overlap in days between [s1,e1] and [s2,e2] (inclusive). */
function overlapDays(s1: string, e1: string, s2: string, e2: string): number {
  const start = Math.max(new Date(s1 + 'T00:00:00').getTime(), new Date(s2 + 'T00:00:00').getTime());
  const end = Math.min(new Date(e1 + 'T23:59:59').getTime(), new Date(e2 + 'T23:59:59').getTime());
  if (end < start) return 0;
  return Math.ceil((end - start) / DAY_MS) + 1;
}

/** Task total span in days (inclusive). */
function taskSpanDays(task: Task): number {
  const start = new Date(task.startDate + 'T00:00:00').getTime();
  const end = new Date(task.dueDate + 'T23:59:59').getTime();
  return Math.max(1, Math.ceil((end - start) / DAY_MS) + 1);
}

/** Committed hours for a member in a slot from a single task (proportional to overlap). */
function taskHoursInSlot(task: Task, userId: string, slotStart: string, slotEnd: string): number {
  const share = getMemberTaskShare(task, userId);
  const totalHours = getTaskDurationHours(task);
  const taskDays = taskSpanDays(task);
  const overlap = overlapDays(task.startDate, task.dueDate, slotStart, slotEnd);
  if (overlap <= 0) return 0;
  const fraction = Math.min(1, overlap / taskDays);
  return totalHours * fraction * share;
}

/** Only tasks that count toward FTE (exclude completed/Done). */
function activeTasksForMember(data: AppData, userId: string, projectId?: string): Task[] {
  return (data.tasks ?? []).filter(
    t =>
      (t.assigneeIds ?? []).includes(userId) &&
      (!projectId || t.projectId === projectId) &&
      t.status !== 'Done'
  );
}

/** Committed hours for member in slot across all their tasks (all projects). Completed tasks excluded. */
function memberCommittedHoursInSlot(
  data: AppData,
  userId: string,
  slotStart: string,
  slotEnd: string,
  projectId?: string
): number {
  const tasks = activeTasksForMember(data, userId, projectId);
  let total = 0;
  for (const task of tasks) {
    total += taskHoursInSlot(task, userId, slotStart, slotEnd);
  }
  return total;
}

export interface SlotFte {
  slot: TimeSlot;
  committedHours: number;
  availableHours: number;
  ftePercent: number;
}

/**
 * FTE % per slot for a member in a period (calendar-aware).
 * projectId optional: restrict to one project.
 */
export function getMemberSlotFtes(
  data: AppData,
  user: User,
  viewPeriod: ViewPeriod,
  periodStart: string,
  periodEnd: string,
  projectId?: string
): SlotFte[] {
  const profile = getMemberCalendar(user);
  const slots = getSlotsForPeriod(viewPeriod, periodStart, periodEnd);
  return slots.map(slot => {
    const committed = memberCommittedHoursInSlot(data, user.id, slot.start, slot.end, projectId);
    const available = getAvailableHoursForMember(profile, slot.start, slot.end);
    const ftePercent = available > 0 ? (committed / available) * 100 : 0;
    return { slot, committedHours: committed, availableHours: available, ftePercent };
  });
}

/** Peak FTE % for member in period (primary indicator). */
export function getMemberPeakFte(
  data: AppData,
  user: User,
  viewPeriod: ViewPeriod,
  periodStart: string,
  periodEnd: string,
  projectId?: string
): { peakFte: number; peakSlot: TimeSlot | null } {
  const slotFtes = getMemberSlotFtes(data, user, viewPeriod, periodStart, periodEnd, projectId);
  let peak = 0;
  let peakSlot: TimeSlot | null = null;
  for (const s of slotFtes) {
    if (s.ftePercent > peak) {
      peak = s.ftePercent;
      peakSlot = s.slot;
    }
  }
  return { peakFte: peak, peakSlot };
}

/** Total committed hours for member in period (all projects or one project). Completed tasks excluded. */
export function getMemberCommittedHours(
  data: AppData,
  userId: string,
  periodStart: string,
  periodEnd: string,
  projectId?: string
): number {
  const tasks = activeTasksForMember(data, userId, projectId);
  let total = 0;
  for (const task of tasks) {
    const totalHours = getTaskDurationHours(task);
    const share = getMemberTaskShare(task, userId);
    const taskStart = new Date(task.startDate).getTime();
    const taskEnd = new Date(task.dueDate).getTime();
    const periodStartMs = new Date(periodStart + 'T00:00:00').getTime();
    const periodEndMs = new Date(periodEnd + 'T23:59:59').getTime();
    const overlap = Math.max(0, Math.min(taskEnd, periodEndMs) - Math.max(taskStart, periodStartMs));
    const taskSpan = taskEnd - taskStart || 1;
    const fraction = overlap / taskSpan;
    total += totalHours * fraction * share;
  }
  return total;
}

/** Project-level FTE % for member (peak in period for that project). */
export function getMemberProjectFtePercent(
  data: AppData,
  user: User,
  projectId: string,
  viewPeriod: ViewPeriod,
  periodStart: string,
  periodEnd: string
): number {
  const { peakFte } = getMemberPeakFte(data, user, viewPeriod, periodStart, periodEnd, projectId);
  return peakFte;
}

/** Total (all projects) peak FTE % for member in period — primary bandwidth indicator. */
export function getMemberTotalPeakFte(
  data: AppData,
  user: User,
  viewPeriod: ViewPeriod,
  periodStart: string,
  periodEnd: string
): number {
  const { peakFte } = getMemberPeakFte(data, user, viewPeriod, periodStart, periodEnd);
  return peakFte;
}

export interface ConcurrencyWarning {
  slotLabel: string;
  ftePercent: number;
  taskNames: string[];
  status: BandwidthStatus;
}

/** Slots where member exceeds threshold, for concurrency warning. */
export function getConcurrencyWarnings(
  data: AppData,
  user: User,
  viewPeriod: ViewPeriod,
  periodStart: string,
  periodEnd: string,
  threshold: number = 75
): ConcurrencyWarning[] {
  const slotFtes = getMemberSlotFtes(data, user, viewPeriod, periodStart, periodEnd);
  const warnings: ConcurrencyWarning[] = [];
  for (const { slot, ftePercent } of slotFtes) {
    if (ftePercent < threshold) continue;
    const tasks = activeTasksForMember(data, user.id).filter(
      t => overlapDays(t.startDate, t.dueDate, slot.start, slot.end) > 0
    );
    const taskNames = tasks.map(t => t.title);
    warnings.push({
      slotLabel: slot.label,
      ftePercent,
      taskNames,
      status: getBandwidthStatus(ftePercent),
    });
  }
  return warnings;
}

/** Available hours for member in full period (for "remaining" display). */
export function getMemberAvailableHoursInPeriod(
  user: User,
  periodStart: string,
  periodEnd: string
): number {
  const profile = getMemberCalendar(user);
  return getAvailableHoursForMember(profile, periodStart, periodEnd);
}

/** Get period bounds from view (e.g. current month, current quarter). */
export function getDefaultPeriodBounds(viewPeriod: ViewPeriod): { start: string; end: string } {
  const now = new Date();
  let start: Date;
  let end: Date;
  if (viewPeriod === 'week') {
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    start = mon;
    end = new Date(mon);
    end.setDate(mon.getDate() + 6);
  } else if (viewPeriod === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (viewPeriod === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    start = new Date(now.getFullYear(), (q - 1) * 3, 1);
    end = new Date(now.getFullYear(), q * 3, 0);
  } else if (viewPeriod === 'halfyear') {
    const h = Math.floor(now.getMonth() / 6) + 1;
    start = new Date(now.getFullYear(), (h - 1) * 6, 1);
    end = new Date(now.getFullYear(), h * 6 - 1, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  return { start: dateStr(start), end: dateStr(end) };
}
