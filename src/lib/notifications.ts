import type { Project, Task, User, Role } from './types';
import { cn } from './utils';

export type NotificationCategory = 'task' | 'reassignment' | 'bandwidth' | 'project' | 'org' | 'simulation' | 'permissions' | 'digest';

export type NotificationScope = 'personal' | 'team' | 'org' | 'client';
export type NotificationPriority = 'critical' | 'attention' | 'info';

export type NotificationType =
  | 'task_assigned'
  | 'task_unassigned'
  | 'task_updated'
  | 'task_completed'
  | 'task_deleted'
  | 'bulk_reassigned'
  | 'bandwidth_threshold'
  | 'bandwidth_overlap'
  | 'project_added'
  | 'phase_updated'
  | 'project_status'
  | 'simulation_shared'
  | 'simulation_approval'
  | 'simulation_feedback'
  | 'simulation_applied'
  | 'org_capacity_crunch'
  | 'org_cross_team_conflict'
  | 'org_sharing_opportunity'
  | 'org_health_decline'
  | 'org_kickoff_risk'
  | 'org_digest'
  | 'org_permission_change'
  | 'org_team_changed';

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  scope?: NotificationScope;
  priority?: NotificationPriority;
  /** Optional audience restriction; if present, only these user roles should see it. */
  audience?: Role[];
  orgId?: string;
  teamId?: string;
  affectedTeamIds?: string[];
  /** Coordinated alerts share a group id. */
  groupId?: string;
  /** When an org alert is coordinated to other roles. */
  alsoSentToManagersCount?: number;
  /** Critical org alerts require acknowledgement and do not auto-archive until acknowledged. */
  requiresAck?: boolean;
  acknowledgedAt?: string;
  acknowledgedByUserId?: string;
  title: string;
  message: string;
  projectId?: string;
  taskId?: string;
  relatedUserId?: string;
  /** For simulation notifications: link to shared simulation review */
  sharedSimulationId?: string;
  createdAt: string; // ISO
  read: boolean;
}

export type ActivityEventType =
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'task_reassigned'
  | 'task_completed'
  | 'phase_updated'
  | 'member_added'
  | 'member_removed'
  | 'bandwidth_alert'
  | 'project_created'
  | 'project_status_changed';

export interface ActivityEvent {
  id: string;
  projectId?: string;
  taskId?: string;
  userId: string; // actor
  type: ActivityEventType;
  message: string;
  createdAt: string; // ISO
}

export interface NotificationPreferences {
  userId: string;
  taskUpdates: boolean;
  reassignments: boolean;
  bandwidth: boolean;
  projectChanges: boolean;
  /** Bandwidth thresholds the user wants alerts for (e.g. [75, 90, 100]). */
  bandwidthThresholds: number[];
}

const NOTIF_KEY_PREFIX = 'notif:user:';
const PREF_KEY_PREFIX = 'notif:prefs:';
const ACTIVITY_KEY = 'activity:events';
const BANDWIDTH_STATE_PREFIX = 'notif:bandwidth:last:';

const DAY_MS = 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return crypto.randomUUID();
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadUserNotifications(userId: string): NotificationItem[] {
  const all = loadJson<NotificationItem[]>(`${NOTIF_KEY_PREFIX}${userId}`, []);
  const cutoff = Date.now() - 30 * DAY_MS;
  const fresh = all.filter(n => {
    const t = new Date(n.createdAt).getTime();
    if (Number.isFinite(t) && t >= cutoff) return true;
    if (n.requiresAck && !n.acknowledgedAt) return true;
    if (n.priority === 'critical' && !n.acknowledgedAt) return true;
    return false;
  });
  if (fresh.length !== all.length) {
    saveJson(`${NOTIF_KEY_PREFIX}${userId}`, fresh);
  }
  return fresh.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveUserNotifications(userId: string, notifications: NotificationItem[]): void {
  saveJson(`${NOTIF_KEY_PREFIX}${userId}`, notifications);
}

export function addNotification(notification: NotificationItem): void {
  const existing = loadUserNotifications(notification.userId);
  existing.unshift(notification);
  saveUserNotifications(notification.userId, existing);
}

export function markAllNotificationsRead(userId: string): void {
  const existing = loadUserNotifications(userId);
  if (!existing.length) return;
  const next = existing.map(n => (n.read ? n : { ...n, read: true }));
  saveUserNotifications(userId, next);
}

export function markNotificationRead(userId: string, notificationId: string): void {
  const existing = loadUserNotifications(userId);
  const next = existing.map(n => (n.id === notificationId ? { ...n, read: true } : n));
  saveUserNotifications(userId, next);
}

export function acknowledgeNotification(userId: string, notificationId: string, actorUserId?: string): void {
  const existing = loadUserNotifications(userId);
  const now = nowIso();
  const next = existing.map(n => {
    if (n.id !== notificationId) return n;
    return {
      ...n,
      read: true,
      acknowledgedAt: n.acknowledgedAt ?? now,
      acknowledgedByUserId: n.acknowledgedByUserId ?? actorUserId,
    };
  });
  saveUserNotifications(userId, next);
}

export function getNotificationCounts(userId: string): { unread: number; criticalUnacked: number } {
  const list = loadUserNotifications(userId);
  return {
    unread: list.filter(n => !n.read).length,
    criticalUnacked: list.filter(n => (n.priority === 'critical' || n.requiresAck) && !n.acknowledgedAt).length,
  };
}

export function loadNotificationPreferences(userId: string): NotificationPreferences {
  const key = `${PREF_KEY_PREFIX}${userId}`;
  const fallback: NotificationPreferences = {
    userId,
    taskUpdates: true,
    reassignments: true,
    bandwidth: true,
    projectChanges: true,
    bandwidthThresholds: [75, 100],
  };
  const prefs = loadJson<NotificationPreferences>(key, fallback);
  return {
    ...fallback,
    ...prefs,
    bandwidthThresholds: Array.isArray(prefs.bandwidthThresholds) && prefs.bandwidthThresholds.length
      ? prefs.bandwidthThresholds
      : fallback.bandwidthThresholds,
  };
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  saveJson(`${PREF_KEY_PREFIX}${prefs.userId}`, prefs);
}

export function loadActivityEvents(): ActivityEvent[] {
  const all = loadJson<ActivityEvent[]>(ACTIVITY_KEY, []);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveActivityEvents(events: ActivityEvent[]): void {
  saveJson(ACTIVITY_KEY, events);
}

export function logActivityEvent(event: Omit<ActivityEvent, 'id' | 'createdAt'>): ActivityEvent {
  const full: ActivityEvent = {
    ...event,
    id: genId(),
    createdAt: nowIso(),
  };
  const events = loadActivityEvents();
  events.unshift(full);
  saveActivityEvents(events);
  return full;
}

export function getActivityForProject(projectId: string): ActivityEvent[] {
  return loadActivityEvents().filter(e => e.projectId === projectId);
}

export function getRecentActivity(days = 7): ActivityEvent[] {
  const cutoff = Date.now() - days * DAY_MS;
  return loadActivityEvents().filter(e => new Date(e.createdAt).getTime() >= cutoff);
}

export function shouldNotifyCategory(prefs: NotificationPreferences, category: NotificationCategory): boolean {
  if (category === 'task') return prefs.taskUpdates;
  if (category === 'reassignment') return prefs.reassignments;
  if (category === 'bandwidth') return prefs.bandwidth;
  if (category === 'project') return prefs.projectChanges;
  return true;
}

type BandwidthBucket = 'low' | '75' | '90' | '100' | 'over';

function getBandwidthBucket(totalFte: number): BandwidthBucket {
  if (!Number.isFinite(totalFte) || totalFte < 75) return 'low';
  if (totalFte < 90) return '75';
  if (totalFte < 100) return '90';
  if (totalFte === 100) return '100';
  return 'over';
}

/** Track last bandwidth bucket so we only notify when crossing thresholds. */
function loadLastBandwidthBucket(userId: string): BandwidthBucket {
  const raw = localStorage.getItem(`${BANDWIDTH_STATE_PREFIX}${userId}`);
  if (raw === '75' || raw === '90' || raw === '100' || raw === 'over') return raw;
  return 'low';
}

function saveLastBandwidthBucket(userId: string, bucket: BandwidthBucket): void {
  localStorage.setItem(`${BANDWIDTH_STATE_PREFIX}${userId}`, bucket);
}

export function maybeNotifyBandwidthThreshold(user: User, totalFte: number, project?: Project): void {
  const prefs = loadNotificationPreferences(user.id);
  if (!prefs.bandwidth) return;
  const bucket = getBandwidthBucket(totalFte);
  const last = loadLastBandwidthBucket(user.id);
  if (bucket === last) return;

  const thresholds = prefs.bandwidthThresholds;
  const messages: { title: string; message: string; level: number }[] = [];

  if (bucket === '75' && thresholds.includes(75)) {
    messages.push({
      level: 75,
      title: 'Approaching capacity',
      message: `You are approaching full capacity — currently at ${Math.round(totalFte)}% FTE across all projects.`,
    });
  }
  if (bucket === '90' && thresholds.includes(90)) {
    messages.push({
      level: 90,
      title: 'High capacity',
      message: `You are above 90% FTE across all projects (${Math.round(totalFte)}%).`,
    });
  }
  if (bucket === '100' && thresholds.includes(100)) {
    messages.push({
      level: 100,
      title: 'At full capacity',
      message: `You are at full capacity — ${Math.round(totalFte)}% FTE committed across all projects.`,
    });
  }
  if (bucket === 'over' && thresholds.includes(100)) {
    const over = Math.round(totalFte - 100);
    messages.push({
      level: 101,
      title: 'Overallocation detected',
      message: `You are overallocated — ${Math.round(totalFte)}% FTE, exceeding your available bandwidth by ${over}%.`,
    });
  }

  if (!messages.length) {
    saveLastBandwidthBucket(user.id, bucket);
    return;
  }

  const context = project ? ` in ${project.name}` : '';
  for (const m of messages) {
    addNotification({
      id: genId(),
      userId: user.id,
      type: 'bandwidth_threshold',
      category: 'bandwidth',
      title: m.title,
      message: `${m.message}${context}`,
      projectId: project?.id,
      createdAt: nowIso(),
      read: false,
    });
    logActivityEvent({
      userId: user.id,
      projectId: project?.id,
      type: 'bandwidth_alert',
      message: m.message + context,
    });
  }

  saveLastBandwidthBucket(user.id, bucket);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'} ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD} days ago`;
  return date.toLocaleDateString();
}

export function notificationTypeColor(type: NotificationType): string {
  if (type === 'bandwidth_threshold' || type === 'bandwidth_overlap') {
    return 'text-amber-500';
  }
  if (type === 'project_status') {
    return 'text-muted-foreground';
  }
  if (type === 'task_deleted') {
    return 'text-destructive';
  }
  if (type === 'simulation_shared' || type === 'simulation_approval' || type === 'simulation_feedback' || type === 'simulation_applied') {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-muted-foreground';
}

export function notificationAccentBg(type: NotificationType): string {
  if (type === 'bandwidth_threshold' || type === 'bandwidth_overlap') {
    return 'bg-amber-500/10';
  }
  if (type === 'task_deleted') {
    return 'bg-destructive/10';
  }
  if (type === 'simulation_shared' || type === 'simulation_approval' || type === 'simulation_feedback' || type === 'simulation_applied') {
    return 'bg-amber-500/10';
  }
  return 'bg-accent/5';
}

