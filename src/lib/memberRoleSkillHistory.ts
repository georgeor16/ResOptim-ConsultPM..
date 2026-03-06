import type { User } from './types';

export type MemberHistoryEventType =
  | 'role_changed'
  | 'skills_added'
  | 'skills_removed'
  | 'taxonomy_merge'
  | 'bulk_assign';

export interface MemberRoleSkillHistoryEvent {
  id: string;
  userId: string;
  actorUserId?: string;
  type: MemberHistoryEventType;
  createdAt: string; // ISO
  message: string;
  meta?: Record<string, unknown>;
}

const KEY_PREFIX = 'member:roleSkillHistory:';

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getMemberRoleSkillHistory(userId: string): MemberRoleSkillHistoryEvent[] {
  const list = loadJson<MemberRoleSkillHistoryEvent[]>(`${KEY_PREFIX}${userId}`, []);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function logMemberRoleSkillHistory(
  userId: string,
  event: Omit<MemberRoleSkillHistoryEvent, 'id' | 'createdAt' | 'userId'>
): MemberRoleSkillHistoryEvent {
  const full: MemberRoleSkillHistoryEvent = {
    ...event,
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
  };
  const existing = getMemberRoleSkillHistory(userId);
  existing.unshift(full);
  saveJson(`${KEY_PREFIX}${userId}`, existing.slice(0, 200));
  return full;
}

export function describeRoleChange(args: {
  user: User;
  prevRoleName?: string;
  nextRoleName?: string;
  source: 'manual' | 'bulk' | 'merge';
}): string {
  const prev = args.prevRoleName ?? 'No role';
  const next = args.nextRoleName ?? 'No role';
  const via = args.source === 'merge' ? ' via taxonomy merge' : args.source === 'bulk' ? ' via bulk assignment' : '';
  return `Role changed: ${prev} → ${next}${via}.`;
}

