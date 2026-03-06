export type AuditEventType =
  | 'taxonomy_role_created'
  | 'taxonomy_role_renamed'
  | 'taxonomy_role_merged'
  | 'taxonomy_role_archived'
  | 'taxonomy_role_unarchived'
  | 'taxonomy_role_deleted'
  | 'taxonomy_skill_created'
  | 'taxonomy_skill_renamed'
  | 'taxonomy_skill_merged'
  | 'taxonomy_skill_archived'
  | 'taxonomy_skill_unarchived'
  | 'taxonomy_skill_deleted'
  | 'taxonomy_reordered';

export interface AuditEvent {
  id: string;
  orgId?: string;
  actorUserId?: string;
  type: AuditEventType;
  message: string;
  createdAt: string; // ISO
  meta?: Record<string, unknown>;
}

const KEY = 'audit:events';

function nowIso(): string {
  return new Date().toISOString();
}

function load(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(events: AuditEvent[]): void {
  localStorage.setItem(KEY, JSON.stringify(events));
}

export function logAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
  const full: AuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
  };
  const existing = load();
  existing.unshift(full);
  // keep it bounded
  save(existing.slice(0, 500));
  return full;
}

export function getAuditEvents(): AuditEvent[] {
  return load();
}

