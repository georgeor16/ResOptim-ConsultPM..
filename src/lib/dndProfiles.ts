/**
 * Do Not Disturb — named reusable pause profiles with one-tap activation.
 */

const PROFILES_KEY_PREFIX = 'notif:dndProfiles:';
const ACTIVE_KEY_PREFIX = 'notif:dndActive:';

export type DndWindowType = 'fixed_duration' | 'until_time' | 'date_range' | 'recurring';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DndWindowConfig {
  fixed_duration?: { hours: number; minutes: number };
  until_time?: { time: string }; // "HH:mm"
  date_range?: { startDate: string; endDate: string }; // "YYYY-MM-DD"
  recurring?: { fromTime: string; untilTime: string; days: DayOfWeek[] };
}

export interface DndProfile {
  id: string;
  name: string;
  icon: string;
  windowType: DndWindowType;
  windowConfig: DndWindowConfig;
  suppressCritical: boolean;
  notifyOnEnd: boolean;
  isStarter?: boolean;
  starterId?: string; // 'deep_work' | 'in_meeting' | 'out_of_office' | 'on_holiday'
  isArchived?: boolean;
}

export interface ActiveDndState {
  profileId: string;
  profileName: string;
  profileIcon: string;
  activatedAt: string; // ISO
  /** ISO — when this DND session ends */
  endsAt: string;
  suppressCritical: boolean;
  notifyOnEnd: boolean;
}

const STARTER_DEFAULTS: Record<string, Omit<DndProfile, 'id'>> = {
  deep_work: {
    name: 'Deep work',
    icon: '🎯',
    windowType: 'fixed_duration',
    windowConfig: { fixed_duration: { hours: 2, minutes: 0 } },
    suppressCritical: false,
    notifyOnEnd: true,
    isStarter: true,
    starterId: 'deep_work',
  },
  in_meeting: {
    name: 'In a meeting',
    icon: '📅',
    windowType: 'fixed_duration',
    windowConfig: { fixed_duration: { hours: 1, minutes: 0 } },
    suppressCritical: false,
    notifyOnEnd: true,
    isStarter: true,
    starterId: 'in_meeting',
  },
  out_of_office: {
    name: 'Out of office',
    icon: '✈️',
    windowType: 'fixed_duration',
    windowConfig: { fixed_duration: { hours: 24, minutes: 0 } },
    suppressCritical: true,
    notifyOnEnd: true,
    isStarter: true,
    starterId: 'out_of_office',
  },
  on_holiday: {
    name: 'On holiday',
    icon: '🌴',
    windowType: 'date_range',
    windowConfig: { date_range: { startDate: '', endDate: '' } },
    suppressCritical: true,
    notifyOnEnd: true,
    isStarter: true,
    starterId: 'on_holiday',
  },
};

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

function getProfilesKey(userId: string): string {
  return `${PROFILES_KEY_PREFIX}${userId}`;
}

function getActiveKey(userId: string): string {
  return `${ACTIVE_KEY_PREFIX}${userId}`;
}

export function getStarterProfiles(): DndProfile[] {
  return Object.entries(STARTER_DEFAULTS).map(([sid, p]) => ({
    ...p,
    id: `starter:${sid}`,
  }));
}

export function loadDndProfiles(userId: string): DndProfile[] {
  const stored = loadJson<DndProfile[]>(getProfilesKey(userId), []);
  const starters = getStarterProfiles();
  const merged: DndProfile[] = [];
  for (const s of starters) {
    const custom = stored.find(x => x.starterId === s.starterId);
    if (custom?.isArchived) merged.push({ ...s, isArchived: true });
    else if (custom) merged.push({ ...s, ...custom, id: s.id });
    else merged.push(s);
  }
  const starterIds = new Set(starters.map(x => x.id));
  for (const p of stored) {
    if (p.starterId || starterIds.has(p.id)) continue;
    if (!p.isArchived) merged.push(p);
  }
  return merged;
}

export function saveDndProfiles(userId: string, profiles: DndProfile[]): void {
  const toStore = profiles.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    windowType: p.windowType,
    windowConfig: p.windowConfig,
    suppressCritical: p.suppressCritical,
    notifyOnEnd: p.notifyOnEnd,
    isStarter: p.isStarter,
    starterId: p.starterId,
    isArchived: p.isArchived,
  }));
  saveJson(getProfilesKey(userId), toStore);
}

/** Returns active DND state without clearing when expired (for detecting "just ended"). */
export function getActiveDndStateNoClear(userId: string): ActiveDndState | null {
  const active = loadJson<ActiveDndState | null>(getActiveKey(userId), null);
  if (!active || !active.endsAt) return null;
  return active;
}

export function loadActiveDnd(userId: string): ActiveDndState | null {
  const active = getActiveDndStateNoClear(userId);
  if (!active) return null;
  if (new Date(active.endsAt).getTime() <= Date.now()) {
    saveActiveDnd(userId, null);
    return null;
  }
  return active;
}

export function saveActiveDnd(userId: string, state: ActiveDndState | null): void {
  saveJson(getActiveKey(userId), state);
}

/** Compute endsAt for a profile when activated at now */
export function computeDndEndsAt(profile: DndProfile, now: Date = new Date()): string | null {
  const cfg = profile.windowConfig;
  if (profile.windowType === 'fixed_duration' && cfg.fixed_duration) {
    const { hours, minutes } = cfg.fixed_duration;
    const end = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
    return end.toISOString();
  }
  if (profile.windowType === 'until_time' && cfg.until_time?.time) {
    const [h, m] = cfg.until_time.time.split(':').map(Number);
    const end = new Date(now);
    end.setHours(h ?? 0, m ?? 0, 0, 0);
    if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
    return end.toISOString();
  }
  if (profile.windowType === 'date_range' && cfg.date_range?.startDate && cfg.date_range?.endDate) {
    const end = new Date(cfg.date_range.endDate);
    end.setHours(23, 59, 59, 999);
    return end.getTime() > now.getTime() ? end.toISOString() : null;
  }
  if (profile.windowType === 'recurring' && cfg.recurring) {
    const { fromTime, untilTime } = cfg.recurring;
    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = untilTime.split(':').map(Number);
    const fromM = (fh ?? 0) * 60 + (fm ?? 0);
    const toM = (th ?? 0) * 60 + (tm ?? 0);
    const nowM = now.getHours() * 60 + now.getMinutes();
    const end = new Date(now);
    if (fromM <= toM) {
      if (nowM >= fromM && nowM < toM) end.setHours(th ?? 0, tm ?? 0, 0, 0);
      else { end.setDate(end.getDate() + 1); end.setHours(th ?? 0, tm ?? 0, 0, 0); }
    } else {
      if (nowM >= fromM) { end.setDate(end.getDate() + 1); end.setHours(th ?? 0, tm ?? 0, 0, 0); }
      else end.setHours(th ?? 0, tm ?? 0, 0, 0);
    }
    return end.toISOString();
  }
  return null;
}

/** Minutes remaining for active DND; 0 if none */
export function getDndRemainingMinutes(userId: string): number {
  const active = loadActiveDnd(userId);
  if (!active) return 0;
  const end = new Date(active.endsAt).getTime();
  const now = Date.now();
  if (end <= now) return 0;
  return Math.ceil((end - now) / 60000);
}

/** Should external delivery be paused due to DND? (Call after quickAlerts and scheduled pause.) */
export function isDndActive(userId: string): boolean {
  return loadActiveDnd(userId) !== null;
}

export function shouldPauseExternalDeliveryDnd(
  userId: string,
  priority: 'critical' | 'attention' | 'info'
): boolean {
  const active = loadActiveDnd(userId);
  if (!active) return false;
  if (priority === 'critical' && !active.suppressCritical) return false;
  return true;
}

export function getActiveDndState(userId: string): ActiveDndState | null {
  return loadActiveDnd(userId);
}

export function resetStarterToDefault(starterId: string): DndProfile {
  const def = STARTER_DEFAULTS[starterId];
  if (!def) throw new Error('Unknown starter');
  return { ...def, id: `starter:${starterId}` };
}

export const DND_ICON_OPTIONS = ['🌙', '✈️', '🌴', '🎯', '📅', '🎧', '☕', '🏠', '🏖️', '⛰️', '🕐', '🛡️'];

export function genProfileId(): string {
  return crypto.randomUUID();
}
