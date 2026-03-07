/**
 * Scheduled pause for Quick alerts — time windows, recurring days, one-off pauses.
 * Used to automatically suspend/resume external notification delivery.
 */

const STORAGE_PREFIX = 'notif:scheduledPauses:';
const ONEOFF_PREFIX = 'notif:oneOffPause:';
const MAX_SCHEDULES = 5;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun, 1 = Mon, ... 6 = Sat

export interface ScheduledPause {
  id: string;
  /** "HH:mm" (24h) — start of pause window */
  fromTime: string;
  /** "HH:mm" (24h) — end of pause window (can be next day if until < from) */
  untilTime: string;
  /** Days when this schedule applies */
  days: DayOfWeek[];
  /** Optional end date — "YYYY-MM-DD"; if missing, repeats indefinitely */
  endDate?: string;
  /** When true, Critical alerts are also suppressed during this window */
  suppressCritical: boolean;
}

export interface OneOffPause {
  /** ISO timestamp when the pause ends */
  endsAt: string;
}

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function getOneOffKey(userId: string): string {
  return `${ONEOFF_PREFIX}${userId}`;
}

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

export function loadScheduledPauses(userId: string): ScheduledPause[] {
  const list = loadJson<ScheduledPause[]>(getStorageKey(userId), []);
  return Array.isArray(list) ? list : [];
}

export function saveScheduledPauses(userId: string, schedules: ScheduledPause[]): void {
  saveJson(getStorageKey(userId), schedules.slice(0, MAX_SCHEDULES));
}

export function loadOneOffPause(userId: string): OneOffPause | null {
  const one = loadJson<OneOffPause | null>(getOneOffKey(userId), null);
  if (!one || !one.endsAt) return null;
  if (new Date(one.endsAt).getTime() <= Date.now()) {
    saveOneOffPause(userId, null);
    return null;
  }
  return one;
}

export function saveOneOffPause(userId: string, pause: OneOffPause | null): void {
  saveJson(getOneOffKey(userId), pause);
}

/** Parse "HH:mm" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Check if current time (or given date) falls inside a schedule's window on a given day */
function isInWindow(schedule: ScheduledPause, day: DayOfWeek, minutesSinceMidnight: number): boolean {
  if (!schedule.days.includes(day)) return false;
  const fromM = timeToMinutes(schedule.fromTime);
  const untilM = timeToMinutes(schedule.untilTime);
  if (fromM <= untilM) {
    return minutesSinceMidnight >= fromM && minutesSinceMidnight < untilM;
  }
  return minutesSinceMidnight >= fromM || minutesSinceMidnight < untilM;
}

/** Check if schedule is still valid (before endDate if set) */
function scheduleActiveOnDate(schedule: ScheduledPause, date: Date): boolean {
  if (!schedule.endDate) return true;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  return today <= schedule.endDate;
}

/**
 * Returns true if the user is currently inside any active scheduled pause window.
 * If suppressCritical is needed, use getActiveScheduledPause instead.
 */
export function isInScheduledPauseWindow(userId: string, now: Date = new Date()): boolean {
  const schedules = loadScheduledPauses(userId);
  const day = now.getDay() as DayOfWeek;
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const minutesSinceMidnight = hours * 60 + minutes;

  for (const s of schedules) {
    if (!scheduleActiveOnDate(s, now)) continue;
    if (isInWindow(s, day, minutesSinceMidnight)) return true;
  }
  return false;
}

/**
 * Returns the currently active schedule if any (for banner text and Critical override).
 */
export function getActiveScheduledPause(
  userId: string,
  now: Date = new Date()
): ScheduledPause | null {
  const schedules = loadScheduledPauses(userId);
  const day = now.getDay() as DayOfWeek;
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

  for (const s of schedules) {
    if (!scheduleActiveOnDate(s, now)) continue;
    if (isInWindow(s, day, minutesSinceMidnight)) return s;
  }
  return null;
}

export function isOneOffPauseActive(userId: string): boolean {
  const one = loadOneOffPause(userId);
  return one !== null;
}

/** Minutes remaining for one-off pause; 0 if none or expired */
export function getOneOffPauseRemainingMinutes(userId: string): number {
  const one = loadOneOffPause(userId);
  if (!one) return 0;
  const end = new Date(one.endsAt).getTime();
  const now = Date.now();
  if (end <= now) return 0;
  return Math.ceil((end - now) / 60000);
}

/**
 * Should external delivery be paused for this user at this moment?
 * Considers scheduled window + one-off. Critical is allowed through unless schedule has suppressCritical.
 */
export function shouldPauseExternalDelivery(
  userId: string,
  priority: 'critical' | 'attention' | 'info'
): boolean {
  const oneOff = loadOneOffPause(userId);
  if (oneOff) {
    if (priority === 'critical') return false;
    return true;
  }
  const active = getActiveScheduledPause(userId);
  if (!active) return false;
  if (priority === 'critical' && !active.suppressCritical) return false;
  return true;
}

/** Format time "HH:mm" to display e.g. "6:00 PM" */
export function formatTimeForDisplay(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const hour = h ?? 0;
  const min = m ?? 0;
  if (hour === 0 && min === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:${String(min).padStart(2, '0')} AM`;
  if (hour === 12) return `12:${String(min).padStart(2, '0')} PM`;
  return `${hour - 12}:${String(min).padStart(2, '0')} PM`;
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa',
};

export function formatDaysForDisplay(days: DayOfWeek[]): string {
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const str = sorted.map(d => DAY_LABELS[d]).join('–');
  return str;
}

export const DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAYS: DayOfWeek[] = [1, 2, 3, 4, 5];
export const WEEKENDS: DayOfWeek[] = [0, 6];

export function genScheduleId(): string {
  return crypto.randomUUID();
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return !(aEnd <= bStart || bEnd <= aStart);
}

/** Check if two schedules have overlapping windows on any shared day */
export function schedulesOverlap(a: ScheduledPause, b: ScheduledPause): boolean {
  const sharedDays = a.days.filter(d => b.days.includes(d));
  if (sharedDays.length === 0) return false;
  const fromA = timeToMinutes(a.fromTime);
  const untilA = timeToMinutes(a.untilTime);
  const fromB = timeToMinutes(b.fromTime);
  const untilB = timeToMinutes(b.untilTime);
  if (fromA <= untilA && fromB <= untilB) {
    return intervalsOverlap(fromA, untilA, fromB, untilB);
  }
  if (fromA > untilA && fromB > untilB) return true;
  const a1 = fromA > untilA ? [fromA, 24 * 60] as const : [fromA, untilA] as const;
  const a2 = fromA > untilA ? [0, untilA] as const : null;
  const b1 = fromB > untilB ? [fromB, 24 * 60] as const : [fromB, untilB] as const;
  const b2 = fromB > untilB ? [0, untilB] as const : null;
  if (intervalsOverlap(a1[0], a1[1], b1[0], b1[1])) return true;
  if (a2 && intervalsOverlap(a2[0], a2[1], b1[0], b1[1])) return true;
  if (b2 && intervalsOverlap(a1[0], a1[1], b2[0], b2[1])) return true;
  if (a2 && b2 && intervalsOverlap(a2[0], a2[1], b2[0], b2[1])) return true;
  return false;
}

export function findOverlappingSchedule(schedules: ScheduledPause[], candidate: ScheduledPause): ScheduledPause | null {
  for (const s of schedules) {
    if (s.id === candidate.id) continue;
    if (schedulesOverlap(s, candidate)) return s;
  }
  return null;
}

export { MAX_SCHEDULES };
