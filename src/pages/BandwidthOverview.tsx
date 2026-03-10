import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSimulationOptional } from '@/contexts/SimulationContext';
import { genId, loadData, saveData, updateItem } from '@/lib/store';
import type { AppData, SkillTaxonomy, User } from '@/lib/types';
import { getBandwidthStatus, computeProjectFteFromPhases } from '@/lib/fte';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getDefaultPeriodBounds,
  getCapacityConflict,
  type ViewPeriod as BandwidthViewPeriod,
} from '@/lib/bandwidth';
import { getBandwidthHistory, getChangeTypeLabel } from '@/lib/bandwidthConflicts';
import { getSavedSimulations } from '@/lib/simulation';
import { listSharedByOwner, revokeSharedSimulation, getShareUrl } from '@/lib/sharedSimulations';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, Users, Search, FlaskConical, History, Share2, ExternalLink, Ban, AlertTriangle } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { RoleSkillInlineEditor } from '@/components/RoleSkillInlineEditor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getMemberRoleSkillHistory, logMemberRoleSkillHistory } from '@/lib/memberRoleSkillHistory';

type ViewPeriod = BandwidthViewPeriod;
type SortKey = 'name' | 'totalFte' | 'remaining' | 'projects';
type PrimaryRoleFilter = 'all' | 'unassigned' | 'assigned';
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
  const { isManagerOrAbove, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const simulation = useSimulationOptional();
  const [data, setData] = useState<AppData | null>(null);
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month');
  const [sortKey, setSortKey] = useState<SortKey>('totalFte');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [filterPrimaryRole, setFilterPrimaryRole] = useState<PrimaryRoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sharedRefreshKey, setSharedRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRoleId, setBulkRoleId] = useState<string>('');
  const [bulkSkillIds, setBulkSkillIds] = useState<string[]>([]);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get('unclassified') === '1') {
      setFilterPrimaryRole('unassigned');
    }
  }, [location.search]);

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

  const taxonomy = useMemo(() => {
    const org = data?.organisations?.[0];
    const orgId = org?.id;
    const roleOptions = (data?.roles ?? [])
      .filter(r => (!orgId || r.orgId === orgId) && !r.archived)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const skillOptions = (data?.skills ?? [])
      .filter(s => (!orgId || s.orgId === orgId) && !s.archived)
      .slice()
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
    return { roleOptions, skillOptions };
  }, [data?.organisations, data?.roles, data?.skills]);

  const resolve = useMemo(() => {
    const orgId = data?.organisations?.[0]?.id;
    const roles = (data?.roles ?? []).filter(r => (!orgId || r.orgId === orgId));
    const skills = (data?.skills ?? []).filter(s => (!orgId || s.orgId === orgId));
    return {
      roleNameById: new Map(roles.map(r => [r.id, r.name] as const)),
      skillNameById: new Map(skills.map(s => [s.id, s.name] as const)),
    };
  }, [data?.organisations, data?.roles, data?.skills]);

  const handleCreateSkill = useCallback(async (nameRaw: string): Promise<SkillTaxonomy> => {
    if (!data) throw new Error('No data loaded');
    const name = nameRaw.trim();
    if (!name) throw new Error('Skill name required');
    const orgId = data.organisations?.[0]?.id ?? 'org-1';
    const existing = (data.skills ?? []).find(s => s.orgId === orgId && s.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const now = new Date().toISOString();
    const maxOrder = Math.max(-1, ...(data.skills ?? []).filter(s => s.orgId === orgId).map(s => s.order ?? -1));
    const created: SkillTaxonomy = {
      id: genId(),
      name,
      orgId,
      archived: false,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    const nextData: AppData = { ...data, skills: [...(data.skills ?? []), created] };
    setData(nextData);
    saveData(nextData);
    window.dispatchEvent(new Event('allocations-updated'));
    return created;
  }, [data]);

  const handleSaveMemberMeta = useCallback(async (userId: string, patch: { primaryRole?: string | null; skills?: string[] }) => {
    const actorId = currentUser?.id;
    setData((prev) => {
      if (!prev) return prev;
      const nextUsers = prev.users.map(u => (u.id === userId ? { ...u, ...patch } : u));
      return { ...prev, users: nextUsers };
    });
    const u = data?.users.find(x => x.id === userId);
    if (u) {
      // per-member history
      if ('primaryRole' in patch) {
        const prevName = u.primaryRole ? (resolve.roleNameById.get(u.primaryRole) ?? 'Unknown') : 'No role';
        const nextName = patch.primaryRole ? (resolve.roleNameById.get(patch.primaryRole) ?? 'Unknown') : 'No role';
        if ((u.primaryRole ?? null) !== (patch.primaryRole ?? null)) {
          logMemberRoleSkillHistory(userId, {
            actorUserId: actorId,
            type: 'role_changed',
            message: `Role changed: ${prevName} → ${nextName}.`,
            meta: { prevRoleId: u.primaryRole ?? null, nextRoleId: patch.primaryRole ?? null },
          });
        }
      }
      if ('skills' in patch && Array.isArray(patch.skills)) {
        const prev = Array.isArray(u.skills) ? u.skills : [];
        const next = patch.skills;
        const added = next.filter(id => !prev.includes(id));
        const removed = prev.filter(id => !next.includes(id));
        if (added.length) {
          logMemberRoleSkillHistory(userId, {
            actorUserId: actorId,
            type: 'skills_added',
            message: `Skills added: ${added.map(id => resolve.skillNameById.get(id) ?? 'Unknown').join(', ')}.`,
            meta: { added },
          });
        }
        if (removed.length) {
          logMemberRoleSkillHistory(userId, {
            actorUserId: actorId,
            type: 'skills_removed',
            message: `Skills removed: ${removed.map(id => resolve.skillNameById.get(id) ?? 'Unknown').join(', ')}.`,
            meta: { removed },
          });
        }
      }
      await updateItem('users', { ...u, ...patch });
      window.dispatchEvent(new Event('allocations-updated'));
    }
  }, [data?.users]);

  const membersWithBreakdown = useMemo(() => {
    if (!data) return [];
    // Pre-compute FTE demand per active project from phases
    const WEEKS_PER_MONTH = 52 / 12;
    const projectFteDemandMap = new Map<string, number>();
    for (const project of activeProjects) {
      const phases = (data.phases ?? []).filter(ph => ph.projectId === project.id);
      if (phases.length > 0) {
        projectFteDemandMap.set(
          project.id,
          computeProjectFteFromPhases(
            phases.map(ph => ({
              durationMonths: (ph.plannedDurationWeeks ?? 0) / WEEKS_PER_MONTH,
              ftePercent: ph.plannedFtePercent ?? 0,
            }))
          )
        );
      }
    }

    /** Resolved FTE contribution of an allocation to the person's bandwidth */
    const resolveAllocFte = (a: { projectId: string; projectSharePercent?: number; ftePercent: number }) => {
      if (a.projectSharePercent != null) {
        const demand = projectFteDemandMap.get(a.projectId) ?? 0;
        return Math.round((a.projectSharePercent * demand) / 100);
      }
      return a.ftePercent || 0;
    };

    return data.users.map(user => {
      const taskFte = getMemberTotalPeakFte(data, user, viewPeriod, periodBounds.start, periodBounds.end);
      // Allocation-based FTE: sum of each person's project-share contribution across active projects
      const allocFte = (data.allocations ?? [])
        .filter(a => a.userId === user.id && activeProjects.some(p => p.id === a.projectId))
        .reduce((sum, a) => sum + resolveAllocFte(a), 0);
      // Use the higher of task-based (actual hours) and allocation-based (planned ownership)
      const totalFte = Math.max(taskFte, allocFte);
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
        const taskFtePercent = getMemberProjectFtePercent(data, user, projectId, viewPeriod, periodBounds.start, periodBounds.end);
        const allocatedFte = alloc ? resolveAllocFte(alloc) : 0;
        const conflict = getCapacityConflict(taskFtePercent, allocatedFte);
        return {
          projectId,
          projectName: project?.name ?? 'Unknown',
          roleOnProject: alloc?.roleOnProject,
          projectSharePercent: alloc?.projectSharePercent,
          ftePercent: taskFtePercent,
          capacity: allocatedFte,
          overCapacity: conflict.status === 'exceeds',
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
    if (filterPrimaryRole !== 'all') {
      if (filterPrimaryRole === 'unassigned') {
        list = list.filter(m => !m.user.primaryRole);
      } else {
        list = list.filter(m => Boolean(m.user.primaryRole));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(m => m.user.name.toLowerCase().includes(q));
    }
    return list;
  }, [membersWithBreakdown, filterRole, filterStatus, filterProjectId, filterPrimaryRole, searchQuery]);

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

  const visibleIds = useMemo(() => sorted.map(r => r.user.id), [sorted]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) visibleIds.forEach(id => next.add(id));
      else visibleIds.forEach(id => next.delete(id));
      return next;
    });
  };

  const bulkAssignRole = async () => {
    if (!data || !bulkRoleId || selectedIds.size === 0) return;
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    const nextUsers = data.users.map(u => (selectedIds.has(u.id) ? { ...u, primaryRole: bulkRoleId, updatedAt: now } : u));
    setData({ ...data, users: nextUsers });
    for (const id of ids) {
      const u = data.users.find(x => x.id === id);
      if (u) {
        const prevName = u.primaryRole ? (resolve.roleNameById.get(u.primaryRole) ?? 'Unknown') : 'No role';
        const nextName = resolve.roleNameById.get(bulkRoleId) ?? 'Role';
        logMemberRoleSkillHistory(id, {
          actorUserId: currentUser?.id,
          type: 'bulk_assign',
          message: `Role bulk-assigned: ${prevName} → ${nextName}.`,
          meta: { prevRoleId: u.primaryRole ?? null, nextRoleId: bulkRoleId },
        });
        await updateItem('users', { ...u, primaryRole: bulkRoleId, updatedAt: now });
      }
    }
    window.dispatchEvent(new Event('allocations-updated'));
    setSelectedIds(new Set());
    setBulkRoleId('');
  };

  const bulkAssignSkills = async () => {
    if (!data || bulkSkillIds.length === 0 || selectedIds.size === 0) return;
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    const nextUsers = data.users.map(u => {
      if (!selectedIds.has(u.id)) return u;
      const existing = Array.isArray(u.skills) ? u.skills : [];
      const merged = Array.from(new Set([...existing, ...bulkSkillIds]));
      return { ...u, skills: merged, updatedAt: now };
    });
    setData({ ...data, users: nextUsers });
    for (const id of ids) {
      const u = data.users.find(x => x.id === id);
      if (u) {
        const existing = Array.isArray(u.skills) ? u.skills : [];
        const merged = Array.from(new Set([...existing, ...bulkSkillIds]));
        const added = merged.filter(x => !existing.includes(x));
        if (added.length) {
          logMemberRoleSkillHistory(id, {
            actorUserId: currentUser?.id,
            type: 'bulk_assign',
            message: `Skills bulk-added: ${added.map(sid => resolve.skillNameById.get(sid) ?? 'Unknown').join(', ')}.`,
            meta: { added },
          });
        }
        await updateItem('users', { ...u, skills: merged, updatedAt: now });
      }
    }
    window.dispatchEvent(new Event('allocations-updated'));
    setSelectedIds(new Set());
    setBulkSkillIds([]);
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

  const handleRunSimulation = () => {
    if (!data) return;
    simulation?.enterSimulation(data);
    navigate('/simulation', { state: { appData: data } });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Bandwidth Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Team capacity and FTE % across all active projects
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-white/20 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => {
            if (data) {
              simulation?.enterSimulation(data);
              navigate('/simulation?tab=insights', { state: { appData: data } });
            } else {
              navigate('/simulation?tab=insights');
            }
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Planning Insights
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 shrink-0"
          onClick={handleRunSimulation}
        >
          <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
          Run Simulation
        </Button>
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

      {/* Bulk actions (only shown when filtering unassigned roles) */}
      {filterPrimaryRole === 'unassigned' && (
        <div className="rounded-xl bg-background/60 backdrop-blur-md border border-white/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selectedCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Bulk assign role</Label>
            <Select value={bulkRoleId} onValueChange={setBulkRoleId}>
              <SelectTrigger className="w-[200px] h-9 bg-background/50 border-white/10 text-xs">
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {taxonomy.roleOptions.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9" disabled={selectedCount === 0 || !bulkRoleId} onClick={bulkAssignRole}>
              Apply
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Bulk add skills</Label>
            <Select value={bulkSkillIds[0] ?? ''} onValueChange={(v) => {
              if (!v) return;
              setBulkSkillIds(prev => (prev.includes(v) ? prev : [...prev, v]));
            }}>
              <SelectTrigger className="w-[220px] h-9 bg-background/50 border-white/10 text-xs">
                <SelectValue placeholder="Add a skill…" />
              </SelectTrigger>
              <SelectContent>
                {taxonomy.skillOptions.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.category ? `${s.category} · ${s.name}` : s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1">
              {bulkSkillIds.slice(0, 4).map(id => (
                <span key={id} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-muted/20 text-muted-foreground">
                  {resolve.skillNameById.get(id) ?? 'Skill'}
                </span>
              ))}
              {bulkSkillIds.length > 4 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-background/40 text-muted-foreground">
                  +{bulkSkillIds.length - 4}
                </span>
              )}
            </div>
            <Button size="sm" className="h-9" disabled={selectedCount === 0 || bulkSkillIds.length === 0} onClick={bulkAssignSkills}>
              Apply
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setSelectedIds(new Set())} disabled={selectedCount === 0}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Profile</Label>
          <Select value={filterPrimaryRole} onValueChange={(v) => setFilterPrimaryRole(v as PrimaryRoleFilter)}>
            <SelectTrigger className="w-[150px] h-9 bg-background/50 border-white/10 text-xs">
              <SelectValue placeholder="All profiles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unassigned">No role assigned</SelectItem>
              <SelectItem value="assigned">Role assigned</SelectItem>
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
                  <th className="w-10 py-3 px-2">
                    {filterPrimaryRole === 'unassigned' && (
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(v) => toggleSelectAllVisible(Boolean(v))}
                        aria-label="Select all visible members"
                      />
                    )}
                  </th>
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
                          {filterPrimaryRole === 'unassigned' && (
                            <div className="mt-1">
                              <Checkbox
                                checked={selectedIds.has(user.id)}
                                onCheckedChange={(v) => toggleSelect(user.id, Boolean(v))}
                                aria-label={`Select ${user.name}`}
                              />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ backgroundColor: user.avatarColor, color: 'white' }}
                            >
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-foreground/95 truncate">{user.name}</span>
                                <RoleSkillInlineEditor
                                  user={user}
                                  roleOptions={taxonomy.roleOptions}
                                  skillOptions={taxonomy.skillOptions}
                                  onSave={(next) => handleSaveMemberMeta(user.id, next)}
                                  onCreateSkill={handleCreateSkill}
                                  align="start"
                                />
                              </div>
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {user.primaryRole ? (resolve.roleNameById.get(user.primaryRole) ?? 'Unknown role') : 'No role assigned'}
                                </span>
                                <TooltipProvider>
                                  {(() => {
                                    const skillIds = Array.isArray(user.skills) ? user.skills : [];
                                    const names = skillIds.map(id => resolve.skillNameById.get(id) ?? 'Unknown').filter(Boolean);
                                    const show = names.slice(0, 3);
                                    const more = Math.max(0, names.length - show.length);
                                    return (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {show.map((n) => (
                                          <span key={n} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-muted/20 text-muted-foreground">
                                            {n}
                                          </span>
                                        ))}
                                        {more > 0 && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-background/40 text-muted-foreground cursor-default">
                                                +{more} more
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-background/90 backdrop-blur border-white/10">
                                              <p className="text-xs text-foreground/90">{names.join(', ')}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </TooltipProvider>
                              </div>
                            </div>
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
                              <div className="grid grid-cols-[1fr_70px_80px_80px_80px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                                <span>Project</span>
                                <span className="text-right">Share</span>
                                <span className="text-right">Allocated FTE</span>
                                <span className="text-right">Task FTE</span>
                                <span className="text-right" />
                              </div>
                              {projectAllocs.map(a => (
                                <div
                                  key={a.projectId}
                                  className="grid grid-cols-[1fr_70px_80px_80px_80px] gap-2 px-3 py-2 text-xs items-center"
                                >
                                  <span className="text-foreground/90">{a.projectName}</span>
                                  <span className="text-right text-muted-foreground">
                                    {a.projectSharePercent != null ? `${a.projectSharePercent}%` : '—'}
                                  </span>
                                  <span className="text-right text-muted-foreground">{a.capacity}%</span>
                                  <span className={cn('text-right font-medium', a.overCapacity && 'text-amber-600 dark:text-amber-400')}>{Math.round(a.ftePercent)}%</span>
                                  <span className="text-right">
                                    {a.overCapacity && (
                                      <span className="text-[10px] text-amber-600/90 dark:text-amber-400/90">Over capacity</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {(() => {
                              const history = getBandwidthHistory(user.id);
                              if (history.length === 0) return null;
                              return (
                                <div className="mt-2 rounded-lg border border-border/30 bg-background/20 px-3 py-2">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Bandwidth history</p>
                                  <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {history.slice(0, 8).map((e) => (
                                      <p key={e.id} className="text-[10px] text-muted-foreground/80">
                                        {getChangeTypeLabel(e.changeType)} on {e.sourceProjectName} — {Math.round(e.previousTotalFte)}% → {Math.round(e.newTotalFte)}% · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {(() => {
                              const roleSkillHistory = getMemberRoleSkillHistory(user.id);
                              if (roleSkillHistory.length === 0) return null;
                              return (
                                <div className="mt-2 rounded-lg border border-border/30 bg-background/20 px-3 py-2">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Role &amp; skill history
                                  </p>
                                  <div className="space-y-1 max-h-28 overflow-y-auto">
                                    {roleSkillHistory.slice(0, 10).map((e) => (
                                      <p key={e.id} className="text-[10px] text-muted-foreground/80">
                                        {e.message} · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
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

      {/* Shared simulations (by me) */}
      {currentUser && (() => {
        const allShared = listSharedByOwner(currentUser.id);
        const shared = allShared.filter(
          (s) => !s.revokedAt && (!s.expiresAt || new Date(s.expiresAt) >= new Date())
        );
        if (shared.length === 0) return null;
        return (
          <Card className="border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2 mb-3">
                <Share2 className="h-4 w-4 text-muted-foreground" />
                Shared simulations
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Simulations you shared for review. Revoke to invalidate the link.
              </p>
              <ul className="space-y-2">
                {shared.slice(0, 10).map((snap) => {
                  const approved = snap.reviewers.filter((r) => r.status === 'approved').length;
                  const pending = snap.reviewers.filter((r) => r.status === 'pending').length;
                  const requested = snap.reviewers.filter((r) => r.status === 'changes_requested').length;
                  return (
                    <li
                      key={snap.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 border border-white/10 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground/90 truncate">{snap.projectLabel} — {snap.steps.length} steps</p>
                        <p className="text-muted-foreground/70 mt-0.5">
                          {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
                          {snap.reviewers.length > 0 && ` · ${approved} approved, ${pending} pending, ${requested} requested`}
                          {snap.applied && ' · Applied'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { window.open(getShareUrl(snap.id), '_blank'); }}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        {!snap.revokedAt && !(snap.expiresAt && new Date(snap.expiresAt) < new Date()) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              revokeSharedSimulation(snap.id, currentUser.id);
                              setSharedRefreshKey((k) => k + 1);
                            }}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })()}

      {/* Saved Simulations */}
      {(() => {
        const saved = getSavedSimulations();
        if (saved.length === 0) return null;
        return (
          <Card className="border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-foreground/90 flex items-center gap-2 mb-3">
                <History className="h-4 w-4 text-muted-foreground" />
                Saved Simulations
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Reload a past simulation to re-run or modify it. Snapshots are retained for 30 days.
              </p>
              <ul className="space-y-2">
                {saved.slice(0, 10).map((snap) => (
                  <li
                    key={snap.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 border border-white/10 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground/90 truncate">{snap.summary}</p>
                      <p className="text-muted-foreground/70 mt-0.5">
                        {snap.applied ? 'Applied' : 'Discarded'} · {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                      onClick={async () => {
                        const fresh = await loadData();
                        simulation?.enterSimulationWithSteps(fresh, snap.steps);
                        navigate('/simulation', { state: { appData: fresh, steps: snap.steps } });
                      }}
                    >
                      <FlaskConical className="h-3.5 w-3.5 mr-1" />
                      Reload
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
