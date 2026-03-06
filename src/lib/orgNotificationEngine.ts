import type { AppData, Project, User } from './types';
import { addNotification, type NotificationItem, type NotificationPriority } from './notifications';
import { loadOrgNotificationPreferences, getOrgAdmins, getTeamManagers } from './orgNotificationPrefs';
import { getConcurrencyWarnings, getMemberProjectFtePercent, getMemberTotalPeakFte, type ViewPeriod } from './bandwidth';
import { getActiveFlags } from './planningInsights';

const STATE_KEY = 'orgnotif:lastFired';
const DIGEST_KEY = 'orgnotif:lastDigestAt';
const ESCALATION_KEY = 'orgnotif:lastEscalationAt';

function loadState(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveState(s: Record<string, string>): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

function nowIso(): string {
  return new Date().toISOString();
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fireOnce(key: string, build: () => void): boolean {
  const state = loadState();
  if (state[key]) return false;
  build();
  state[key] = nowIso();
  saveState(state);
  return true;
}

function priorityForTeamCount(teamCount: number): NotificationPriority {
  if (teamCount >= 4) return 'critical';
  if (teamCount >= 3) return 'attention';
  return 'attention';
}

function shouldEscalate(createdAt: string, windowHours: number): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > windowHours * 60 * 60 * 1000;
}

function buildBase(opts: Partial<NotificationItem> & Pick<NotificationItem, 'userId' | 'type' | 'category' | 'title' | 'message'>): NotificationItem {
  return {
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    read: false,
    scope: 'org',
    priority: 'info',
    ...opts,
  };
}

export function runOrganisationNotificationChecks(data: AppData): void {
  const orgId = data.organisations?.[0]?.id ?? 'org-1';
  const admins = getOrgAdmins(data.users ?? [], orgId);
  if (admins.length === 0) return;

  // We run checks per admin, applying their org-level preferences globally.
  for (const admin of admins) {
    const prefs = loadOrgNotificationPreferences(orgId, admin.id);
    const periodStart = dateStr(new Date());
    const periodEnd = dateStr(addDays(new Date(), 30));
    const viewPeriod: ViewPeriod = 'week';

    if (prefs.enableMultiTeamCrunch) {
      detectMultiTeamCrunch(data, { orgId, admin, viewPeriod, periodStart, periodEnd, teamsThreshold: prefs.teamsThresholdForCrunch });
    }
    if (prefs.enableCrossTeamConflict) {
      detectSharedMemberConflicts(data, { orgId, admin, viewPeriod, periodStart, periodEnd, trigger: prefs.crossTeamOverallocationTrigger });
    }
    if (prefs.enableSharingOpportunity) {
      detectSharingOpportunities(data, { orgId, admin, viewPeriod, periodStart, periodEnd });
    }
    if (prefs.enableHealthDegradation) {
      detectHealthDegradation(data, { orgId, admin });
    }
    if (prefs.enableKickoffRisk) {
      detectKickoffRisk(data, { orgId, admin });
    }

    // Digest + escalation are also org-admin scoped
    maybeEmitOrgDigest(data, { orgId, admin, cadence: prefs.digestCadence });
    maybeEscalateUnackedCriticals(admin.id, prefs.escalationWindowHours);
  }
}

function teamName(data: AppData, teamId: string): string {
  return data.teams?.find(t => t.id === teamId)?.name ?? (teamId === 'unknown' ? 'Unassigned' : 'Team');
}

function activeProjects(data: AppData): Project[] {
  return (data.projects ?? []).filter(p => p.status === 'Active');
}

function memberTeamsFromWork(data: AppData, userId: string): string[] {
  const projects = activeProjects(data);
  const pById = new Map(projects.map(p => [p.id, p] as const));
  const teamIds = new Set<string>();
  (data.allocations ?? []).filter(a => a.userId === userId).forEach(a => {
    const t = pById.get(a.projectId)?.teamId;
    if (t) teamIds.add(t);
  });
  (data.tasks ?? []).filter(t => (t.assigneeIds ?? []).includes(userId)).forEach(t => {
    const tid = pById.get(t.projectId)?.teamId;
    if (tid) teamIds.add(tid);
  });
  return Array.from(teamIds);
}

function detectMultiTeamCrunch(
  data: AppData,
  args: { orgId: string; admin: User; viewPeriod: ViewPeriod; periodStart: string; periodEnd: string; teamsThreshold: number }
) {
  // teams “simultaneously” above 90% in the same slot label
  const teamsBySlot = new Map<string, Set<string>>();
  const membersOverByTeam = new Map<string, Set<string>>();
  for (const u of data.users ?? []) {
    const tid = u.teamId ?? 'unknown';
    const warns = getConcurrencyWarnings(data, u, args.viewPeriod, args.periodStart, args.periodEnd, 90);
    if (warns.length === 0) continue;
    if (!membersOverByTeam.has(tid)) membersOverByTeam.set(tid, new Set());
    membersOverByTeam.get(tid)!.add(u.id);
    for (const w of warns) {
      const set = teamsBySlot.get(w.slotLabel) ?? new Set<string>();
      set.add(tid);
      teamsBySlot.set(w.slotLabel, set);
    }
  }
  for (const [slotLabel, teamSet] of teamsBySlot.entries()) {
    const nTeams = teamSet.size;
    if (nTeams < args.teamsThreshold) continue;
    const key = `crunch:${args.orgId}:${slotLabel}:${nTeams}`;
    fireOnce(key, () => {
      const priority = priorityForTeamCount(nTeams);
      const affectedTeams = Array.from(teamSet);
      const perTeam = affectedTeams.map(tid => ({
        teamId: tid,
        overMembers: membersOverByTeam.get(tid)?.size ?? 0,
      }));
      addNotification(buildBase({
        userId: args.admin.id,
        type: 'org_capacity_crunch',
        category: 'org',
        scope: 'org',
        priority,
        requiresAck: priority === 'critical',
        orgId: args.orgId,
        affectedTeamIds: affectedTeams,
        title: `${nTeams} teams approaching full capacity`,
        message: `${nTeams} teams are approaching full capacity simultaneously during ${slotLabel} — organisation-wide crunch risk detected. ${perTeam.map(x => `${teamName(data, x.teamId)}: ${x.overMembers}`).join(' · ')}`,
      }));
    });
  }
}

function detectSharedMemberConflicts(
  data: AppData,
  args: { orgId: string; admin: User; viewPeriod: ViewPeriod; periodStart: string; periodEnd: string; trigger: 100 | 110 | 120 }
) {
  const projects = activeProjects(data);
  const teamIdsFromProjects = new Set(projects.map(p => p.teamId).filter(Boolean) as string[]);
  const managers = getTeamManagers(data.users ?? [], Array.from(teamIdsFromProjects));

  for (const u of data.users ?? []) {
    const involvedTeams = memberTeamsFromWork(data, u.id);
    if (involvedTeams.length < 2) continue;
    const totalFte = getMemberTotalPeakFte(data, u, args.viewPeriod, args.periodStart, args.periodEnd);
    if (totalFte < args.trigger) continue;

    const groupId = `conflict:${u.id}:${args.periodStart}:${args.periodEnd}`;
    fireOnce(`${args.orgId}:${groupId}`, () => {
      // per-team breakdown (approx)
      const byTeam = new Map<string, number>();
      for (const p of projects) {
        if (!p.teamId) continue;
        const involved =
          (data.allocations ?? []).some(a => a.projectId === p.id && a.userId === u.id) ||
          (data.tasks ?? []).some(t => t.projectId === p.id && (t.assigneeIds ?? []).includes(u.id));
        if (!involved) continue;
        const v = getMemberProjectFtePercent(data, u, p.id, args.viewPeriod, args.periodStart, args.periodEnd);
        byTeam.set(p.teamId, (byTeam.get(p.teamId) ?? 0) + v);
      }

      // Admin gets full alert
      addNotification(buildBase({
        userId: args.admin.id,
        type: 'org_cross_team_conflict',
        category: 'org',
        scope: 'org',
        priority: totalFte >= 120 ? 'critical' : 'attention',
        requiresAck: totalFte >= 120,
        orgId: args.orgId,
        relatedUserId: u.id,
        affectedTeamIds: involvedTeams,
        groupId,
        title: `${u.name} overallocated across teams`,
        message: `${u.name} is overallocated across ${involvedTeams.length} teams — total FTE: ${Math.round(totalFte)}%. Breakdown: ${involvedTeams.map(tid => `${teamName(data, tid)} ${Math.round(byTeam.get(tid) ?? 0)}%`).join(' · ')}.`,
      }));

      // Managers get scoped transparency notification
      const mgrs = managers.filter(m => m.teamId && involvedTeams.includes(m.teamId));
      for (const m of mgrs) {
        addNotification(buildBase({
          userId: m.id,
          type: 'org_cross_team_conflict',
          category: 'org',
          scope: 'org',
          priority: 'attention',
          orgId: args.orgId,
          teamId: m.teamId,
          affectedTeamIds: [m.teamId!],
          groupId,
          title: `Cross-team bandwidth impact`,
          message: `${u.name}'s bandwidth has been affected by a cross-team commitment — their availability on your work may be reduced. An organisation-level alert is active.`,
          alsoSentToManagersCount: mgrs.length,
        }));
      }
    });
  }
}

function detectSharingOpportunities(
  data: AppData,
  args: { orgId: string; admin: User; viewPeriod: ViewPeriod; periodStart: string; periodEnd: string }
) {
  // Simple role-based opportunity: role with one overloaded team and one available team.
  const orgId = args.orgId;
  const roles = (data.roles ?? []).filter(r => r.orgId === orgId && !r.archived);
  const teams = data.teams ?? [];
  for (const role of roles) {
    const byTeam = new Map<string, { overloaded: User[]; available: User[] }>();
    for (const t of teams) {
      const members = (data.users ?? []).filter(u => u.teamId === t.id && u.primaryRole === role.id);
      const overloaded: User[] = [];
      const available: User[] = [];
      for (const u of members) {
        const f = getMemberTotalPeakFte(data, u, args.viewPeriod, args.periodStart, args.periodEnd);
        if (f > 100) overloaded.push(u);
        if (f < 75) available.push(u);
      }
      if (overloaded.length || available.length) byTeam.set(t.id, { overloaded, available });
    }
    const overloadedTeams = Array.from(byTeam.entries()).filter(([, v]) => v.overloaded.length > 0).map(([k]) => k);
    const availableTeams = Array.from(byTeam.entries()).filter(([, v]) => v.available.length > 0).map(([k]) => k);
    for (const ta of overloadedTeams) {
      for (const tb of availableTeams) {
        if (ta === tb) continue;
        const key = `share:${orgId}:${role.id}:${ta}:${tb}:${args.periodStart}`;
        fireOnce(key, () => {
          const availMembers = byTeam.get(tb)?.available ?? [];
          addNotification(buildBase({
            userId: args.admin.id,
            type: 'org_sharing_opportunity',
            category: 'org',
            scope: 'org',
            priority: 'info',
            orgId,
            affectedTeamIds: [ta, tb],
            title: `Cross-team sharing opportunity`,
            message: `${teamName(data, ta)} is overallocated on ${role.name} · ${teamName(data, tb)} has capacity available. Candidates: ${availMembers.slice(0, 3).map(u => u.name).join(', ')}${availMembers.length > 3 ? '…' : ''}.`,
          }));
        });
      }
    }
  }
}

function detectHealthDegradation(data: AppData, args: { orgId: string; admin: User }) {
  // Use planning flags as a proxy org health. Degradation = from healthy->attention/critical within 7 days.
  const flags = getActiveFlags(args.admin.id);
  const planningCount = flags.filter(f => f.type === 'planning_problem').length;
  const systemicCount = flags.filter(f => f.type === 'systemic').length;
  const level = systemicCount >= 1 || planningCount >= 3 ? 'critical' : planningCount > 0 ? 'attention' : 'healthy';

  const key = `health:${args.orgId}`;
  const state = loadState();
  const prev = state[key];
  if (!prev) {
    state[key] = level;
    saveState(state);
    return;
  }
  if (prev === level) return;
  // only notify on decline
  const rank = (x: string) => (x === 'healthy' ? 0 : x === 'attention' ? 1 : 2);
  if (rank(level) <= rank(prev)) {
    state[key] = level;
    saveState(state);
    return;
  }
  state[key] = level;
  saveState(state);
  addNotification(buildBase({
    userId: args.admin.id,
    type: 'org_health_decline',
    category: 'org',
    scope: 'org',
    priority: level === 'critical' ? 'critical' : 'attention',
    requiresAck: level === 'critical',
    orgId: args.orgId,
    title: `Organisation scheduling health declined`,
    message: `Organisation scheduling health has declined — ${flags.length} active planning flags. Teams most affected can be reviewed in Insights.`,
  }));
}

function detectKickoffRisk(data: AppData, args: { orgId: string; admin: User }) {
  const now = new Date();
  const end = addDays(now, 7);
  const projects = activeProjects(data).filter(p => {
    const s = new Date(p.startDate).getTime();
    return Number.isFinite(s) && s >= now.getTime() && s <= end.getTime();
  });
  const byTeam = new Map<string, Project[]>();
  for (const p of projects) {
    const tid = p.teamId ?? 'unknown';
    const arr = byTeam.get(tid) ?? [];
    arr.push(p);
    byTeam.set(tid, arr);
  }
  const teams = Array.from(byTeam.keys()).filter(t => t !== 'unknown');
  const nProjects = projects.length;
  const nTeams = teams.length;
  if (nProjects < 2 || nTeams < 2) return;
  const key = `kickoff:${args.orgId}:${dateStr(now)}:${nProjects}:${nTeams}`;
  fireOnce(key, () => {
    addNotification(buildBase({
      userId: args.admin.id,
      type: 'org_kickoff_risk',
      category: 'org',
      scope: 'org',
      priority: nProjects >= 4 ? 'attention' : 'info',
      orgId: args.orgId,
      affectedTeamIds: teams,
      title: `${nProjects} new projects starting`,
      message: `${nProjects} new projects are starting across ${nTeams} teams this week — combined bandwidth impact may exceed organisation capacity.`,
    }));
  });
}

function maybeEmitOrgDigest(data: AppData, args: { orgId: string; admin: User; cadence: 'daily' | 'weekly' | 'biweekly' }) {
  const key = `${DIGEST_KEY}:${args.orgId}:${args.admin.id}`;
  const lastRaw = localStorage.getItem(key);
  const last = lastRaw ? new Date(lastRaw).getTime() : 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const interval = args.cadence === 'daily' ? dayMs : args.cadence === 'weekly' ? 7 * dayMs : 14 * dayMs;
  if (last && Date.now() - last < interval) return;

  localStorage.setItem(key, nowIso());
  addNotification(buildBase({
    userId: args.admin.id,
    type: 'org_digest',
    category: 'digest',
    scope: 'org',
    priority: 'info',
    orgId: args.orgId,
    title: `Organisation alert digest`,
    message: `Summary of organisation-level alerts since the last digest. Open Insights → Monthly Digest for full details.`,
  }));
}

function maybeEscalateUnackedCriticals(adminUserId: string, windowHours: number) {
  // lightweight: track last escalation time per admin; emit one reminder if any unacked critical exists.
  const escKey = `${ESCALATION_KEY}:${adminUserId}`;
  const lastEsc = localStorage.getItem(escKey);
  const lastT = lastEsc ? new Date(lastEsc).getTime() : 0;
  if (lastT && Date.now() - lastT < 6 * 60 * 60 * 1000) return; // don't spam: max every 6h

  const listRaw = localStorage.getItem(`notif:user:${adminUserId}`);
  if (!listRaw) return;
  let list: NotificationItem[] = [];
  try { list = JSON.parse(listRaw) as NotificationItem[]; } catch { list = []; }
  const unacked = list.filter(n => (n.priority === 'critical' || n.requiresAck) && !n.acknowledgedAt);
  const needs = unacked.some(n => shouldEscalate(n.createdAt, windowHours));
  if (!needs) return;
  localStorage.setItem(escKey, nowIso());
  addNotification(buildBase({
    userId: adminUserId,
    type: 'org_health_decline',
    category: 'org',
    scope: 'org',
    priority: 'critical',
    requiresAck: true,
    title: `Unacknowledged critical alert`,
    message: `One or more critical organisation alerts remain unacknowledged — teams may still be at risk.`,
  }));
}

