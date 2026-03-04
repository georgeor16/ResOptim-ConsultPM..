import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import type { AppData, User } from '@/lib/types';
import { getBandwidthStatus } from '@/lib/fte';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getDefaultPeriodBounds,
  type ViewPeriod as BandwidthViewPeriod,
} from '@/lib/bandwidth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, Users, Search } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

type ViewPeriod = BandwidthViewPeriod;
type SortKey = 'name' | 'totalFte' | 'remaining' | 'projects';
const FTE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'approaching', label: 'Approaching' },
  { value: 'full', label: 'At capacity' },
  { value: 'overallocated', label: 'Overallocated' },
];

function loadBarClass(fte: number): string {
  if (fte > 100) return 'bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse';
  if (fte >= 100) return 'bg-orange-500/80';
  if (fte >= 75) return 'bg-amber-500/70';
  return 'bg-emerald-500/60';
}

export default function BandwidthOverview() {
  const { isManagerOrAbove } = useAuth();
  const [data, setData] = useState<AppData | null>(null);
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month');
  const [sortKey, setSortKey] = useState<SortKey>('totalFte');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData().then(setData);
  }, []);

  useEffect(() => {
    const handler = () => loadData().then(setData);
    window.addEventListener('allocations-updated', handler);
    return () => window.removeEventListener('allocations-updated', handler);
  }, []);

  const periodBounds = useMemo(() => getDefaultPeriodBounds(viewPeriod), [viewPeriod]);

  const activeProjects = useMemo(
    () => (data?.projects.filter(p => p.status === 'Active') ?? []),
    [data]
  );

  const membersWithBreakdown = useMemo(() => {
    if (!data) return [];
    return data.users.map(user => {
      const totalFte = getMemberTotalPeakFte(data, user, viewPeriod, periodBounds.start, periodBounds.end);
      const remaining = Math.max(0, 100 - totalFte);
      const status = getBandwidthStatus(totalFte);
      const projectIds = Array.from(
        new Set([
          ...(data.allocations ?? []).filter(a => a.userId === user.id).map(a => a.projectId),
          ...(data.tasks ?? []).filter(t => (t.assigneeIds ?? []).includes(user.id)).map(t => t.projectId),
        ])
      ).filter(pid => activeProjects.some(p => p.id === pid));
      const projectAllocs = projectIds.map(projectId => {
        const project = data.projects.find(p => p.id === projectId);
        const alloc = data.allocations.find(a => a.projectId === projectId && a.userId === user.id);
        const ftePercent = getMemberProjectFtePercent(data, user, projectId, viewPeriod, periodBounds.start, periodBounds.end);
        return {
          projectId,
          projectName: project?.name ?? 'Unknown',
          roleOnProject: alloc?.roleOnProject,
          ftePercent,
        };
      });
      return {
        user,
        totalFte,
        remaining,
        status,
        projectAllocs,
        projectCount: projectAllocs.length,
      };
    });
  }, [data, viewPeriod, periodBounds, activeProjects]);

  const filtered = useMemo(() => {
    let list = membersWithBreakdown;
    if (filterRole !== 'all') {
      list = list.filter(m => m.user.role === filterRole);
    }
    if (filterStatus !== 'all') {
      list = list.filter(m => m.status === filterStatus);
    }
    if (filterProjectId !== 'all') {
      list = list.filter(m => m.projectAllocs.some(a => a.projectId === filterProjectId));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(m => m.user.name.toLowerCase().includes(q));
    }
    return list;
  }, [membersWithBreakdown, filterRole, filterStatus, filterProjectId, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return mult * a.user.name.localeCompare(b.user.name);
        case 'totalFte':
          return mult * (a.totalFte - b.totalFte);
        case 'remaining':
          return mult * (a.remaining - b.remaining);
        case 'projects':
          return mult * (a.projectCount - b.projectCount);
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const summary = useMemo(() => {
    const list = membersWithBreakdown;
    return {
      total: list.length,
      available: list.filter(m => m.status === 'available').length,
      atCapacity: list.filter(m => m.status === 'full').length,
      approaching: list.filter(m => m.status === 'approaching').length,
      overallocated: list.filter(m => m.status === 'overallocated').length,
    };
  }, [membersWithBreakdown]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (!isManagerOrAbove) {
    return (
      <div className="text-center py-12 text-muted-foreground">Access restricted</div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Global Bandwidth Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Team capacity and FTE % across all active projects
        </p>
      </div>

      {/* Summary bar — frosted stat chips */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl px-4 py-2.5 bg-background/60 backdrop-blur-md border border-white/10 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Users className="h-3.5 w-3.5" />
            Total
          </div>
          <p className="text-lg font-bold text-foreground mt-0.5">{summary.total}</p>
          <p className="text-[10px] text-muted-foreground">headcount</p>
        </div>
        <div className="rounded-xl px-4 py-2.5 bg-emerald-500/10 backdrop-blur-md border border-emerald-400/20 shadow-sm">
          <div className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Available</div>
          <p className="text-lg font-bold text-foreground mt-0.5">{summary.available}</p>
          <p className="text-[10px] text-muted-foreground">&lt;75% FTE</p>
        </div>
        <div className="rounded-xl px-4 py-2.5 bg-amber-500/10 backdrop-blur-md border border-amber-400/20 shadow-sm">
          <div className="text-amber-600 dark:text-amber-400 text-xs font-medium">Approaching</div>
          <p className="text-lg font-bold text-foreground mt-0.5">{summary.approaching}</p>
          <p className="text-[10px] text-muted-foreground">75–99%</p>
        </div>
        <div className="rounded-xl px-4 py-2.5 bg-orange-500/10 backdrop-blur-md border border-orange-400/20 shadow-sm">
          <div className="text-orange-600 dark:text-orange-400 text-xs font-medium">At capacity</div>
          <p className="text-lg font-bold text-foreground mt-0.5">{summary.atCapacity}</p>
          <p className="text-[10px] text-muted-foreground">100%</p>
        </div>
        <div className="rounded-xl px-4 py-2.5 bg-red-500/10 backdrop-blur-md border border-red-400/20 shadow-sm">
          <div className="text-red-600 dark:text-red-400 text-xs font-medium">Overallocated</div>
          <p className="text-lg font-bold text-foreground mt-0.5">{summary.overallocated}</p>
          <p className="text-[10px] text-muted-foreground">&gt;100%</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/30 backdrop-blur-sm border border-white/10 px-4 py-3">
        <div className="relative flex-1 min-w-[160px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-9 bg-background/50 border-white/10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">View</Label>
          <Select value={viewPeriod} onValueChange={v => setViewPeriod(v as ViewPeriod)}>
            <SelectTrigger className="w-[100px] h-9 bg-background/50 border-white/10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="halfyear">Half year</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Role</Label>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[120px] h-9 bg-background/50 border-white/10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">FTE status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9 bg-background/50 border-white/10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FTE_STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Project</Label>
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="w-[160px] h-9 bg-background/50 border-white/10 text-xs">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {activeProjects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border-white/10 bg-card/80 backdrop-blur-sm shadow-lg overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  <th className="w-10 py-3" />
                  <th
                    className="text-left py-3 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('name')}
                  >
                    Name
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                  <th
                    className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('totalFte')}
                  >
                    Total FTE %
                  </th>
                  <th
                    className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('remaining')}
                  >
                    Remaining %
                  </th>
                  <th
                    className="text-right py-3 px-4 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => toggleSort('projects')}
                  >
                    Projects
                  </th>
                  <th className="py-3 px-4 font-medium text-muted-foreground min-w-[140px]">
                    Load
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ user, totalFte, remaining, status, projectAllocs, projectCount }) => {
                  const isExpanded = expandedIds.has(user.id);
                  return (
                    <Fragment key={user.id}>
                      <tr
                        key={user.id}
                        className={cn(
                          'border-b border-border/40 hover:bg-muted/20 transition-colors',
                          status === 'overallocated' && 'bg-red-500/5'
                        )}
                      >
                        <td className="py-2 px-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => toggleExpanded(user.id)}
                            disabled={projectAllocs.length === 0}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ backgroundColor: user.avatarColor, color: 'white' }}
                            >
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="font-medium text-foreground/95">{user.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-muted-foreground capitalize">{user.role}</td>
                        <td className="py-2 px-4 text-right font-medium">{Math.round(totalFte)}%</td>
                        <td className="py-2 px-4 text-right text-muted-foreground">{Math.round(remaining)}%</td>
                        <td className="py-2 px-4 text-right text-muted-foreground">{projectCount}</td>
                        <td className="py-2 px-4 min-w-[140px]">
                          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', loadBarClass(totalFte))}
                              style={{ width: `${Math.min(100, totalFte)}%` }}
                            />
                          </div>
                          {totalFte > 100 && (
                            <p className="text-[10px] text-red-500 font-medium mt-0.5">{Math.round(totalFte)}%</p>
                          )}
                        </td>
                      </tr>
                      {isExpanded && projectAllocs.length > 0 && (
                        <tr key={`${user.id}-exp`} className="bg-muted/10 border-b border-border/30">
                          <td className="py-0" />
                          <td colSpan={7} className="py-2 px-4 pl-12">
                            <div className="rounded-lg border border-border/40 bg-background/30 divide-y divide-border/30 overflow-hidden">
                              <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                                <span>Project</span>
                                <span className="text-right">Role</span>
                                <span className="text-right">FTE %</span>
                              </div>
                              {projectAllocs.map(a => (
                                <div
                                  key={a.projectId}
                                  className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-2 text-xs"
                                >
                                  <span className="text-foreground/90">{a.projectName}</span>
                                  <span className="text-right text-muted-foreground">{a.roleOnProject ?? '—'}</span>
                                  <span className="text-right font-medium">{a.ftePercent}%</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No team members match the current filters
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
