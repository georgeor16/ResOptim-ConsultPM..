import type { User } from './types';

export type DigestCadence = 'daily' | 'weekly' | 'biweekly';

export interface OrgNotificationPreferences {
  orgId: string;
  adminUserId: string;
  enableMultiTeamCrunch: boolean;
  enableCrossTeamConflict: boolean;
  enableSharingOpportunity: boolean;
  enableHealthDegradation: boolean;
  enableKickoffRisk: boolean;
  teamsThresholdForCrunch: number; // default 2
  crossTeamOverallocationTrigger: 100 | 110 | 120;
  escalationWindowHours: 12 | 24 | 48;
  digestCadence: DigestCadence;
  backupAdminUserId?: string;
}

const KEY_PREFIX = 'orgnotif:prefs:';

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

export function getDefaultOrgPrefs(orgId: string, adminUserId: string): OrgNotificationPreferences {
  return {
    orgId,
    adminUserId,
    enableMultiTeamCrunch: true,
    enableCrossTeamConflict: true,
    enableSharingOpportunity: true,
    enableHealthDegradation: true,
    enableKickoffRisk: true,
    teamsThresholdForCrunch: 2,
    crossTeamOverallocationTrigger: 110,
    escalationWindowHours: 24,
    digestCadence: 'weekly',
  };
}

export function loadOrgNotificationPreferences(orgId: string, adminUserId: string): OrgNotificationPreferences {
  const key = `${KEY_PREFIX}${orgId}:${adminUserId}`;
  const fallback = getDefaultOrgPrefs(orgId, adminUserId);
  const prefs = loadJson<Partial<OrgNotificationPreferences>>(key, fallback);
  return { ...fallback, ...prefs, orgId, adminUserId };
}

export function saveOrgNotificationPreferences(prefs: OrgNotificationPreferences): void {
  const key = `${KEY_PREFIX}${prefs.orgId}:${prefs.adminUserId}`;
  saveJson(key, prefs);
}

export function getOrgAdmins(users: User[], orgId?: string): User[] {
  return users.filter(u => u.role === 'admin' && (!orgId || u.organisationId === orgId || !u.organisationId));
}

export function getTeamManagers(users: User[], teamIds: string[]): User[] {
  const teamSet = new Set(teamIds);
  return users.filter(u => u.role === 'manager' && u.teamId && teamSet.has(u.teamId));
}

