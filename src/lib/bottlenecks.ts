import type { AppData, Project, Task, User } from './types';
import { getMemberProjectFtePercent, getMemberProjectTasksWithFte, getMemberTotalPeakFte, getDefaultPeriodBounds, type ViewPeriod } from './bandwidth';

export type BottleneckKind = 'role' | 'skill';
export type BottleneckSeverity = 'emerging' | 'active' | 'critical';

export interface BottleneckHistoryPoint {
  monthKey: string; // YYYY-MM
  scarcityRatio: number;
}

export interface BottleneckTeamContribution {
  teamId: string;
  teamName: string;
  scarcityRatio: number;
  severity: BottleneckSeverity;
}

export interface BottleneckDemandDriver {
  projectId: string;
  projectName: string;
  demandFte: number;
}

export interface BottleneckMemberRow {
  user: User;
  teamId?: string;
  teamName?: string;
  totalFte: number;
  remaining: number;
  projectIds: string[];
}

export interface BottleneckTaskRow {
  task: Task;
  projectName: string;
  assignee: User;
  ftePercent: number;
}

export interface Bottleneck {
  id: string; // `${kind}:${label}`
  kind: BottleneckKind;
  label: string;
  severity: BottleneckSeverity;
  scarcityRatio: number;
  demand: number;
  supply: number;
  reliefDate?: string;
  affectedTeams: BottleneckTeamContribution[];
  demandDrivers: BottleneckDemandDriver[];
  members: BottleneckMemberRow[];
  tasks: BottleneckTaskRow[];
  history: BottleneckHistoryPoint[];
  patternLabel?: string;
}

export function classifySeverity(scarcityRatio: number): BottleneckSeverity {
  if (!Number.isFinite(scarcityRatio)) return 'critical';
  if (scarcityRatio > 0.95) return 'critical';
  if (scarcityRatio >= 0.8) return 'active';
  return 'emerging';
}

function getMonthKeysBack(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys.reverse();
}

function getMonthRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function computeGroupDemandSupply(
  data: AppData,
  users: User[],
  period: { start: string; end: string },
  viewPeriod: ViewPeriod
): { demand: number; supply: number; totalByUserId: Map<string, number>; remainingByUserId: Map<string, number> } {
  const totalByUserId = new Map<string, number>();
  const remainingByUserId = new Map<string, number>();
  let demand = 0;
  let supply = 0;
  for (const u of users) {
    const totalFte = getMemberTotalPeakFte(data, u, viewPeriod, period.start, period.end);
    const remaining = Math.max(0, 100 - totalFte);
    totalByUserId.set(u.id, totalFte);
    remainingByUserId.set(u.id, remaining);
    demand += totalFte;
    supply += remaining;
  }
  return { demand, supply, totalByUserId, remainingByUserId };
}

function computeDemandDrivers(
  data: AppData,
  users: User[],
  period: { start: string; end: string },
  viewPeriod: ViewPeriod
): BottleneckDemandDriver[] {
  const activeProjects = (data.projects ?? []).filter(p => p.status === 'Active');
  const drivers: BottleneckDemandDriver[] = [];
  for (const p of activeProjects) {
    let sum = 0;
    for (const u of users) {
      // Only count if user is involved (alloc or task) to keep things snappy.
      const involved =
        (data.allocations ?? []).some(a => a.projectId === p.id && a.userId === u.id) ||
        (data.tasks ?? []).some(t => t.projectId === p.id && (t.assigneeIds ?? []).includes(u.id));
      if (!involved) continue;
      sum += getMemberProjectFtePercent(data, u, p.id, viewPeriod, period.start, period.end);
    }
    if (sum > 0) {
      drivers.push({ projectId: p.id, projectName: p.name, demandFte: sum });
    }
  }
  drivers.sort((a, b) => b.demandFte - a.demandFte);
  return drivers.slice(0, 3);
}

function computeReliefDate(tasks: Task[]): string | undefined {
  const dated = tasks
    .filter(t => t.status !== 'Done')
    .filter(t => Boolean(t.dueDate))
    .map(t => t.dueDate)
    .filter(Boolean) as string[];
  if (dated.length === 0) return undefined;
  dated.sort();
  return dated[dated.length - 1];
}

function buildMemberRows(
  data: AppData,
  users: User[],
  totalByUserId: Map<string, number>
): BottleneckMemberRow[] {
  const teamById = new Map<string, { id: string; name: string }>();
  (data.teams ?? []).forEach(t => teamById.set(t.id, { id: t.id, name: t.name }));

  const activeProjects = (data.projects ?? []).filter(p => p.status === 'Active');
  const activeProjectIds = new Set(activeProjects.map(p => p.id));

  const rows: BottleneckMemberRow[] = users.map(u => {
    const totalFte = totalByUserId.get(u.id) ?? 0;
    const remaining = Math.max(0, 100 - totalFte);
    const projectIds = Array.from(new Set([
      ...(data.allocations ?? []).filter(a => a.userId === u.id).map(a => a.projectId),
      ...(data.tasks ?? []).filter(t => (t.assigneeIds ?? []).includes(u.id)).map(t => t.projectId),
    ])).filter(pid => activeProjectIds.has(pid));
    const team = u.teamId ? teamById.get(u.teamId) : undefined;
    return { user: u, teamId: u.teamId, teamName: team?.name, totalFte, remaining, projectIds };
  });
  rows.sort((a, b) => b.totalFte - a.totalFte);
  return rows;
}

function buildTaskRows(
  data: AppData,
  users: User[],
  period: { start: string; end: string },
  viewPeriod: ViewPeriod
): BottleneckTaskRow[] {
  const userById = new Map(users.map(u => [u.id, u] as const));
  const projectById = new Map<string, Project>();
  data.projects.forEach(p => projectById.set(p.id, p));

  const rows: BottleneckTaskRow[] = [];
  // Compute per-user task contributions using the existing helper (no FTE reimplementation).
  for (const u of users) {
    const activeProjects = (data.projects ?? []).filter(p => p.status === 'Active');
    const projectIds = Array.from(new Set(
      (data.tasks ?? []).filter(t => t.status !== 'Done' && (t.assigneeIds ?? []).includes(u.id)).map(t => t.projectId)
    )).filter(pid => activeProjects.some(p => p.id === pid));

    for (const pid of projectIds) {
      const list = getMemberProjectTasksWithFte(data, u.id, pid, viewPeriod, period.start, period.end);
      for (const { task, ftePercent } of list) {
        if (!userById.has(u.id)) continue;
        const projectName = projectById.get(task.projectId)?.name ?? 'Unknown';
        rows.push({ task, projectName, assignee: u, ftePercent });
      }
    }
  }
  // de-dupe exact rows if any
  const uniq = new Map<string, BottleneckTaskRow>();
  for (const r of rows) {
    uniq.set(`${r.task.id}:${r.assignee.id}`, r);
  }
  const out = Array.from(uniq.values());
  out.sort((a, b) => b.ftePercent - a.ftePercent);
  return out;
}

function computePatternLabel(history: BottleneckHistoryPoint[]): string | undefined {
  const hot = history.filter(h => h.scarcityRatio >= 0.8).length;
  if (hot >= 3) return 'Recurring pressure';
  return undefined;
}

export function computeBottlenecks(
  data: AppData,
  kind: BottleneckKind,
  opts?: { includeMonitored?: boolean }
): Bottleneck[] {
  const org = data.organisations?.[0];
  const orgId = org?.id;
  const orgRoles = (data.roles ?? []).filter(r => (!orgId || r.orgId === orgId));
  const orgSkills = (data.skills ?? []).filter(s => (!orgId || s.orgId === orgId));
  const activeRoles = orgRoles.filter(r => !r.archived);
  const activeSkills = orgSkills.filter(s => !s.archived);
  const activeIds = kind === 'role' ? activeRoles.map(r => r.id) : activeSkills.map(s => s.id);
  const nameById = new Map<string, string>(
    kind === 'role'
      ? orgRoles.map(r => [r.id, r.name] as const)
      : orgSkills.map(s => [s.id, s.name] as const)
  );

  const activeProjects = (data.projects ?? []).filter(p => p.status === 'Active');
  const activeProjectIds = new Set(activeProjects.map(p => p.id));
  const allTasks = (data.tasks ?? []).filter(t => activeProjectIds.has(t.projectId));
  const viewPeriod: ViewPeriod = 'month';
  const period = getDefaultPeriodBounds(viewPeriod);

  // Include any ids already used by members, even if taxonomy is empty.
  const memberUsedIds = new Set<string>();
  data.users.forEach(u => {
    if (kind === 'role') {
      if (u.primaryRole) memberUsedIds.add(u.primaryRole);
    } else {
      (u.skills ?? []).forEach(id => memberUsedIds.add(id));
    }
  });

  const ids = Array.from(new Set([...activeIds, ...Array.from(memberUsedIds)])).filter(Boolean);
  if (ids.length === 0) return [];

  const teamById = new Map<string, string>();
  (data.teams ?? []).forEach(t => teamById.set(t.id, t.name));

  const result: Bottleneck[] = [];
  for (const id of ids) {
    const label = nameById.get(id) ?? 'Unknown';
    const users = data.users.filter(u => {
      if (kind === 'role') return (u.primaryRole ?? '') === id;
      return (u.skills ?? []).includes(id);
    });
    if (users.length === 0) continue;

    const { demand, supply, totalByUserId } = computeGroupDemandSupply(data, users, period, viewPeriod);
    const scarcityRatio = supply <= 0 ? Number.POSITIVE_INFINITY : demand / supply;
    const severity = classifySeverity(scarcityRatio);

    // Team contributions
    const byTeam = new Map<string, User[]>();
    for (const u of users) {
      const tid = u.teamId ?? 'unknown';
      const arr = byTeam.get(tid) ?? [];
      arr.push(u);
      byTeam.set(tid, arr);
    }
    const affectedTeams: BottleneckTeamContribution[] = Array.from(byTeam.entries()).map(([teamId, us]) => {
      const { demand: d, supply: s } = computeGroupDemandSupply(data, us, period, viewPeriod);
      const ratio = s <= 0 ? Number.POSITIVE_INFINITY : d / s;
      return {
        teamId,
        teamName: teamId === 'unknown' ? 'Unassigned' : (teamById.get(teamId) ?? 'Team'),
        scarcityRatio: ratio,
        severity: classifySeverity(ratio),
      };
    }).sort((a, b) => b.scarcityRatio - a.scarcityRatio);

    const demandDrivers = computeDemandDrivers(data, users, period, viewPeriod);

    const tasksForUsers = allTasks.filter(t => (t.assigneeIds ?? []).some(id => users.some(u => u.id === id)));
    const reliefDate = computeReliefDate(tasksForUsers);

    const historyMonths = getMonthKeysBack(6);
    const history: BottleneckHistoryPoint[] = historyMonths.map((mk) => {
      const bounds = getMonthRange(mk);
      const { demand: d, supply: s } = computeGroupDemandSupply(data, users, bounds, viewPeriod);
      const ratio = s <= 0 ? Number.POSITIVE_INFINITY : d / s;
      return { monthKey: mk, scarcityRatio: ratio };
    });

    result.push({
      id: `${kind}:${id}`,
      kind,
      label,
      severity,
      scarcityRatio,
      demand,
      supply,
      reliefDate,
      affectedTeams,
      demandDrivers,
      members: buildMemberRows(data, users, totalByUserId),
      tasks: buildTaskRows(data, users, period, viewPeriod),
      history,
      patternLabel: computePatternLabel(history),
    });
  }

  const threshold = 0.65;
  const filtered = opts?.includeMonitored
    ? result
    : result.filter(b => (Number.isFinite(b.scarcityRatio) ? b.scarcityRatio >= threshold : true));

  const severityRank: Record<BottleneckSeverity, number> = { critical: 0, active: 1, emerging: 2 };
  filtered.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity]) return severityRank[a.severity] - severityRank[b.severity];
    if (b.affectedTeams.length !== a.affectedTeams.length) return b.affectedTeams.length - a.affectedTeams.length;
    return b.scarcityRatio - a.scarcityRatio;
  });

  return filtered;
}

