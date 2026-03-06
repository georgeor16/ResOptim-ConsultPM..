import { useEffect, useMemo, useState } from 'react';
import type { AppData, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { computeBottlenecks, type Bottleneck, type BottleneckKind, type BottleneckSeverity } from '@/lib/bottlenecks';
import { addNotification } from '@/lib/notifications';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Filter, FlaskConical, ListTree } from 'lucide-react';

type SeverityFilter = 'all' | 'critical' | 'active' | 'emerging' | 'monitored';

function severityBadgeClass(sev: BottleneckSeverity): string {
  if (sev === 'critical') return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
  if (sev === 'active') return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30';
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
}

function severityLabel(sev: BottleneckSeverity): string {
  if (sev === 'critical') return 'Critical';
  if (sev === 'active') return 'Active';
  return 'Emerging';
}

function teamChipClass(sev: BottleneckSeverity): string {
  if (sev === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400';
  if (sev === 'active') return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

function supplyBarClass(sev: BottleneckSeverity): string {
  if (sev === 'critical') return 'bg-red-500/80';
  if (sev === 'active') return 'bg-orange-500/75';
  return 'bg-amber-500/70';
}

function formatDate(d?: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

function sparklinePath(values: number[], w: number, h: number): string {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values.filter(v => Number.isFinite(v)));
  const min = Math.min(...values.filter(v => Number.isFinite(v)));
  const span = Math.max(0.0001, max - min);
  const step = values.length <= 1 ? w : w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function loadLastSeverities(): Record<string, BottleneckSeverity> {
  try {
    const raw = localStorage.getItem('bottleneck:lastSeverity');
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, BottleneckSeverity>;
  } catch {
    return {};
  }
}

function saveLastSeverities(map: Record<string, BottleneckSeverity>): void {
  localStorage.setItem('bottleneck:lastSeverity', JSON.stringify(map));
}

function severityRank(sev: BottleneckSeverity): number {
  if (sev === 'emerging') return 1;
  if (sev === 'active') return 2;
  return 3;
}

export function BottleneckPanel({ data }: { data: AppData }) {
  const navigate = useNavigate();
  const unclassifiedCount = useMemo(() => (data.users ?? []).filter(u => !u.primaryRole).length, [data.users]);
  const [kind, setKind] = useState<BottleneckKind>('role');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [teamId, setTeamId] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const all = useMemo(() => computeBottlenecks(data, kind, { includeMonitored: true }), [data, kind]);
  const memberMeta = useMemo(() => {
    const orgId = data.organisations?.[0]?.id;
    const roles = (data.roles ?? []).filter(r => (!orgId || r.orgId === orgId));
    const skills = (data.skills ?? []).filter(s => (!orgId || s.orgId === orgId));
    return {
      roleNameById: new Map(roles.map(r => [r.id, r.name] as const)),
      skillNameById: new Map(skills.map(s => [s.id, s.name] as const)),
    };
  }, [data.organisations, data.roles, data.skills]);

  const threshold = 0.65;
  const counts = useMemo(() => {
    let critical = 0;
    let active = 0;
    let emerging = 0;
    let monitored = 0;
    for (const b of all) {
      const isMonitored = Number.isFinite(b.scarcityRatio) && b.scarcityRatio < threshold;
      if (isMonitored) {
        monitored += 1;
        continue;
      }
      if (b.severity === 'critical') critical += 1;
      else if (b.severity === 'active') active += 1;
      else emerging += 1;
    }
    return { critical, active, emerging, monitored };
  }, [all]);

  const allTeams = useMemo(() => {
    const teams = data.teams ?? [];
    return [{ id: 'all', name: 'All teams' }, { id: 'unknown', name: 'Unassigned' }, ...teams.map(t => ({ id: t.id, name: t.name }))];
  }, [data.teams]);

  const labels = useMemo(() => {
    const set = new Set(all.map(b => b.label));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(b => {
      if (q && !b.label.toLowerCase().includes(q)) return false;
      if (labelFilter !== 'all' && b.label !== labelFilter) return false;
      const isMonitored = Number.isFinite(b.scarcityRatio) && b.scarcityRatio < threshold;
      if (severity !== 'all') {
        if (severity === 'monitored') {
          if (!isMonitored) return false;
        } else {
          if (isMonitored) return false;
          if (b.severity !== severity) return false;
        }
      }
      if (teamId !== 'all') {
        if (!b.affectedTeams.some(t => t.teamId === teamId)) return false;
      }
      return true;
    });
  }, [all, query, severity, teamId, labelFilter]);

  const sorted = useMemo(() => {
    const sevOrder: Record<BottleneckSeverity, number> = { critical: 0, active: 1, emerging: 2 };
    return filtered.slice().sort((a, b) => {
      const aMon = Number.isFinite(a.scarcityRatio) && a.scarcityRatio < threshold;
      const bMon = Number.isFinite(b.scarcityRatio) && b.scarcityRatio < threshold;
      if (aMon !== bMon) return aMon ? 1 : -1;
      if (!aMon && !bMon) {
        if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
      }
      if (b.affectedTeams.length !== a.affectedTeams.length) return b.affectedTeams.length - a.affectedTeams.length;
      return b.scarcityRatio - a.scarcityRatio;
    });
  }, [filtered]);

  // Severity transitions -> notifications (organisation admins/managers)
  useEffect(() => {
    const last = loadLastSeverities();
    const next: Record<string, BottleneckSeverity> = { ...last };

    const recipients: User[] = (data.users ?? []).filter(u => u.role === 'admin' || u.role === 'manager');
    for (const b of all) {
      const prev = last[b.id];
      next[b.id] = b.severity;
      if (!prev) continue;
      if (prev === b.severity) continue;

      // Only notify on escalation
      if (severityRank(b.severity) <= severityRank(prev)) continue;
      for (const r of recipients) {
        addNotification({
          id: crypto.randomUUID(),
          userId: r.id,
          type: 'bandwidth_threshold',
          category: 'bandwidth',
          title: `${kind === 'role' ? 'Role' : 'Skill'} bottleneck escalated`,
          message: `${b.label} is now ${severityLabel(b.severity)} (scarcity ratio ${(Number.isFinite(b.scarcityRatio) ? b.scarcityRatio : 999).toFixed(2)}).`,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }
    }

    saveLastSeverities(next);
  }, [all, data.users, kind]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {unclassifiedCount > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="text-amber-700 dark:text-amber-300">
            <span className="font-medium">{unclassifiedCount}</span> members are unclassified — bottleneck detection is partial until all members have roles assigned.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-8 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            onClick={() => navigate('/bandwidth?unclassified=1')}
          >
            Review members
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-background/60 px-1 py-0.5 text-[11px]">
            <button
              type="button"
              className={cn('px-2 py-0.5 rounded-full', kind === 'role' ? 'bg-white/10 text-foreground' : 'text-muted-foreground')}
              onClick={() => setKind('role')}
            >
              Roles
            </button>
            <button
              type="button"
              className={cn('px-2 py-0.5 rounded-full', kind === 'skill' ? 'bg-white/10 text-foreground' : 'text-muted-foreground')}
              onClick={() => setKind('skill')}
            >
              Skills
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
              {counts.critical} Critical
            </span>
            <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[11px] text-orange-700 dark:text-orange-400">
              {counts.active} Active
            </span>
            <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
              {counts.emerging} Emerging
            </span>
            <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {counts.monitored} monitored
            </span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 backdrop-blur-sm border border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${kind === 'role' ? 'roles' : 'skills'}…`}
          className="h-9 w-[180px] bg-background/50 border-white/10"
        />
        <Select value={labelFilter} onValueChange={setLabelFilter}>
          <SelectTrigger className="h-9 w-[180px] bg-background/50 border-white/10 text-xs">
            <SelectValue placeholder={kind === 'role' ? 'Role' : 'Skill'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {labels.map(l => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
          <SelectTrigger className="h-9 w-[140px] bg-background/50 border-white/10 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="emerging">Emerging</SelectItem>
            <SelectItem value="monitored">Monitored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="h-9 w-[160px] bg-background/50 border-white/10 text-xs">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            {allTeams.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => { setQuery(''); setSeverity('all'); setTeamId('all'); setLabelFilter('all'); }}>
          Clear
        </Button>
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No bottlenecks matching filters.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((b) => (
            <BottleneckCard
              key={b.id}
              bottleneck={b}
              isExpanded={expandedIds.has(b.id)}
              onToggle={() => toggleExpanded(b.id)}
              onClickTeam={(tid) => setTeamId(prev => (prev === tid ? 'all' : tid))}
              onSimulate={() => navigate('/simulation', { state: { appData: data } })}
              roleNameById={memberMeta.roleNameById}
              skillNameById={memberMeta.skillNameById}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BottleneckCard({
  bottleneck: b,
  isExpanded,
  onToggle,
  onClickTeam,
  onSimulate,
  roleNameById,
  skillNameById,
}: {
  bottleneck: Bottleneck;
  isExpanded: boolean;
  onToggle: () => void;
  onClickTeam: (teamId: string) => void;
  onSimulate: () => void;
  roleNameById: Map<string, string>;
  skillNameById: Map<string, string>;
}) {
  const isMonitored = Number.isFinite(b.scarcityRatio) && b.scarcityRatio < 0.65;
  const ratio = Number.isFinite(b.scarcityRatio) ? b.scarcityRatio : 999;
  const capacityTotal = Math.max(1, b.demand + b.supply);
  const consumedPct = Math.min(100, (b.demand / capacityTotal) * 100);
  const line = sparklinePath(b.history.map(h => h.scarcityRatio), 160, 28);

  return (
    <Card className="bg-background/70 backdrop-blur border border-white/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground/90 truncate">{b.label}</p>
              {!isMonitored ? (
                <Badge className={cn('border', severityBadgeClass(b.severity))}>
                  {severityLabel(b.severity)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="border border-white/10 bg-muted/30 text-muted-foreground">
                  Monitored
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Scarcity ratio <span className="font-medium text-foreground/80">{ratio.toFixed(2)}</span> · Demand {Math.round(b.demand)}% · Supply {Math.round(b.supply)}%
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onSimulate}>
              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              Simulate resolution
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onToggle}>
              <ListTree className="h-3.5 w-3.5 mr-1.5" />
              {isExpanded ? 'Hide drill-down' : 'View drill-down'}
            </Button>
          </div>
        </div>

        {/* Supply bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Supply usage</span>
            <span>{Math.round(consumedPct)}% consumed</span>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden border border-white/10">
            <div className={cn('h-full rounded-full', supplyBarClass(b.severity))} style={{ width: `${consumedPct}%` }} />
          </div>
        </div>

        {/* Affected teams */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Affected teams</p>
          <div className="flex flex-wrap gap-1.5">
            {b.affectedTeams.slice(0, 6).map(t => (
              <button
                key={t.teamId}
                type="button"
                className={cn('text-[11px] px-2 py-0.5 rounded-full border', teamChipClass(t.severity))}
                onClick={() => onClickTeam(t.teamId)}
                title={`${t.teamName} ratio ${Number.isFinite(t.scarcityRatio) ? t.scarcityRatio.toFixed(2) : '∞'}`}
              >
                {t.teamName}
              </button>
            ))}
          </div>
        </div>

        {/* Demand drivers */}
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Demand drivers</p>
          {b.demandDrivers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active projects contributing yet.</p>
          ) : (
            <div className="space-y-1">
              {b.demandDrivers.map(d => (
                <div key={d.projectId} className="flex items-center justify-between text-xs">
                  <span className="text-foreground/90 truncate">{d.projectName}</span>
                  <span className="text-muted-foreground tabular-nums">{Math.round(d.demandFte)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Relief timeline */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Relief timeline</span>
          <span className="text-foreground/80">{formatDate(b.reliefDate)}</span>
        </div>

        {/* Drill-down */}
        <Collapsible open={isExpanded} onOpenChange={() => onToggle()} className="pt-1">
          <CollapsibleTrigger className="hidden" />
          <CollapsibleContent className="space-y-3 pt-2">
            <div className="rounded-xl border border-white/10 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Members</p>
                <span className="text-[11px] text-muted-foreground">{b.members.length}</span>
              </div>
              <MembersByTeam members={b.members} roleNameById={roleNameById} skillNameById={skillNameById} />
            </div>

            <div className="rounded-xl border border-white/10 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Demand</p>
                <span className="text-[11px] text-muted-foreground">{b.tasks.length} tasks</span>
              </div>
              {b.tasks.slice(0, 20).map(r => (
                <div key={`${r.task.id}:${r.assignee.id}`} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-foreground/90 truncate">{r.task.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.projectName} · {r.assignee.name} · {r.task.startDate} → {r.task.dueDate}
                    </p>
                  </div>
                  <span className="tabular-nums text-foreground/80">{Math.round(r.ftePercent)}%</span>
                </div>
              ))}
              {b.tasks.length > 20 && (
                <p className="text-[11px] text-muted-foreground">Showing top 20 by contribution.</p>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">History (6 months)</p>
                {b.patternLabel ? (
                  <span className="text-[11px] text-muted-foreground">{b.patternLabel}</span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3">
                <svg width={160} height={28} className="shrink-0">
                  <path d={line} fill="none" stroke="currentColor" opacity={0.6} strokeWidth={1.5} />
                </svg>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <p>Last: {Number.isFinite(b.history[b.history.length - 1]?.scarcityRatio) ? b.history[b.history.length - 1].scarcityRatio.toFixed(2) : '∞'}</p>
                  <p>Peak: {Math.max(...b.history.map(h => (Number.isFinite(h.scarcityRatio) ? h.scarcityRatio : 999))).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function MembersByTeam({
  members,
  roleNameById,
  skillNameById,
}: {
  members: Bottleneck['members'];
  roleNameById: Map<string, string>;
  skillNameById: Map<string, string>;
}) {
  const byTeam = useMemo(() => {
    const map = new Map<string, Bottleneck['members']>();
    for (const m of members) {
      const k = m.teamName ?? 'Unassigned';
      const arr = map.get(k) ?? [];
      arr.push(m);
      map.set(k, arr);
    }
    const ordered = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    ordered.forEach(([, arr]) => arr.sort((a, b) => b.totalFte - a.totalFte));
    return ordered;
  }, [members]);

  return (
    <div className="space-y-2">
      {byTeam.map(([teamName, list]) => (
        <TeamGroup key={teamName} teamName={teamName} members={list} roleNameById={roleNameById} skillNameById={skillNameById} />
      ))}
    </div>
  );
}

function TeamGroup({
  teamName,
  members,
  roleNameById,
  skillNameById,
}: {
  teamName: string;
  members: Bottleneck['members'];
  roleNameById: Map<string, string>;
  skillNameById: Map<string, string>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-white/10 bg-background/30">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2.5 py-2 text-xs">
        <span className="text-foreground/90">{teamName}</span>
        <span className="text-muted-foreground flex items-center gap-2">
          {members.length}
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2.5 pb-2 space-y-1.5">
        {members.map(m => (
          <div key={m.user.id} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 flex items-center gap-2">
              <div
                className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: m.user.avatarColor, color: 'white' }}
              >
                {m.user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="min-w-0">
                <p className="text-foreground/90 truncate">{m.user.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {m.user.primaryRole ? (roleNameById.get(m.user.primaryRole) ?? 'Unknown role') : 'No role assigned'}
                  <span className="text-muted-foreground/60"> · </span>
                  {Array.isArray(m.user.skills) && m.user.skills.length
                    ? m.user.skills.map(id => skillNameById.get(id) ?? 'Unknown').join(', ')
                    : 'No skills'}
                </p>
                <p className="text-[11px] text-muted-foreground/80 truncate">
                  {m.projectIds.length} active project{m.projectIds.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="tabular-nums text-foreground/80">{Math.round(m.remaining)}% remaining</p>
              <div className="h-1.5 w-20 rounded-full bg-muted/40 overflow-hidden border border-white/10 mt-1">
                <div className="h-full bg-emerald-500/70" style={{ width: `${Math.max(0, Math.min(100, 100 - m.totalFte))}%` }} />
              </div>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

