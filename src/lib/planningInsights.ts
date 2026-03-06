/**
 * Planning Insights: problem flags from frustrated discards, systemic capacity flags,
 * retirement recommendations, and dismissal feedback loop.
 */

import type { TemplateRunRecord } from './simulationTemplates';
import { getTemplateRuns, isFrustratedDiscard, getMergedTemplates } from './simulationTemplates';
import type { SimulationTemplateMeta } from './simulationTemplates';

const PLANNING_STORAGE_KEY = 'consultpm_planning_insights';
const ROLLING_DAYS = 90;
const RESURFACE_DAYS = 30;

export type FlagDismissalReason = 'not_relevant' | 'already_resolved' | 'pattern_intentional' | 'will_address_later';

export interface PlanningProblemFlag {
  id: string;
  type: 'planning_problem';
  stepSignature: string;
  scenarioLabel: string;
  attemptCount: number;
  frustratedDiscardCount: number;
  lastAttemptAt: string;
  avgSessionDurationMinutes: number;
  bottleneckDescription: string;
  suggestedInterventions: string[];
  status: 'active' | 'improving';
  createdAt: string;
  runIds: string[];
}

export interface SystemicCapacityFlag {
  id: string;
  type: 'systemic';
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  scenarioTypes: string[];
  totalFrustratedDiscards: number;
  description: string;
  suggestedInterventions: string[];
  status: 'active' | 'improving';
  createdAt: string;
}

export type PlanningFlag = PlanningProblemFlag | SystemicCapacityFlag;

export interface ResolvedFlagEntry {
  id: string;
  flagId: string;
  type: 'planning_problem' | 'systemic';
  scenarioLabel: string;
  resolvedAt: string;
  resolutionNote?: string;
}

export interface FlagDismissal {
  flagId: string;
  reason: FlagDismissalReason;
  dismissedAt: string;
  resurfaceAt?: string;
}

interface StoredPlanningState {
  resolvedFlags: ResolvedFlagEntry[];
  dismissals: FlagDismissal[];
  suppressedPatterns: string[];
  dismissalCountByCategory: Record<string, number>;
}

function loadPlanningState(): StoredPlanningState {
  try {
    const raw = localStorage.getItem(PLANNING_STORAGE_KEY);
    if (!raw) return defaultPlanningState();
    return JSON.parse(raw) as StoredPlanningState;
  } catch {
    return defaultPlanningState();
  }
}

function defaultPlanningState(): StoredPlanningState {
  return {
    resolvedFlags: [],
    dismissals: [],
    suppressedPatterns: [],
    dismissalCountByCategory: {},
  };
}

function savePlanningState(s: StoredPlanningState): void {
  try {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function runInWindow(r: TemplateRunRecord, windowDays: number): boolean {
  const created = new Date(r.createdAt).getTime();
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return created >= cutoff;
}

function monthKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Generate Planning Problem Flags from runs with 3+ frustrated discards per scenario in rolling window. */
export function computePlanningProblemFlags(windowDays = ROLLING_DAYS): PlanningProblemFlag[] {
  const runs = getTemplateRuns().filter((r) => runInWindow(r, windowDays));
  const state = loadPlanningState();
  const suppressed = new Set(state.suppressedPatterns);

  const bySig = new Map<string, TemplateRunRecord[]>();
  runs.forEach((r) => {
    if (!r.stepSignature || !isFrustratedDiscard(r)) return;
    if (suppressed.has(r.stepSignature)) return;
    const list = bySig.get(r.stepSignature) ?? [];
    list.push(r);
    bySig.set(r.stepSignature, list);
  });

  const flags: PlanningProblemFlag[] = [];
  bySig.forEach((list, stepSignature) => {
    if (list.length < 3) return;
    const labels = list
      .map((r) => (Array.isArray(r.stepsSummary) ? (r.stepsSummary as { label?: string }[])[0]?.label : null))
      .filter(Boolean) as string[];
    const scenarioLabel = labels[0]?.slice(0, 60) ?? `Scenario (${stepSignature.slice(0, 30)}…)`;
    const durations = list.map((r) => r.sessionDurationMinutes ?? 0).filter((m) => m > 0);
    const avgSession = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    flags.push({
      id: `planning-${stepSignature}`,
      type: 'planning_problem',
      stepSignature,
      scenarioLabel,
      attemptCount: list.length,
      frustratedDiscardCount: list.length,
      lastAttemptAt: list[0]?.createdAt ?? new Date().toISOString(),
      avgSessionDurationMinutes: Math.round(avgSession),
      bottleneckDescription: deriveBottleneckDescription(stepSignature, list.length),
      suggestedInterventions: deriveInterventions(stepSignature),
      status: 'active',
      createdAt: new Date().toISOString(),
      runIds: list.map((r) => r.id),
    });
  });
  return flags;
}

function deriveBottleneckDescription(sig: string, count: number): string {
  if (sig.includes('reassign_task')) {
    return `Reassigning tasks has led to unresolvable overallocation in ${count} attempts — no available team member had sufficient bandwidth without exceeding 100% FTE.`;
  }
  if (sig.includes('add_allocation')) {
    return `Adding capacity has consistently produced overallocation or conflict — consider reducing scope or spreading load across more people.`;
  }
  return `This scenario has been attempted ${count} times and discarded each time — the current setup may not support a feasible solution. Consider structural changes (timeline, scope, or headcount).`;
}

function deriveInterventions(sig: string): string[] {
  const base = [
    'Distribute tasks across two or more members rather than one.',
    'Reduce project scope during the period to free up capacity.',
  ];
  if (sig.includes('reassign_task')) {
    return ['Consider a part-time contractor for the period.', ...base];
  }
  if (sig.includes('add_allocation')) {
    return ['Consider a standing capacity buffer policy for peak periods.', ...base];
  }
  return ['Consider hiring a part-time contractor for the period.', ...base];
}

/** Systemic flags: multiple scenario types with frustrated discards in the same calendar month. */
export function computeSystemicFlags(windowDays = ROLLING_DAYS): SystemicCapacityFlag[] {
  const runs = getTemplateRuns().filter((r) => runInWindow(r, windowDays) && isFrustratedDiscard(r));
  const byMonth = new Map<string, TemplateRunRecord[]>();
  runs.forEach((r) => {
    const key = monthKey(r.createdAt);
    const list = byMonth.get(key) ?? [];
    list.push(r);
    byMonth.set(key, list);
  });

  const flags: SystemicCapacityFlag[] = [];
  byMonth.forEach((list, monthKey) => {
    const sigs = new Set(list.map((r) => r.stepSignature));
    if (sigs.size < 2) return;
    const [y, m] = monthKey.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    flags.push({
      id: `systemic-${monthKey}`,
      type: 'systemic',
      periodLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      scenarioTypes: [...sigs],
      totalFrustratedDiscards: list.length,
      description: `Your team consistently struggled with capacity across ${sigs.size} different scenario types during this period — likely a structural understaffing pattern.`,
      suggestedInterventions: ['Consider a standing capacity buffer policy during this period.', 'Review headcount or scope for the period.'],
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  });
  return flags;
}

/** Active flags (not dismissed, not resolved). */
export function getActiveFlags(currentUserId: string): PlanningFlag[] {
  const state = loadPlanningState();
  const now = new Date().toISOString();
  const suppressed = new Set(state.suppressedPatterns);
  const dismissedIds = new Set(
    state.dismissals
      .filter((d) => d.reason !== 'will_address_later' || (d.resurfaceAt != null && d.resurfaceAt > now))
      .map((d) => d.flagId)
  );
  const problemFlags = computePlanningProblemFlags(ROLLING_DAYS).filter(
    (f) => !dismissedIds.has(f.id) && !suppressed.has(f.stepSignature)
  );
  const systemicFlags = computeSystemicFlags(ROLLING_DAYS).filter((f) => !dismissedIds.has(f.id));
  return [...systemicFlags, ...problemFlags];
}

export function getImprovingFlags(): PlanningFlag[] {
  return [];
}

export function getResolvedFlags(): ResolvedFlagEntry[] {
  return loadPlanningState().resolvedFlags.slice(-50);
}

export function dismissFlag(
  flagId: string,
  reason: FlagDismissalReason,
  scenarioLabel: string,
  type: 'planning_problem' | 'systemic'
): void {
  const state = loadPlanningState();
  const now = new Date().toISOString();
  const resurfaceAt =
    reason === 'will_address_later'
      ? new Date(Date.now() + RESURFACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  state.dismissals.push({
    flagId,
    reason,
    dismissedAt: now,
    resurfaceAt,
  });
  state.dismissalCountByCategory[reason] = (state.dismissalCountByCategory[reason] ?? 0) + 1;
  if (reason === 'already_resolved') {
    state.resolvedFlags.push({
      id: `res-${flagId}-${Date.now()}`,
      flagId,
      type,
      scenarioLabel,
      resolvedAt: now,
    });
  }
  if (reason === 'pattern_intentional') {
    const problemFlags = computePlanningProblemFlags(ROLLING_DAYS);
    const flag = problemFlags.find((f) => f.id === flagId);
    if (flag && flag.type === 'planning_problem' && !state.suppressedPatterns.includes(flag.stepSignature)) {
      state.suppressedPatterns.push(flag.stepSignature);
    }
  }
  savePlanningState(state);
}

/** Retirement: templates with high reversal + high frustrated discard + declining usage. */
export function getRetirementRecommendations(currentUserId: string): {
  template: SimulationTemplateMeta;
  reason: string;
  suggestedReplacementId?: string;
}[] {
  const templates = getMergedTemplates(currentUserId);
  const runs = getTemplateRuns();
  const recommendations: { template: SimulationTemplateMeta; reason: string; suggestedReplacementId?: string }[] = [];

  templates.forEach((t) => {
    const reversalCount = t.reversalCount ?? 0;
    const frustratedCount = t.frustratedDiscardCount ?? 0;
    const usageCount = t.usageCount;
    const appliedCount = t.appliedCount;
    const reversalRate = appliedCount > 0 ? reversalCount / appliedCount : 0;
    const frustratedRate = usageCount > 0 ? frustratedCount / usageCount : 0;

    if (reversalRate >= 0.4 && reversalCount >= 2 && (frustratedRate >= 0.5 || frustratedCount >= 2)) {
      const suggested = templates.find(
        (s) => s.category === 'suggested' && s.id !== t.id && (s as { stepSignature?: string }).stepSignature
      );
      recommendations.push({
        template: t,
        reason: 'High reversal and frustrated discard rate — template may no longer reflect how your team works.',
        suggestedReplacementId: suggested?.id,
      });
    }
  });
  return recommendations;
}
