/**
 * Organisation-level external notification channels: Email, Slack, Microsoft Teams.
 * Routing matrix (category × priority → channels), config per channel, delivery stubs.
 */

import type { NotificationPriority } from './notifications';
import { loadUserNotifications, saveUserNotifications, loadNotificationPreferences } from './notifications';
import { shouldPauseExternalDelivery } from './scheduledPause';
import { shouldPauseExternalDeliveryDnd } from './dndProfiles';
import type { User } from './types';
import { getPushDevices, loadPushPreferences, buildPushPayload } from './pushNotifications';

export type ExternalChannelType = 'in_app' | 'email' | 'slack' | 'teams' | 'push';

/** Row keys for the delivery routing matrix (notification categories). */
export type RoutingCategoryKey =
  | 'multi_team_crunch'
  | 'cross_team_conflict'
  | 'sharing_opportunity'
  | 'health_degradation'
  | 'kickoffs'
  | 'client_workspace_breach'
  | 'digest'
  | 'simulation_review';

export const ROUTING_CATEGORY_LABELS: Record<RoutingCategoryKey, string> = {
  multi_team_crunch: 'Multi-team capacity crunch',
  cross_team_conflict: 'Cross-team resource conflict',
  sharing_opportunity: 'Sharing opportunity',
  health_degradation: 'Health degradation',
  kickoffs: 'Simultaneous kickoffs',
  client_workspace_breach: 'Client workspace breach',
  digest: 'Digest',
  simulation_review: 'Simulation review',
};

export type RoutingMatrix = Partial<
  Record<RoutingCategoryKey, Partial<Record<NotificationPriority, ExternalChannelType[]>>>
>;

export interface EmailConfig {
  enabled: boolean;
  senderAddress: string;
  replyToAddress?: string;
  /** Batch interval in hours for Attention alerts (default 4). */
  attentionBatchIntervalHours: number;
  digestCadence: 'daily' | 'weekly' | 'biweekly';
}

export interface SlackConfig {
  enabled: boolean;
  /** Connected via OAuth or webhook. */
  connected: boolean;
  workspaceName?: string;
  /** Incoming webhook URL (alternative to OAuth for posting). */
  webhookUrl?: string;
  channelCritical?: string;
  channelAttention?: string;
  channelDigest?: string;
}

export interface TeamsConfig {
  enabled: boolean;
  method: 'webhook' | 'azure';
  webhookUrl?: string;
  azureClientId?: string;
  azureTenantId?: string;
  azureClientSecret?: string;
  channelCritical?: string;
  channelAttention?: string;
  channelDigest?: string;
}

export interface OrgQuietHours {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  timezone: string; // IANA
}

export interface PushConfig {
  enabled: boolean;
  /** Org-level quiet hours floor for push (users cannot set looser). */
  orgPushQuietHours?: OrgQuietHours;
  /** VAPID public key for PWA Web Push (base64 or url-safe). */
  vapidPublicKey?: string;
}

export interface OrgExternalNotificationConfig {
  orgId: string;
  routingMatrix: RoutingMatrix;
  email?: EmailConfig;
  slack?: SlackConfig;
  teams?: TeamsConfig;
  push?: PushConfig;
  quietHours?: OrgQuietHours;
  /** Critical fallback: if Slack/Teams fails, try email. */
  criticalFallbackToEmail: boolean;
  /** Organisation-wide: when true, no external delivery for any user (admin master switch). */
  externalDeliveryPausedByOrg?: boolean;
}

/** Delivery status stored on NotificationItem (optional). */
export interface DeliveryStatusEntry {
  sentAt: string;
  failed?: boolean;
  channel?: string;
  recipientCount?: number;
}

export interface NotificationDeliveryStatus {
  email?: DeliveryStatusEntry;
  slack?: DeliveryStatusEntry;
  teams?: DeliveryStatusEntry;
  push?: DeliveryStatusEntry & { deviceCount?: number; deliveredCount?: number; failedCount?: number };
}

const STORAGE_KEY_PREFIX = 'extnotif:org:';

function getStorageKey(orgId: string): string {
  return `${STORAGE_KEY_PREFIX}${orgId}`;
}

function defaultRoutingMatrix(): RoutingMatrix {
  const categories: RoutingCategoryKey[] = [
    'multi_team_crunch',
    'cross_team_conflict',
    'sharing_opportunity',
    'health_degradation',
    'kickoffs',
    'client_workspace_breach',
    'digest',
    'simulation_review',
  ];
  const matrix: RoutingMatrix = {};
  for (const cat of categories) {
    matrix[cat] = {
      critical: ['in_app', 'email', 'slack', 'teams', 'push'],
      attention: ['in_app', 'email', 'push'],
      info: ['in_app'],
    };
  }
  return matrix;
}

export function getDefaultExternalConfig(orgId: string): OrgExternalNotificationConfig {
  return {
    orgId,
    routingMatrix: defaultRoutingMatrix(),
    email: {
      enabled: true,
      senderAddress: '',
      attentionBatchIntervalHours: 4,
      digestCadence: 'weekly',
    },
    slack: {
      enabled: false,
      connected: false,
      channelCritical: '#critical-alerts',
      channelAttention: '#planning-alerts',
      channelDigest: '#weekly-digest',
    },
    teams: {
      enabled: false,
      method: 'webhook',
      channelCritical: undefined,
      channelAttention: undefined,
      channelDigest: undefined,
    },
    push: {
      enabled: true,
      vapidPublicKey: '',
    },
    criticalFallbackToEmail: true,
  };
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

export function loadOrgExternalConfig(orgId: string): OrgExternalNotificationConfig {
  const key = getStorageKey(orgId);
  const fallback = getDefaultExternalConfig(orgId);
  const loaded = loadJson<Partial<OrgExternalNotificationConfig>>(key, {});
  const routingMatrix = loaded.routingMatrix ?? fallback.routingMatrix;
  return {
    orgId,
    routingMatrix,
    email: loaded.email ?? fallback.email,
    slack: loaded.slack ?? fallback.slack,
    teams: loaded.teams ?? fallback.teams,
    push: loaded.push ?? fallback.push,
    quietHours: loaded.quietHours ?? fallback.quietHours,
    criticalFallbackToEmail: loaded.criticalFallbackToEmail ?? true,
    externalDeliveryPausedByOrg: loaded.externalDeliveryPausedByOrg ?? false,
  };
}

export function saveOrgExternalConfig(config: OrgExternalNotificationConfig): void {
  saveJson(getStorageKey(config.orgId), config);
}

/** Map notification type/category to routing matrix row. */
export function getRoutingCategoryForNotification(
  type: string,
  category: string
): RoutingCategoryKey | null {
  const t = type as string;
  if (t === 'org_capacity_crunch') return 'multi_team_crunch';
  if (t === 'org_cross_team_conflict') return 'cross_team_conflict';
  if (t === 'org_sharing_opportunity') return 'sharing_opportunity';
  if (t === 'org_health_decline') return 'health_degradation';
  if (t === 'org_kickoff_risk') return 'kickoffs';
  if (t === 'org_digest' || category === 'digest') return 'digest';
  if (
    t === 'simulation_shared' ||
    t === 'simulation_approval' ||
    t === 'simulation_feedback' ||
    t === 'simulation_applied'
  )
    return 'simulation_review';
  if (t === 'client_workspace_breach' || type === 'client_workspace_breach') return 'client_workspace_breach';
  return null;
}

/** Which external channels (email, slack, teams) to deliver to for this notification. */
export function getChannelsToDeliver(
  config: OrgExternalNotificationConfig,
  routingCategory: RoutingCategoryKey | null,
  priority: NotificationPriority
): ExternalChannelType[] {
  const channels: ExternalChannelType[] = ['in_app'];
  if (!routingCategory) return channels;

  const row = config.routingMatrix[routingCategory]?.[priority];
  if (!row) {
    // Apply default: critical → all enabled, attention → email + push, info → in_app
    if (priority === 'critical') {
      if (config.email?.enabled) channels.push('email');
      if (config.slack?.enabled && config.slack?.connected) channels.push('slack');
      if (config.teams?.enabled) channels.push('teams');
      if (config.push?.enabled) channels.push('push');
    } else if (priority === 'attention') {
      if (config.email?.enabled) channels.push('email');
      if (config.push?.enabled) channels.push('push');
    }
    return channels;
  }

  if (row.includes('email') && config.email?.enabled) channels.push('email');
  if (row.includes('slack') && config.slack?.enabled && config.slack?.connected) channels.push('slack');
  if (row.includes('teams') && config.teams?.enabled) channels.push('teams');
  if (row.includes('push') && config.push?.enabled) channels.push('push');
  return channels;
}

/** Update stored notification with delivery status. */
function updateNotificationDeliveryStatus(
  userId: string,
  notificationId: string,
  status: NotificationDeliveryStatus
): void {
  const list = loadUserNotifications(userId);
  const idx = list.findIndex(n => n.id === notificationId);
  if (idx === -1) return;
  const n = list[idx];
  n.deliveryStatus = { ...n.deliveryStatus, ...status };
  saveUserNotifications(userId, list);
}

const nowIso = () => new Date().toISOString();

/** Stub: send email (no backend; record as sent or failed). */
function deliverEmail(
  _config: EmailConfig,
  _notification: { title: string; message: string; userId: string },
  _users: User[]
): { ok: boolean; recipientCount?: number } {
  // In a real app: call backend to send email. For now we simulate success.
  const recipientCount = 1;
  return { ok: true, recipientCount };
}

/** Post to Slack via webhook URL if configured. */
async function deliverSlack(
  config: SlackConfig,
  notification: { title: string; message: string; priority?: string }
): Promise<{ ok: boolean; channel?: string }> {
  if (!config.webhookUrl?.trim()) {
    return { ok: false };
  }
  const channel =
    notification.priority === 'critical'
      ? config.channelCritical
      : notification.priority === 'attention'
        ? config.channelAttention
        : config.channelDigest;
  const payload = {
    text: `*${notification.title}*\n${notification.message}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.title}*\n${notification.message}`,
        },
      },
    ],
  };
  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, channel: channel ?? undefined };
  } catch {
    return { ok: false, channel: channel ?? undefined };
  }
}

/** Post to Teams via webhook (Adaptive Card or plain message). */
async function deliverTeams(
  config: TeamsConfig,
  notification: { title: string; message: string; priority?: string }
): Promise<{ ok: boolean }> {
  const url = config.method === 'webhook' ? config.webhookUrl : undefined;
  if (!url?.trim()) return { ok: false };
  const body = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          body: [
            { type: 'TextBlock', text: notification.title, weight: 'bolder', size: 'medium' },
            { type: 'TextBlock', text: notification.message, wrap: true },
          ],
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
        },
      },
    ],
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

/**
 * Deliver notification to external channels (email, Slack, Teams) per org config.
 * Call after addNotification. Updates the stored notification with deliveryStatus.
 */
export function deliverExternalChannelsIfConfigured(
  notification: {
    id: string;
    userId: string;
    type: string;
    category: string;
    priority?: NotificationPriority;
    title: string;
    message: string;
  },
  orgId: string,
  users: User[]
): void {
  const config = loadOrgExternalConfig(orgId);
  if (config.externalDeliveryPausedByOrg) return;
  const prefs = loadNotificationPreferences(notification.userId);
  if (prefs.quickAlertsEnabled === false) return;

  const priority = (notification.priority ?? 'info') as NotificationPriority;
  if (shouldPauseExternalDelivery(notification.userId, priority)) return;
  if (shouldPauseExternalDeliveryDnd(notification.userId, priority)) return;

  const routingCategory = getRoutingCategoryForNotification(notification.type, notification.category);
  const channels = getChannelsToDeliver(config, routingCategory, priority);

  const status: NotificationDeliveryStatus = {};
  const doUpdate = () => updateNotificationDeliveryStatus(notification.userId, notification.id, status);

  // Email
  if (channels.includes('email') && config.email?.enabled) {
    const result = deliverEmail(config.email, notification, users);
    status.email = {
      sentAt: nowIso(),
      failed: !result.ok,
      recipientCount: result.recipientCount,
    };
    doUpdate();
  }

  // Slack (async but we don't wait in sync flow; fire-and-forget and update after)
  if (channels.includes('slack') && config.slack?.enabled && config.slack?.connected) {
    deliverSlack(config.slack, notification).then(result => {
      status.slack = {
        sentAt: nowIso(),
        failed: !result.ok,
        channel: result.channel,
      };
      doUpdate();
    });
  }

  // Teams (async)
  if (channels.includes('teams') && config.teams?.enabled) {
    deliverTeams(config.teams, notification).then(result => {
      status.teams = { sentAt: nowIso(), failed: !result.ok };
      doUpdate();
    });
  }

  // Push (PWA in-page when permitted; native requires backend)
  if (channels.includes('push') && config.push?.enabled) {
    const priority = (notification.priority ?? 'info') as NotificationPriority;
    const devices = getPushDevices(notification.userId).filter(d => d.enabled);
    const prefs = loadPushPreferences(notification.userId);
    const severityOk = priority === 'critical' || (priority === 'attention' && prefs.severityFilter !== 'critical_only') || (priority === 'info' && prefs.severityFilter === 'all');
    if (devices.length && severityOk) {
      const { title: pushTitle, body: pushBody } = buildPushPayload(priority, notification.title, notification.message);
      let delivered = 0;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(pushTitle, { body: pushBody, tag: notification.id, requireInteraction: priority === 'critical' });
          delivered = 1;
        } catch {
          // ignore
        }
      }
      status.push = {
        sentAt: nowIso(),
        failed: delivered === 0 && devices.length > 0,
        deviceCount: devices.length,
        deliveredCount: delivered,
        failedCount: Math.max(0, devices.length - delivered),
      };
      doUpdate();
    }
  }
}
