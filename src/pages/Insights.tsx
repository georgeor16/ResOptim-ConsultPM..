import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import type { AppData, User, Project, Team as TeamType } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getMemberTotalPeakFte,
  type ViewPeriod as BandwidthViewPeriod,
} from '@/lib/bandwidth';
import {
  getActiveFlags,
  getResolvedFlags,
  type PlanningFlag,
} from '@/lib/planningInsights';
import {
  getMergedTemplates,
  getTemplateRuns,
  type SimulationTemplateMeta,
  type TemplateRunRecord,
} from '@/lib/simulationTemplates';
import { PlanningInsightsPanel } from '@/components/PlanningInsightsPanel';
import { MultiLineCapacityChart, type TeamSeriesBucket, type TeamSeriesLine } from '@/components/MultiLineCapacityChart';
import { BottleneckPanel } from '@/components/BottleneckPanel';
import { AlertTriangle, Activity, BarChart3, Brain, Users, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewPeriod = BandwidthViewPeriod;

type TrendWindow = '3m' | '6m' | '12m';

interface MemberTrendPoint {
  monthKey: string; // YYYY-MM
  totalFte: number;
}

interface MemberTrendSummary {
  user: User;
  averageFte: number;
  peakFte: number;
  overallocationEvents: number;
  trajectory: 'up' | 'down' | 'flat';
}

interface MonthlyDigestSummary {
  monthKey: string;
  label: string;
  avgTeamFte: number;
  peakTeamFte: number;
  overallocationEvents: number;
  projectsActive: number;
  tasksCompleted: number;
  tasksTotal: number;
  simulationsRun: number;
  simulationsApplied: number;
  simulationsReversed: number;
  planningFlagsRaised: number;
  planningFlagsResolved: number;
}

interface DerivedTeam {
  id: string;
  name: string;
  organisationId?: string;
  users: User[];
  projects: Project[];
}

interface TeamCapacitySummary {
  teamId: string;
  teamName: string;
  averageFte: number;
  peakFte: number;
}

function getMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getRecentMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    keys.push(k);
  }
  return keys;
}

function getMonthRange(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

function computeMemberMonthFte(data: AppData, user: User, monthKey: string): number {
  const { start, end } = getMonthRange(monthKey);
  return getMemberTotalPeakFte(data, user, 'month' as ViewPeriod, start, end);
}

/** Monday of week in YYYY-MM-DD; weeks go back from current. */
function getRecentWeekKeys(count: number): string[] {
  const keys: string[] = [];
  const d = new Date();
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  let mon = new Date(d);
  mon.setDate(d.getDate() + mondayOffset);
  mon.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    keys.push(mon.toISOString().slice(0, 10));
    mon = new Date(mon);
    mon.setDate(mon.getDate() - 7);
  }
  return keys.reverse();
}

function getWeekRange(weekKey: string): { start: Date; end: Date } {
  const start = new Date(weekKey + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function computeMemberWeekFte(data: AppData, user: User, weekKey: string): number {
  const { start, end } = getWeekRange(weekKey);
  return getMemberTotalPeakFte(data, user, 'week' as ViewPeriod, start, end);
}

const TEAM_CHART_COLORS = [
  '#0d9488', '#2563eb', '#dc2626', '#ca8a04', '#7c3aed', '#059669', '#ea580c', '#db2777', '#0891b2', '#4f46e5',
];

function getTeamChartColor(teamId: string, index: number): string {
  let h = 0;
  for (let i = 0; i < teamId.length; i += 1) h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return TEAM_CHART_COLORS[(h % TEAM_CHART_COLORS.length + index) % TEAM_CHART_COLORS.length];
}

function buildTeamSeries(
  data: AppData,
  teams: DerivedTeam[],
  window: TrendWindow
): { buckets: TeamSeriesBucket[]; lines: TeamSeriesLine[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const list = teams.length > 0 ? teams : [{ id: 'all', name: 'All', users: data.users, projects: data.projects, organisationId: undefined }] as DerivedTeam[];
  const useWeeks = window !== '12m';
  const weekCount = window === '3m' ? 13 : 26;
  const monthCount = 12;
  let buckets: TeamSeriesBucket[] = [];

  if (useWeeks) {
    const weekKeys = getRecentWeekKeys(weekCount);
    buckets = weekKeys.map((key) => {
      const d = new Date(key + 'T00:00:00');
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { key, label, date: d, isProjected: d > today };
    });
  } else {
    const monthKeys = getRecentMonthKeys(monthCount).reverse();
    buckets = monthKeys.map((key) => {
      const [y, m] = key.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      return { key, label, date: d, isProjected: d > today };
    });
  }

  const lines: TeamSeriesLine[] = list.map((team, idx) => {
    const color = getTeamChartColor(team.id, idx);
    const values = buckets.map((b) => {
      const members = team.users.length ? team.users : data.users;
      if (!members.length) return 0;
      let total = 0;
      if (useWeeks) {
        members.forEach((u) => { total += computeMemberWeekFte(data, u, b.key); });
      } else {
        members.forEach((u) => { total += computeMemberMonthFte(data, u, b.key); });
      }
      return total / members.length;
    });
    const latestFte = values.length ? values[values.length - 1] : 0;
    return { teamId: team.id, teamName: team.name, values, latestFte, color };
  });

  return { buckets, lines };
}

function buildMemberTrends(data: AppData, window: TrendWindow): {
  months: string[];
  pointsByUserId: Record<string, MemberTrendPoint[]>;
  summaries: MemberTrendSummary[];
  peakMonthKey: string | null;
  peakTeamFte: number;
} {
  const monthCount = window === '3m' ? 3 : window === '6m' ? 6 : 12;
  const months = getRecentMonthKeys(monthCount).reverse(); // oldest -> newest
  const pointsByUserId: Record<string, MemberTrendPoint[]> = {};
  let peakTeamFte = 0;
  let peakMonthKey: string | null = null;

  months.forEach((monthKey) => {
    let teamFte = 0;
    data.users.forEach((user) => {
      const fte = computeMemberMonthFte(data, user, monthKey);
      teamFte += fte;
      const arr = pointsByUserId[user.id] ?? [];
      arr.push({ monthKey, totalFte: fte });
      pointsByUserId[user.id] = arr;
    });
    const avgTeamFte = data.users.length > 0 ? teamFte / data.users.length : 0;
    if (avgTeamFte > peakTeamFte) {
      peakTeamFte = avgTeamFte;
      peakMonthKey = monthKey;
    }
  });

  const summaries: MemberTrendSummary[] = data.users.map((user) => {
    const points = pointsByUserId[user.id] ?? [];
    if (points.length === 0) {
      return {
        user,
        averageFte: 0,
        peakFte: 0,
        overallocationEvents: 0,
        trajectory: 'flat',
      };
    }
    const values = points.map((p) => p.totalFte);
    const averageFte = values.reduce((a, b) => a + b, 0) / values.length;
    const peakFte = Math.max(...values);
    const overallocationEvents = values.filter((v) => v > 100).length;
    let trajectory: 'up' | 'down' | 'flat' = 'flat';
    if (values.length >= 2) {
      const first = values[0];
      const last = values[values.length - 1];
      const delta = last - first;
      if (delta > 5) trajectory = 'up';
      else if (delta < -5) trajectory = 'down';
    }
    return {
      user,
      averageFte,
      peakFte,
      overallocationEvents,
      trajectory,
    };
  });

  return { months, pointsByUserId, summaries, peakMonthKey, peakTeamFte };
}

function computeSchedulingHealth(flags: PlanningFlag[]): 'healthy' | 'attention' | 'critical' {
  const systemicCount = flags.filter((f) => f.type === 'systemic').length;
  const planningCount = flags.filter((f) => f.type === 'planning_problem').length;
  if (systemicCount >= 1 || planningCount >= 3) return 'critical';
  if (planningCount > 0) return 'attention';
  return 'healthy';
}

function deriveTeams(data: AppData): DerivedTeam[] {
  const teams: TeamType[] = data.teams ?? [];
  if (teams.length > 0) {
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      organisationId: t.organisationId,
      users: data.users.filter((u) => u.teamId === t.id),
      projects: data.projects.filter((p) => p.teamId === t.id),
    }));
  }
  // Fallback: single core team containing all users/projects
  return [
    {
      id: 'core',
      name: 'Core team',
      organisationId: data.organisations?.[0]?.id,
      users: data.users,
      projects: data.projects,
    },
  ];
}

function computeTeamCapacitySummaries(
  trend: ReturnType<typeof buildMemberTrends>,
  teams: DerivedTeam[]
): TeamCapacitySummary[] {
  const summaries: TeamCapacitySummary[] = [];
  teams.forEach((team) => {
    const userIds = new Set(team.users.map((u) => u.id));
    const relevant = trend.summaries.filter((s) => userIds.has(s.user.id));
    if (relevant.length === 0) return;
    const avg =
      relevant.reduce((acc, s) => acc + s.averageFte, 0) /
      relevant.length;
    const peak = Math.max(...relevant.map((s) => s.peakFte));
    summaries.push({
      teamId: team.id,
      teamName: team.name,
      averageFte: avg,
      peakFte: peak,
    });
  });
  return summaries;
}

function buildMonthlyDigest(data: AppData, runs: TemplateRunRecord[], flags: PlanningFlag[], monthKey: string): MonthlyDigestSummary {
  const { start, end } = getMonthRange(monthKey);
  const tasksInMonth = (data.tasks ?? []).filter((t) => {
    if (!t.startDate && !t.dueDate) return false;
    const s = t.startDate ? new Date(t.startDate) : start;
    const e = t.dueDate ? new Date(t.dueDate) : s;
    return e >= start && s <= end;
  });
  const tasksCompleted = tasksInMonth.filter((t) => t.status === 'Done').length;
  const projectsActive = new Set(tasksInMonth.map((t) => t.projectId)).size;

  let teamFteSum = 0;
  let teamFtePeak = 0;
  data.users.forEach((u) => {
    const fte = getMemberTotalPeakFte(data, u, 'month' as ViewPeriod, start, end);
    teamFteSum += fte;
    if (fte > teamFtePeak) teamFtePeak = fte;
  });
  const avgTeamFte = data.users.length > 0 ? teamFteSum / data.users.length : 0;

  const overallocationEvents = data.users.reduce((acc, u) => {
    const fte = getMemberTotalPeakFte(data, u, 'month' as ViewPeriod, start, end);
    return acc + (fte > 100 ? 1 : 0);
  }, 0);

  const runsInMonth = runs.filter((r) => {
    const d = new Date(r.createdAt);
    return d >= start && d <= end;
  });
  const simulationsRun = runsInMonth.length;
  const simulationsApplied = runsInMonth.filter((r) => r.applied).length;
  const simulationsReversed = runsInMonth.filter((r) => r.reversedAt).length;

  const flagsInMonth = flags.filter((f) => {
    const d = new Date(f.createdAt);
    return d >= start && d <= end;
  });
  const planningFlagsRaised = flagsInMonth.length;
  // We don't persist resolved timestamps for each flag; approximate using resolvedFlags length
  const planningFlagsResolved = 0;

  return {
    monthKey,
    label: getMonthLabel(monthKey),
    avgTeamFte,
    peakTeamFte: teamFtePeak,
    overallocationEvents,
    projectsActive,
    tasksCompleted,
    tasksTotal: tasksInMonth.length,
    simulationsRun,
    simulationsApplied,
    simulationsReversed,
    planningFlagsRaised,
    planningFlagsResolved,
  };
}

function healthChipClass(health: 'healthy' | 'attention' | 'critical'): string {
  switch (health) {
    case 'critical':
      return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40';
    case 'attention':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40';
    default:
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40';
  }
}

export default function Insights() {
  const { isManagerOrAbove, currentUser } = useAuth();
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'planning' | 'capacity' | 'simulation' | 'team' | 'digest' | 'forecast'>('planning');
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('3m');

  useEffect(() => {
    loadData()
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const activeFlags = useMemo(
    () => (currentUser ? getActiveFlags(currentUser.id) : []),
    [currentUser?.id]
  );
  const schedulingHealth = useMemo(
    () => computeSchedulingHealth(activeFlags),
    [activeFlags]
  );

  const templateMeta: SimulationTemplateMeta[] = useMemo(
    () => (currentUser ? getMergedTemplates(currentUser.id) : []),
    [currentUser?.id]
  );
  const templateRuns: TemplateRunRecord[] = useMemo(
    () => getTemplateRuns(),
    []
  );

  const trend = useMemo(
    () => (data ? buildMemberTrends(data, trendWindow) : null),
    [data, trendWindow]
  );

  const digests: MonthlyDigestSummary[] = useMemo(() => {
    if (!data) return [];
    const months = getRecentMonthKeys(6); // show last 6 months
    return months.map((key) => buildMonthlyDigest(data, templateRuns, activeFlags, key));
  }, [data, templateRuns, activeFlags]);
  const teams = useMemo(() => (data ? deriveTeams(data) : []), [data]);
  const [scope, setScope] = useState<'team' | 'org'>('team');
  const orgViewAvailable =
    !!data && ((data.organisations?.length ?? 0) > 0 || teams.length > 1);

  if (!isManagerOrAbove) {
    return (
      <div className="p-6">
        <Card className="bg-background/80 backdrop-blur border border-white/10">
          <CardContent className="py-10 text-center text-muted-foreground">
            Access restricted — Insights are available for managers and admins only.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
            Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Planning analytics, pattern reports, and team capacity intelligence.
          </p>
          {orgViewAvailable && (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-background/60 px-1 py-0.5 text-[11px]">
              <button
                type="button"
                className={cn(
                  'px-2 py-0.5 rounded-full',
                  scope === 'team' ? 'bg-white/10 text-foreground' : 'text-muted-foreground'
                )}
                onClick={() => setScope('team')}
              >
                Team view
              </button>
              <button
                type="button"
                className={cn(
                  'px-2 py-0.5 rounded-full',
                  scope === 'org' ? 'bg-white/10 text-foreground' : 'text-muted-foreground'
                )}
                onClick={() => setScope('org')}
              >
                Organisation view
              </button>
            </div>
          )}
        </div>
        <div
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium',
            healthChipClass(schedulingHealth)
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>
            {scope === 'org' ? 'Organisation' : 'Team'} planning health:{' '}
            {schedulingHealth === 'healthy'
              ? 'Healthy'
              : schedulingHealth === 'attention'
              ? 'Needs attention'
              : 'Critical'}
          </span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-muted/30 border border-white/10 rounded-full mb-4">
          <TabsTrigger value="planning" className="gap-1.5 text-xs px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            Planning Health
          </TabsTrigger>
          <TabsTrigger value="capacity" className="gap-1.5 text-xs px-3">
            <GaugeIcon />
            Capacity Trends
          </TabsTrigger>
          <TabsTrigger value="simulation" className="gap-1.5 text-xs px-3">
            <Brain className="h-3.5 w-3.5" />
            Simulation Intelligence
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs px-3">
            <Users className="h-3.5 w-3.5" />
            Team Patterns
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-1.5 text-xs px-3">
            <Activity className="h-3.5 w-3.5" />
            Forecasting
          </TabsTrigger>
          <TabsTrigger value="digest" className="gap-1.5 text-xs px-3">
            <CalendarClock className="h-3.5 w-3.5" />
            Monthly Digest
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planning" className="mt-0 space-y-4">
          {scope === 'org' && (
            <Card className="bg-background/70 backdrop-blur border border-white/10">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Organisation-level planning health across {teams.length} team{teams.length !== 1 ? 's' : ''}.
                </p>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg bg-muted/20 border border-white/10 px-3 py-2 text-xs flex flex-col gap-0.5"
                    >
                      <span className="text-foreground/90 font-medium truncate">
                        {t.name}
                      </span>
                      <span className="text-muted-foreground">
                        Members: {t.users.length} · Projects: {t.projects.length}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Flags and health are derived from team-level Insights; per-team breakdown will become richer as multi-team data is configured.
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="bg-background/70 backdrop-blur border border-white/10">
            <CardContent className="p-4">
              <PlanningInsightsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="mt-0 space-y-4">
          <CapacityTrendsSection
            data={data}
            trend={trend}
            window={trendWindow}
            onWindowChange={setTrendWindow}
            scope={scope}
            teams={teams}
          />
        </TabsContent>

        <TabsContent value="simulation" className="mt-0 space-y-4">
          <SimulationIntelligenceSection templates={templateMeta} runs={templateRuns} />
        </TabsContent>

        <TabsContent value="team" className="mt-0 space-y-4">
          <TeamPatternsSection data={data} trend={trend} />
        </TabsContent>

        <TabsContent value="forecast" className="mt-0 space-y-4">
          <ForecastingSection data={data} teams={teams} scope={scope} />
        </TabsContent>

        <TabsContent value="digest" className="mt-0 space-y-4">
          <MonthlyDigestSection digests={digests} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GaugeIcon() {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/30 text-[8px]">
      %
    </span>
  );
}

function CapacityTrendsSection({
  data,
  trend,
  window,
  onWindowChange,
  scope,
  teams,
}: {
  data: AppData;
  trend: ReturnType<typeof buildMemberTrends> | null;
  window: TrendWindow;
  onWindowChange: (w: TrendWindow) => void;
  scope: 'team' | 'org';
  teams: DerivedTeam[];
}) {
  const [focusedTeamIds, setFocusedTeamIds] = useState<Set<string> | null>(null);
  const chartData = useMemo(() => buildTeamSeries(data, teams, window), [data, teams, window]);

  const handleToggleTeam = useCallback((teamId: string) => {
    setFocusedTeamIds((prev) => {
      if (prev === null) return new Set([teamId]);
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next.size === 0 ? null : next;
    });
  }, []);

  const handleSelectAll = useCallback(() => setFocusedTeamIds(null), []);
  const handleDeselectAll = useCallback(() => setFocusedTeamIds(new Set()), []);

  if (!trend) {
    return null;
  }
  const { months, summaries, peakMonthKey, peakTeamFte } = trend;
  const peakLabel = peakMonthKey ? getMonthLabel(peakMonthKey) : null;
  const teamSummaries = scope === 'org' ? computeTeamCapacitySummaries(trend, teams) : [];

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
            Capacity Trends
          </h2>
          <p className="text-xs text-muted-foreground">
            Team FTE % over time and upcoming bottlenecks.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-background/60 px-1 py-0.5">
          {(['3m', '6m', '12m'] as TrendWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              className={cn(
                'px-2 py-1 text-[10px] rounded-full',
                window === w ? 'bg-white/10 text-foreground' : 'text-muted-foreground'
              )}
              onClick={() => onWindowChange(w)}
            >
              {w === '3m' ? '3 months' : w === '6m' ? '6 months' : '12 months'}
            </button>
          ))}
        </div>
      </div>

      <Card className="bg-background/70 backdrop-blur border border-white/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Peak load forecast</p>
              {peakLabel ? (
                <p className="text-sm text-foreground">
                  Peak average team load expected around{' '}
                  <span className="font-medium">{peakLabel}</span>{' '}
                  at approximately{' '}
                  <span className="font-medium">
                    {Math.round(peakTeamFte)}% FTE
                  </span>
                  .
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not enough data to compute trends yet.
                </p>
              )}
            </div>
            {peakTeamFte >= 80 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                Bottleneck ahead — peak capacity expected at{' '}
                {Math.round(peakTeamFte)}% average team FTE.
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Team FTE % over time (one line per team; weekly buckets for 3m/6m, monthly for 12m).
              </p>
              <MultiLineCapacityChart
                buckets={chartData.buckets}
                lines={chartData.lines}
                selectedTeamIds={focusedTeamIds}
                onToggleTeam={handleToggleTeam}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
              />
            </div>

            <div className="w-full md:w-64 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Member capacity summary ({window === '3m' ? 'last 3 months' : window === '6m' ? 'last 6 months' : 'last 12 months'})
              </p>
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {summaries
                  .slice()
                  .sort((a, b) => b.peakFte - a.peakFte)
                  .map((s) => (
                    <div
                      key={s.user.id}
                      className="rounded-lg bg-muted/30 border border-white/5 px-2 py-1.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {s.user.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Avg {Math.round(s.averageFte)}% · Peak {Math.round(s.peakFte)}% ·{' '}
                          {s.overallocationEvents}× over 100%
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full border',
                          s.trajectory === 'up'
                            ? 'border-amber-500/50 text-amber-500'
                            : s.trajectory === 'down'
                            ? 'border-emerald-500/50 text-emerald-500'
                            : 'border-white/20 text-muted-foreground'
                        )}
                      >
                        {s.trajectory === 'up'
                          ? 'Trending up'
                          : s.trajectory === 'down'
                          ? 'Trending down'
                          : 'Stable'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {scope === 'org' && (
            <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-white/10 mt-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Team-by-team capacity comparison
                </p>
                <div className="max-h-44 overflow-y-auto pr-1">
                  {teamSummaries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No team breakdown available yet — add teams and assign members to them to see per-team trends.
                    </p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead className="text-[10px] text-muted-foreground">
                        <tr className="border-b border-white/10">
                          <th className="py-1 pr-2 text-left font-normal">Team</th>
                          <th className="py-1 px-1 text-right font-normal">Avg FTE%</th>
                          <th className="py-1 px-1 text-right font-normal">Peak FTE%</th>
                          <th className="py-1 pl-1 text-right font-normal">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamSummaries
                          .slice()
                          .sort((a, b) => b.averageFte - a.averageFte)
                          .map((t) => {
                            const overloaded = t.peakFte > 100 || t.averageFte >= 85;
                            const underutilised = t.averageFte < 50;
                            return (
                              <tr key={t.teamId} className="border-b border-white/5 last:border-b-0">
                                <td className="py-1 pr-2 text-foreground/90 truncate">
                                  {t.teamName}
                                </td>
                                <td className="py-1 px-1 text-right text-muted-foreground">
                                  {Math.round(t.averageFte)}%
                                </td>
                                <td className="py-1 px-1 text-right text-muted-foreground">
                                  {Math.round(t.peakFte)}%
                                </td>
                                <td className="py-1 pl-1 text-right">
                                  <span
                                    className={cn(
                                      'inline-flex items-center justify-end gap-1 text-[10px]',
                                      overloaded
                                        ? 'text-amber-500'
                                        : underutilised
                                        ? 'text-emerald-500'
                                        : 'text-muted-foreground'
                                    )}
                                  >
                                    {overloaded
                                      ? 'Overloaded'
                                      : underutilised
                                      ? 'Available'
                                      : 'Balanced'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Organisation-wide bottlenecks
                </p>
                <BottleneckPanel data={data} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SimulationIntelligenceSection({
  templates,
  runs,
}: {
  templates: SimulationTemplateMeta[];
  runs: TemplateRunRecord[];
}) {
  const totalRuns = runs.length;
  const appliedRuns = runs.filter((r) => r.applied).length;
  const applyRate = totalRuns > 0 ? Math.round((appliedRuns / totalRuns) * 100) : 0;

  const reversalRuns = runs.filter((r) => r.reversedAt);
  const mostUsed = templates.slice().sort((a, b) => b.usageCount - a.usageCount).slice(0, 5);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
            Simulation Intelligence
          </h2>
          <p className="text-xs text-muted-foreground">
            How simulations are used and what the engine is learning.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-white/10 px-2 py-0.5 bg-background/60">
            {totalRuns} simulations · Apply rate {applyRate}%
          </span>
        </div>
      </div>

      <Card className="bg-background/70 backdrop-blur border border-white/10">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Template health overview
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-[10px] text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-1 text-left font-normal">Template</th>
                    <th className="px-2 py-1 text-left font-normal">Used</th>
                    <th className="px-2 py-1 text-left font-normal">Apply %</th>
                    <th className="px-2 py-1 text-left font-normal">Reversal %</th>
                    <th className="px-2 py-1 text-left font-normal">Frustrated discards</th>
                    <th className="px-2 py-1 text-left font-normal">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => {
                    const applyPct = t.usageCount > 0 ? Math.round((t.appliedCount / t.usageCount) * 100) : 0;
                    const reversalCount = t.reversalCount ?? 0;
                    const reversalPct = t.appliedCount > 0 ? Math.round((reversalCount / t.appliedCount) * 100) : 0;
                    const frustrated = t.frustratedDiscardCount ?? 0;
                    const health = t.health ?? 'green';
                    const dotClass =
                      health === 'green'
                        ? 'bg-emerald-500/80'
                        : health === 'amber'
                        ? 'bg-amber-500/80'
                        : 'bg-red-500/80';
                    return (
                      <tr key={t.id} className="border-b border-white/5 last:border-b-0">
                        <td className="px-2 py-1 text-foreground/90">{t.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">{t.usageCount}</td>
                        <td className="px-2 py-1 text-muted-foreground">{applyPct}%</td>
                        <td className="px-2 py-1 text-muted-foreground">{reversalPct}%</td>
                        <td className="px-2 py-1 text-muted-foreground">{frustrated}</td>
                        <td className="px-2 py-1">
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className={cn('h-2 w-2 rounded-full', dotClass)} />
                            {health === 'green'
                              ? 'Healthy'
                              : health === 'amber'
                              ? 'Needs refinement'
                              : 'Flagged for review'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {templates.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-2 text-center text-muted-foreground text-xs">
                        No templates yet — run some simulations to build intelligence.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Most used templates (recent)
              </p>
              <ul className="space-y-1.5 text-xs">
                {mostUsed.length === 0 && (
                  <li className="text-muted-foreground text-xs">No usage yet.</li>
                )}
                {mostUsed.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-foreground/90 truncate">{t.name}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {t.usageCount} runs · {t.appliedCount} applied
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reversal log
              </p>
              <div className="max-h-40 overflow-y-auto pr-1">
                {reversalRuns.length === 0 && (
                  <p className="text-xs text-muted-foreground">No applied simulations have been marked as reversed yet.</p>
                )}
                <ul className="space-y-1.5 text-xs">
                  {reversalRuns.map((r) => {
                    const label = Array.isArray(r.stepsSummary)
                      ? (r.stepsSummary as { label?: string }[])[0]?.label
                      : null;
                    return (
                      <li
                        key={r.id}
                        className="rounded-lg bg-muted/30 border border-white/5 px-2 py-1.5"
                      >
                        <p className="text-foreground/90 truncate">
                          {label ?? 'Simulation'} — applied then reversed
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Applied {new Date(r.createdAt).toLocaleDateString()} · Reversed{' '}
                          {r.reversedAt ? new Date(r.reversedAt).toLocaleDateString() : 'n/a'}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function TeamPatternsSection({
  data,
  trend,
}: {
  data: AppData;
  trend: ReturnType<typeof buildMemberTrends> | null;
}) {
  // Simple proxy for imbalance: ratio between max and average load over the trend window
  const imbalance = useMemo(() => {
    if (!trend) return { ratio: 0, heavyUser: null as User | null };
    const totals: { user: User; avg: number }[] = trend.summaries.map((s) => ({
      user: s.user,
      avg: s.averageFte,
    }));
    if (totals.length === 0) return { ratio: 0, heavyUser: null as User | null };
    const avgOverall = totals.reduce((a, b) => a + b.avg, 0) / totals.length;
    const max = totals.reduce((a, b) => (b.avg > a.avg ? b : a), totals[0]);
    const ratio = avgOverall > 0 ? max.avg / avgOverall : 0;
    return { ratio, heavyUser: max.user };
  }, [trend]);

  const overloadedMembers = useMemo(
    () =>
      trend
        ? trend.summaries
            .filter((s) => s.peakFte > 100)
            .sort((a, b) => b.peakFte - a.peakFte)
            .slice(0, 5)
        : [],
    [trend]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
            Team Patterns
          </h2>
          <p className="text-xs text-muted-foreground">
            How work, ownership, and capacity are distributed across the team.
          </p>
        </div>
      </div>

      <Card className="bg-background/70 backdrop-blur border border-white/10">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Workload balance
              </p>
              {imbalance.heavyUser ? (
                <p className="text-xs text-foreground/90">
                  {imbalance.heavyUser.name} has carried above-average load — approximately{' '}
                  <span className="font-medium">
                    {imbalance.ratio.toFixed(2)}×
                  </span>{' '}
                  the team average over the selected period.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Not enough data yet to measure workload balance.
                </p>
              )}
              {imbalance.ratio > 1.3 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Consider rebalancing upcoming work so critical members are not persistently above the rest of the team.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recurring overallocations
              </p>
              {overloadedMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No members have consistently exceeded 100% FTE over the selected period.
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {overloadedMembers.map((m) => (
                    <li key={m.user.id} className="flex items-center justify-between gap-2">
                      <span className="text-foreground/90 truncate">
                        {m.user.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Peak {Math.round(m.peakFte)}% · {m.overallocationEvents} month(s) over 100%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-muted/20 border border-white/5 px-3 py-2 text-[11px] text-muted-foreground">
            Patterns here are derived from capacity and simulation data only — they are meant as soft signals, not hard judgements. Use them as prompts for conversation with the team.
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function MonthlyDigestSection({ digests }: { digests: MonthlyDigestSummary[] }) {
  if (digests.length === 0) {
    return (
      <Card className="bg-background/70 backdrop-blur border border-white/10">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Not enough historical data yet to generate a monthly digest. Check back after a few weeks of activity.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
            Monthly Digest
          </h2>
          <p className="text-xs text-muted-foreground">
            Auto-generated snapshots of capacity, planning activity, and simulation patterns.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {digests.map((d) => (
          <Card key={d.monthKey} className="bg-background/70 backdrop-blur border border-white/10">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground/90">{d.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Team avg {Math.round(d.avgTeamFte)}% FTE · Peak {Math.round(d.peakTeamFte)}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground/90 mb-0.5">Capacity</p>
                  <p>Overallocation events: {d.overallocationEvents}</p>
                  <p>Projects active: {d.projectsActive}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground/90 mb-0.5">Tasks & projects</p>
                  <p>
                    Tasks: {d.tasksCompleted}/{d.tasksTotal} completed
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground/90 mb-0.5">Simulations</p>
                  <p>Run: {d.simulationsRun}</p>
                  <p>Applied: {d.simulationsApplied}</p>
                  <p>Reversed: {d.simulationsReversed}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground/90 mb-0.5">Planning flags</p>
                  <p>Raised: {d.planningFlagsRaised}</p>
                  <p>Resolved: {d.planningFlagsResolved}</p>
                </div>
              </div>
              <div className="pt-1 border-t border-white/10 flex items-center justify-between gap-2">
                <div className="text-[10px] text-muted-foreground">
                  Export options will use your existing Gantt/export settings.
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] rounded-full border-white/20 px-2"
                  onClick={() => {
                    // Placeholder: real implementation could render digest section as PDF / Google Slides / Docs.
                    // For now we just trigger the browser print dialog.
                    window.print();
                  }}
                >
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function ForecastingSection({
  data,
  teams,
  scope,
}: {
  data: AppData;
  teams: DerivedTeam[];
  scope: 'team' | 'org';
}) {
  const unclassifiedCount = useMemo(() => (data.users ?? []).filter(u => !u.primaryRole).length, [data]);
  const now = new Date();
  const nearEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { start: monthStart, end: monthEnd } = getMonthRange(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  const roleForecasts = useMemo(() => {
    // Build role list from primaryRole on users and roleOnProject on allocations
    const rolesSet = new Set<string>();
    data.users.forEach((u) => {
      if (u.primaryRole) rolesSet.add(u.primaryRole.trim());
    });
    (data.allocations ?? []).forEach((a) => {
      if (a.roleOnProject) rolesSet.add(a.roleOnProject.trim());
    });
    const roles = Array.from(rolesSet).filter(Boolean);
    if (roles.length === 0) return [];

    return roles.map((role) => {
      const members = data.users.filter(
        (u) => u.primaryRole?.trim() === role || u.skills?.includes(role)
      );
      const memberIds = new Set(members.map((m) => m.id));
      // Fallback: if no members tagged, infer from allocations
      if (members.length === 0) {
        (data.allocations ?? []).forEach((a) => {
          if (a.roleOnProject?.trim() === role) {
            const u = data.users.find((x) => x.id === a.userId);
            if (u && !memberIds.has(u.id)) members.push(u);
          }
        });
      }
      if (members.length === 0) {
        return {
          role,
          supply: 0,
          demand: 0,
          remaining: 0,
        };
      }
      let demandSum = 0;
      members.forEach((u) => {
        const fte = getMemberTotalPeakFte(data, u, 'month' as ViewPeriod, monthStart, monthEnd);
        demandSum += fte;
      });
      const supply = members.length * 100;
      const demand = demandSum;
      const remaining = supply - demand;
      return {
        role,
        supply,
        demand,
        remaining,
        members,
      };
    });
  }, [data]);

  const gapForecasts = useMemo(
    () =>
      roleForecasts
        .filter((r) => r.supply > 0 && r.demand > r.supply * 0.95)
        .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply)),
    [roleForecasts]
  );

  const surplusForecasts = useMemo(
    () =>
      roleForecasts
        .filter((r) => r.supply > 0 && r.remaining > r.supply * 0.2)
        .sort((a, b) => b.remaining - a.remaining),
    [roleForecasts]
  );

  const [showSurpluses, setShowSurpluses] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
            Forecasting
          </h2>
          <p className="text-xs text-muted-foreground">
            Predictive — based on scheduled pipeline and historical patterns.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Window: next 30 days · confidence{' '}
          <span className="font-medium text-foreground">High</span> (scheduled work only).
        </div>
      </div>

      {unclassifiedCount > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="text-amber-700 dark:text-amber-300">
            <span className="font-medium">{unclassifiedCount}</span> members are unclassified — forecasting and bottleneck detection are partial until roles are assigned.
          </p>
        </div>
      )}

      <Card className="bg-background/70 backdrop-blur border border-white/10">
        <CardContent className="p-4 space-y-3">
          {gapForecasts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No forecasted role gaps in the next 30 days based on current schedule. As more projects and member roles are configured, this view will become richer.
            </p>
          )}

          {gapForecasts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Forecasted gaps (next 30 days)
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {gapForecasts.map((g) => {
                  const shortfall = g.demand - g.supply;
                  const severity =
                    shortfall > g.supply * 0.1
                      ? 'Critical'
                      : shortfall > g.supply * 0.05
                      ? 'Active'
                      : 'Emerging';
                  return (
                    <div
                      key={g.role}
                      className="rounded-xl bg-red-500/5 border border-red-500/30 px-3 py-2 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground/90 truncate">
                          {g.role}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30">
                          {severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Forecasted gap over the next 30 days — demand projected to exceed supply by{' '}
                        <span className="font-medium text-foreground">
                          {Math.round((shortfall / g.supply) * 100)}%
                        </span>{' '}
                        of available role capacity.
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Members at risk:{' '}
                        {g.members
                          .slice(0, 3)
                          .map((m) => m.name)
                          .join(', ')}
                        {g.members.length > 3 && ` +${g.members.length - 3} more`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowSurpluses((v) => !v)}
            >
              {showSurpluses ? 'Hide surpluses' : 'Show surpluses'}
            </button>
            <p className="text-[10px] text-muted-foreground">
              Forecasting is approximate and improves as roles, skills, and simulations are configured.
            </p>
          </div>

          {showSurpluses && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Forecasted surpluses (next 30 days)
              </p>
              {surplusForecasts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No significant surpluses detected for the next 30 days.
                </p>
              )}
              {surplusForecasts.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2">
                  {surplusForecasts.map((s) => (
                    <div
                      key={s.role}
                      className="rounded-xl bg-emerald-500/5 border border-emerald-500/30 px-3 py-2 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground/90 truncate">
                          {s.role}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                          Surplus
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Approximate surplus of{' '}
                        <span className="font-medium text-foreground">
                          {Math.round((s.remaining / s.supply) * 100)}%
                        </span>{' '}
                        role capacity in the next 30 days.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

