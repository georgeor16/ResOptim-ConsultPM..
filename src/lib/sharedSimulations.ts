/**
 * Shareable simulation scenarios: snapshot storage, reviewers, comments, expiry.
 */

import type { AppData } from './types';
import type { SimulationStep, SimulationDeltaSummary } from './simulation';

export type SharedSimulationAccess = 'internal' | 'external' | 'password';

export type ReviewerStatus = 'pending' | 'approved' | 'changes_requested';

export interface SharedSimulationReviewer {
  userId: string;
  userName: string;
  status: ReviewerStatus;
  respondedAt?: string; // ISO
  comment?: string;
}

export interface SharedSimulationComment {
  id: string;
  authorId: string;
  authorName: string;
  createdAt: string; // ISO
  body: string;
}

/** Serializable delta (Sets stored as arrays). */
export interface SerializedDelta {
  newConflicts: number;
  resolvedConflicts: number;
  affectedMemberIds: string[];
  affectedProjectIds: string[];
}

export interface SharedSimulationSnapshot {
  id: string;
  ownerId: string;
  ownerName: string;
  createdAt: string; // ISO
  /** Frozen copy of base (current) state at share time */
  baseData: AppData;
  steps: SimulationStep[];
  /** Frozen simulated state */
  simulatedData: AppData;
  /** Delta at share time (serialized) */
  delta: SerializedDelta;
  /** Primary project name for display (e.g. first affected project) */
  projectLabel: string;
  access: SharedSimulationAccess;
  /** Hashed or plain access code for password mode (client-only: store plain for demo) */
  accessCode?: string;
  expiresAt: string | null; // ISO or null = never
  revokedAt: string | null; // ISO or null
  /** For external: anonymize member names and/or FTE */
  anonymizeNames?: boolean;
  includeFte?: boolean;
  includeFinancial?: boolean;
  reviewers: SharedSimulationReviewer[];
  comments: SharedSimulationComment[];
  /** Whether the owner applied this simulation (after share) */
  applied?: boolean;
  /** When applied (ISO) */
  appliedAt?: string | null;
}

const STORAGE_KEY = 'consultpm_shared_simulations';
const RETENTION_DAYS = 90;

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadAll(): SharedSimulationSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list: SharedSimulationSnapshot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function serializeDelta(d: SimulationDeltaSummary): SerializedDelta {
  return {
    newConflicts: d.newConflicts,
    resolvedConflicts: d.resolvedConflicts,
    affectedMemberIds: [...d.affectedMemberIds],
    affectedProjectIds: [...d.affectedProjectIds],
  };
}

export function deltaFromSerialized(s: SerializedDelta): SimulationDeltaSummary {
  return {
    newConflicts: s.newConflicts,
    resolvedConflicts: s.resolvedConflicts,
    affectedMemberIds: new Set(s.affectedMemberIds),
    affectedProjectIds: new Set(s.affectedProjectIds),
  };
}

export function getSharedSimulation(shareId: string): SharedSimulationSnapshot | null {
  const list = loadAll();
  const found = list.find((s) => s.id === shareId);
  if (!found) return null;
  if (found.revokedAt) return null;
  if (found.expiresAt && new Date(found.expiresAt) < new Date()) return null;
  return found;
}

export function getSharedSimulationForOwner(shareId: string, ownerId: string): SharedSimulationSnapshot | null {
  const s = getSharedSimulation(shareId);
  if (!s || s.ownerId !== ownerId) return null;
  return s;
}

export function listSharedByOwner(ownerId: string): SharedSimulationSnapshot[] {
  const list = loadAll();
  const cut = new Date();
  cut.setDate(cut.getDate() - RETENTION_DAYS);
  return list
    .filter((s) => s.ownerId === ownerId && new Date(s.createdAt) >= cut)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createSharedSimulation(params: {
  ownerId: string;
  ownerName: string;
  baseData: AppData;
  steps: SimulationStep[];
  simulatedData: AppData;
  delta: SimulationDeltaSummary;
  projectLabel: string;
  access: SharedSimulationAccess;
  accessCode?: string;
  expiresInDays: number | null;
  anonymizeNames?: boolean;
  includeFte?: boolean;
  includeFinancial?: boolean;
  reviewerUserIds?: string[];
  reviewerUserNames?: Record<string, string>;
}): SharedSimulationSnapshot {
  const id = genId();
  const createdAt = nowIso();
  const expiresAt =
    params.expiresInDays != null
      ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const reviewers: SharedSimulationReviewer[] = (params.reviewerUserIds ?? []).map((userId) => ({
    userId,
    userName: params.reviewerUserNames?.[userId] ?? 'Unknown',
    status: 'pending' as const,
  }));
  const snapshot: SharedSimulationSnapshot = {
    id,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    createdAt,
    baseData: params.baseData,
    steps: params.steps,
    simulatedData: params.simulatedData,
    delta: serializeDelta(params.delta),
    projectLabel: params.projectLabel,
    access: params.access,
    accessCode: params.accessCode,
    expiresAt,
    revokedAt: null,
    anonymizeNames: params.anonymizeNames,
    includeFte: params.includeFte,
    includeFinancial: params.includeFinancial,
    reviewers,
    comments: [],
  };
  const list = loadAll();
  list.unshift(snapshot);
  const trimmed = list.slice(0, 100);
  saveAll(trimmed);
  return snapshot;
}

export function updateReviewerStatus(
  shareId: string,
  userId: string,
  status: ReviewerStatus,
  comment?: string
): SharedSimulationSnapshot | null {
  const list = loadAll();
  const idx = list.findIndex((s) => s.id === shareId);
  if (idx < 0) return null;
  const snap = list[idx];
  const reviewer = snap.reviewers.find((r) => r.userId === userId);
  if (!reviewer) return null;
  reviewer.status = status;
  reviewer.respondedAt = nowIso();
  if (comment !== undefined) reviewer.comment = comment;
  saveAll(list);
  return list[idx];
}

export function addSharedSimulationComment(
  shareId: string,
  authorId: string,
  authorName: string,
  body: string
): SharedSimulationSnapshot | null {
  const list = loadAll();
  const idx = list.findIndex((s) => s.id === shareId);
  if (idx < 0) return null;
  const snap = list[idx];
  snap.comments.push({
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    authorId,
    authorName,
    createdAt: nowIso(),
    body,
  });
  saveAll(list);
  return list[idx];
}

export function revokeSharedSimulation(shareId: string, ownerId: string): boolean {
  const list = loadAll();
  const idx = list.findIndex((s) => s.id === shareId && s.ownerId === ownerId);
  if (idx < 0) return false;
  list[idx].revokedAt = nowIso();
  saveAll(list);
  return true;
}

export function markSharedSimulationApplied(shareId: string, ownerId: string): boolean {
  const list = loadAll();
  const idx = list.findIndex((s) => s.id === shareId && s.ownerId === ownerId);
  if (idx < 0) return false;
  list[idx].applied = true;
  list[idx].appliedAt = nowIso();
  saveAll(list);
  return true;
}

export function getShareUrl(shareId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/simulation/review/${shareId}`;
}

export const EXPIRY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: null, label: 'Never' },
] as const;
