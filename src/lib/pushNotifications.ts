/**
 * Mobile push notification layer: PWA (Web Push) and native (APNs/FCM) placeholders.
 * Device registry, per-user preferences, permission prompt cooldown.
 */

const DEVICES_KEY_PREFIX = 'push:devices:';
const PREFS_KEY_PREFIX = 'push:prefs:';
const PROMPT_DISMISSED_KEY = 'push:promptDismissedAt';
const COOLDOWN_DAYS = 14;
const MAX_DEVICES = 10;
const INACTIVE_DAYS = 30;

export type PushDeviceType = 'pwa' | 'ios' | 'android';

export interface PushDevice {
  id: string;
  name: string;
  type: PushDeviceType;
  /** PWA: PushSubscription JSON; native: FCM/APNs token. */
  subscription?: unknown;
  token?: string;
  registeredAt: string;
  lastPushAt?: string;
  enabled: boolean;
}

export type PushSeverityFilter = 'critical_only' | 'critical_attention' | 'all';
export type PushAttentionBatching = 'immediate' | '15min' | '1hour';

export interface PushPreferences {
  userId: string;
  severityFilter: PushSeverityFilter;
  attentionBatching: PushAttentionBatching;
  soundForAttention: boolean;
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

export function getPushDevices(userId: string): PushDevice[] {
  return loadJson<PushDevice[]>(`${DEVICES_KEY_PREFIX}${userId}`, []);
}

export function savePushDevices(userId: string, devices: PushDevice[]): void {
  saveJson(`${DEVICES_KEY_PREFIX}${userId}`, devices.slice(0, MAX_DEVICES));
}

export function addPushDevice(userId: string, device: Omit<PushDevice, 'id' | 'registeredAt'>): { ok: boolean; error?: string } {
  const list = getPushDevices(userId);
  if (list.length >= MAX_DEVICES) return { ok: false, error: 'Maximum 10 devices. Remove one first.' };
  const now = new Date().toISOString();
  const newDevice: PushDevice = {
    ...device,
    id: crypto.randomUUID(),
    registeredAt: now,
  };
  list.push(newDevice);
  savePushDevices(userId, list);
  return { ok: true };
}

export function removePushDevice(userId: string, deviceId: string): void {
  savePushDevices(userId, getPushDevices(userId).filter(d => d.id !== deviceId));
}

export function updatePushDevice(userId: string, deviceId: string, patch: Partial<Pick<PushDevice, 'enabled' | 'lastPushAt'>>): void {
  const list = getPushDevices(userId).map(d =>
    d.id === deviceId ? { ...d, ...patch } : d
  );
  savePushDevices(userId, list);
}

export function getDefaultPushPreferences(userId: string): PushPreferences {
  return {
    userId,
    severityFilter: 'critical_attention',
    attentionBatching: '15min',
    soundForAttention: false,
  };
}

export function loadPushPreferences(userId: string): PushPreferences {
  const fallback = getDefaultPushPreferences(userId);
  const loaded = loadJson<Partial<PushPreferences>>(`${PREFS_KEY_PREFIX}${userId}`, {});
  return { ...fallback, ...loaded, userId };
}

export function savePushPreferences(prefs: PushPreferences): void {
  saveJson(`${PREFS_KEY_PREFIX}${prefs.userId}`, prefs);
}

/** Whether the soft permission prompt was dismissed and is still in cooldown. */
export function isPushPromptInCooldown(): boolean {
  const raw = localStorage.getItem(PROMPT_DISMISSED_KEY);
  if (!raw) return false;
  const at = parseInt(raw, 10);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function setPushPromptDismissed(): void {
  localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now()));
}

/** Device has not received a push in 30+ days. */
export function isDeviceInactive(device: PushDevice): boolean {
  if (!device.lastPushAt) return false;
  const t = new Date(device.lastPushAt).getTime();
  return Date.now() - t > INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

/** PWA: check if push is supported (service worker, PushManager, Notifications). */
export function isPushSupported(): boolean {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

/** PWA: current permission state. */
export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Build push title/body per spec (Critical vs Attention). */
export function buildPushPayload(
  priority: 'critical' | 'attention' | 'info',
  title: string,
  message: string
): { title: string; body: string } {
  const titleMax = 50;
  const bodyMax = 100;
  if (priority === 'critical') {
    const t = `🔴 Critical — ${title}`.slice(0, titleMax);
    const b = message.slice(0, bodyMax);
    return { title: t, body: b };
  }
  if (priority === 'attention') {
    const t = `🟡 ${title}`.slice(0, titleMax);
    const b = message.slice(0, bodyMax);
    return { title: t, body: b };
  }
  return { title: title.slice(0, titleMax), body: message.slice(0, bodyMax) };
}
