import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loadData, saveData, saveDataToSupabase, genId } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { AppData } from '@/lib/types';
import type {
  ProjectCategory,
  ProjectStatus,
  Priority,
  Allocation,
  Phase,
  Project,
  FeeType,
  AllocationContributionMode,
} from '@/lib/types';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { computeProjectFteFromPhases, computeUserUtilization, deriveAllocationFteFromMode } from '@/lib/fte';
import { getTemplateForCategory } from '@/lib/templates';
import TemplatePreview from '@/components/TemplatePreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, ArrowLeft, Plus, X } from 'lucide-react';
import { format, addWeeks } from 'date-fns';
import { cn } from '@/lib/utils';
import { logActivityEvent } from '@/lib/notifications';

const categories: ProjectCategory[] = ['Scouting', 'Event', 'Full Report', 'Light Report', 'Other'];
const priorities: Priority[] = ['High', 'Medium', 'Low'];
const statuses: ProjectStatus[] = ['Active', 'On Hold', 'Completed'];

const HOURS_PER_WEEK = 40;
const DAYS_PER_MONTH = 30.44;
const WEEKS_PER_MONTH = 4.345;
const HOURS_PER_MONTH = 730; // approx. working hours per month

type DurationUnit = 'hours' | 'days' | 'weeks' | 'months' | 'quarters' | 'years';
type FteViewBasis = 'week' | 'month' | 'quarter' | 'halfyear' | 'year';

interface TeamAllocation {
  userId: string;
  ftePercent: number;
  contributionMode: AllocationContributionMode;
  agreedMonthlyHours: number;
  billableHourlyRate: number;
}

interface PhaseEntry {
  name: string;
  durationValue: number;
  durationUnit: DurationUnit;
  ftePercent: number;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { isManagerOrAbove } = useAuth();
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('Event');
  const [categoryOtherSpec, setCategoryOtherSpec] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [feeType, setFeeType] = useState<FeeType>('monthly');
  const [feeAmount, setFeeAmount] = useState('');
  const [projectCurrency, setProjectCurrency] = useState<string>('USD');
  const [allocations, setAllocations] = useState<TeamAllocation[]>([]);
  const [phaseEntries, setPhaseEntries] = useState<PhaseEntry[]>([]);
  const [fteViewBasis, setFteViewBasis] = useState<FteViewBasis>('month');

  const template = getTemplateForCategory(category);

  const durationToMonths = (value: number, unit: DurationUnit): number => {
    const v = Number(value) || 0;
    switch (unit) {
      case 'hours':
        return v / HOURS_PER_MONTH;
      case 'days':
        return v / DAYS_PER_MONTH;
      case 'weeks':
        return v / WEEKS_PER_MONTH;
      case 'months':
        return v;
      case 'quarters':
        return v * 3;
      case 'years':
        return v * 12;
      default:
        return v;
    }
  };

  const recomputePhaseFte = (entries: PhaseEntry[]): PhaseEntry[] => {
    return entries.map(p => {
      const months = durationToMonths(p.durationValue, p.durationUnit);
      let pct = Math.round(months * 100);
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      return { ...p, ftePercent: pct };
    });
  };

  // Auto-fill when category changes to a templated one
  useEffect(() => {
    if (template) {
      setPhaseEntries(prev =>
        recomputePhaseFte(
          template.phases.map(p => ({
            name: p.name,
            durationValue: p.durationWeeks,
            durationUnit: 'weeks',
            ftePercent: p.ftePercent,
          })),
        ),
      );
      if (startDate) {
        setEndDate(addWeeks(startDate, template.timelineWeeks));
      } else {
        const today = new Date();
        setStartDate(today);
        setEndDate(addWeeks(today, template.timelineWeeks));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Update end date when start date changes if template is active
  useEffect(() => {
    if (template && startDate) {
      setEndDate(addWeeks(startDate, template.timelineWeeks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);

  // When phases change, keep allocations in sync for non-custom modes
  useEffect(() => {
    setAllocations(prev =>
      prev.map((alloc, idx, arr) => {
        if (!alloc.userId || alloc.contributionMode === 'custom') return alloc;
        const updatedList = recomputeAllocationAtIndex(arr as TeamAllocation[], idx);
        return updatedList[idx];
      }),
    );
  }, [phaseEntries]);

  if (!isManagerOrAbove) {
    navigate('/');
    return null;
  }
  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  const userUtilization = computeUserUtilization(data, 'month');

  const computeProjectFte = (): number => {
    if (phaseEntries.length === 0) return 0;
    const phasesForProject = phaseEntries.map(p => ({
      durationMonths: durationToMonths(p.durationValue, p.durationUnit),
      ftePercent: p.ftePercent,
    }));
    return computeProjectFteFromPhases(phasesForProject);
  };

  const recomputeAllocationAtIndex = (list: TeamAllocation[], idx: number): TeamAllocation[] => {
    const next = [...list];
    const alloc = next[idx];
    if (!alloc || !alloc.userId) return next;

    const util = userUtilization[alloc.userId] ?? 0;
    const projectFte = computeProjectFte();

    const fte = deriveAllocationFteFromMode({
      projectFteDemand: projectFte,
      userUtilizationPercent: util,
      mode: alloc.contributionMode || 'full',
      currentFtePercent: alloc.ftePercent,
    });

    const agreedMonthlyHours = Math.round((160 * fte) / 100); // 160h ≈ full month

    next[idx] = {
      ...alloc,
      ftePercent: fte,
      agreedMonthlyHours,
    };
    return next;
  };

  const addAllocation = () => {
    const unassigned = data.users.filter(u => !allocations.some(a => a.userId === u.id));
    if (unassigned.length === 0) return;
    // Pick the user with the most free bandwidth among unassigned
    const ranked = [...unassigned].sort((a, b) => {
      const utilA = userUtilization[a.id] ?? 0;
      const utilB = userUtilization[b.id] ?? 0;
      const freeA = 100 - utilA;
      const freeB = 100 - utilB;
      return freeB - freeA; // highest free first
    });
    const user = ranked[0];

    const base: TeamAllocation[] = [
      ...allocations,
      {
        userId: user.id,
        ftePercent: 0,
        contributionMode: 'full',
        agreedMonthlyHours: 0,
        billableHourlyRate: user.billableHourlyRate,
      },
    ];

    const updated = recomputeAllocationAtIndex(base, base.length - 1);
    setAllocations(updated);
  };

  const updateAllocation = (idx: number, field: keyof TeamAllocation, value: string | number) => {
    let updated: TeamAllocation[] = [...allocations];

    if (field === 'userId') {
      const user = data.users.find(u => u.id === value);
      updated[idx] = {
        ...updated[idx],
        userId: value as string,
        billableHourlyRate: user?.billableHourlyRate || 0,
      };
      updated = recomputeAllocationAtIndex(updated, idx);
    } else if (field === 'contributionMode') {
      updated[idx] = {
        ...updated[idx],
        contributionMode: value as AllocationContributionMode,
      };
      updated = recomputeAllocationAtIndex(updated, idx);
    } else if (field === 'ftePercent') {
      // Manual FTE edit implies custom mode
      const val = Number(value) || 0;
      const clamped = Math.max(0, Math.min(100, val));
      updated[idx] = {
        ...updated[idx],
        contributionMode: 'custom',
        ftePercent: clamped,
        agreedMonthlyHours: Math.round((160 * clamped) / 100),
      };
    } else {
      updated[idx] = { ...updated[idx], [field]: Number(value) };
    }

    setAllocations(updated);
  };

  const removeAllocation = (idx: number) => {
    setAllocations(allocations.filter((_, i) => i !== idx));
  };

  const updatePhaseEntry = (idx: number, field: keyof PhaseEntry, value: string | number) => {
    setPhaseEntries(prev => {
      const updated = [...prev];
      if (field === 'name') {
        updated[idx] = { ...updated[idx], name: value as string };
      } else if (field === 'durationUnit') {
        updated[idx] = { ...updated[idx], durationUnit: value as DurationUnit };
      } else {
        updated[idx] = { ...updated[idx], [field]: Number(value) };
      }
      return recomputePhaseFte(updated);
    });
  };

  const addPhaseEntry = () => {
    setPhaseEntries(prev =>
      recomputePhaseFte([
        ...prev,
        {
          name: '',
          durationValue: 1,
          durationUnit: 'months',
          ftePercent: 0,
        },
      ]),
    );
  };

  const removePhaseEntry = (idx: number) => {
    setPhaseEntries(phaseEntries.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!name || !client || !startDate || !endDate || !feeAmount) return;
    if (category === 'Other' && !categoryOtherSpec.trim()) return;

    const projectId = genId();
    const newProject: Project = {
      id: projectId,
      name,
      client,
      category,
      ...(category === 'Other' && categoryOtherSpec.trim() ? { categoryOtherSpec: categoryOtherSpec.trim() } : {}),
      priority,
      status,
      startDate: format(startDate!, 'yyyy-MM-dd'),
      endDate: format(endDate!, 'yyyy-MM-dd'),
      feeType,
      monthlyFee: parseFloat(feeAmount),
      currency: projectCurrency,
      createdAt: format(new Date(), 'yyyy-MM-dd'),
    };

    const newAllocations: Allocation[] = allocations.map(a => ({
      id: genId(),
      projectId,
      userId: a.userId,
      ftePercent: a.ftePercent,
      agreedMonthlyHours: a.agreedMonthlyHours,
      billableHourlyRate: a.billableHourlyRate,
    }));

    const newPhases: Phase[] = phaseEntries.map((p, i) => {
      const months = durationToMonths(p.durationValue, p.durationUnit);
      const weeks = months * WEEKS_PER_MONTH;
      const plannedEffortHours = weeks * HOURS_PER_WEEK * (Number(p.ftePercent) || 0) / 100;
      return {
        id: genId(),
        projectId,
        name: p.name,
        order: i,
        plannedDurationWeeks: weeks,
        plannedEffortHours,
        plannedFtePercent: p.ftePercent,
      };
    });

    const current = await loadData();
    current.projects.push(newProject);
    current.allocations.push(...newAllocations);
    current.phases.push(...newPhases);
    if (isSupabaseConfigured) {
      await saveDataToSupabase(current);
    } else {
      saveData(current);
    }

    logActivityEvent({
      userId: 'system',
      projectId,
      type: 'project_created',
      message: `Project "${newProject.name}" was created`,
    });

    navigate(`/projects/${projectId}`);
  };

  const isValid = name && client && startDate && endDate && feeAmount && (category !== 'Other' || categoryOtherSpec.trim());

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Project</h1>
          <p className="text-sm text-muted-foreground">Fill in the details to create a new project</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Project Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Market Strategy Review" />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Input value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. TechCorp" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ProjectCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {category === 'Other' && (
              <div className="space-y-2 col-span-full">
                <Label>Specify (required for Other) *</Label>
                <Input
                  value={categoryOtherSpec}
                  onChange={e => setCategoryOtherSpec(e.target.value)}
                  placeholder="e.g. Advisory, Training"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date *{template ? ' (auto)' : ''}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Fee *</Label>
              <div className="flex gap-2 items-center flex-wrap">
                <Select value={projectCurrency} onValueChange={setProjectCurrency}>
                  <SelectTrigger className="w-[90px] shrink-0">{projectCurrency}</SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={feeType} onValueChange={(v) => setFeeType(v as FeeType)}>
                  <SelectTrigger className="w-[110px] shrink-0">{feeType === 'monthly' ? 'Monthly' : 'Project'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder={feeType === 'monthly' ? 'e.g. 30000' : 'e.g. 150000'} className="min-w-[160px] w-40 flex-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Preview */}
      {template && <TemplatePreview template={template} />}

      {/* Phases */}
      <Card
        style={{
          backdropFilter: 'blur(20px)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          borderRadius: 16,
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Phases</CardTitle>
          <Button variant="outline" size="sm" onClick={addPhaseEntry}>
            <Plus className="h-4 w-4 mr-1" /> Add Phase
          </Button>
        </CardHeader>
        <CardContent>
          {phaseEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No phases defined. Select a templated category or add manually.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_220px_1fr_40px] gap-3 text-xs font-medium text-muted-foreground px-1">
                <span>Phase Name</span>
                <span>Duration</span>
                <span>FTE % view</span>
                <span />
              </div>
              {phaseEntries.map((phase, idx) => {
                const months = durationToMonths(phase.durationValue, phase.durationUnit);
                const basePctRaw = months * 100; // per-month %

                let viewRaw: number;
                switch (fteViewBasis) {
                  case 'week':
                    viewRaw = basePctRaw / WEEKS_PER_MONTH;
                    break;
                  case 'quarter':
                    viewRaw = basePctRaw * 3;
                    break;
                  case 'halfyear':
                    viewRaw = basePctRaw * 6;
                    break;
                  case 'year':
                    viewRaw = basePctRaw * 12;
                    break;
                  case 'month':
                  default:
                    viewRaw = basePctRaw;
                }

                let displayPct: string;
                if (viewRaw > 0 && viewRaw < 1) {
                  displayPct = viewRaw.toFixed(2);
                } else {
                  displayPct = Math.round(viewRaw).toString();
                }

                const viewLabel =
                  fteViewBasis === 'week'
                    ? 'week'
                    : fteViewBasis === 'month'
                      ? 'month'
                      : fteViewBasis === 'quarter'
                        ? 'quarter'
                        : fteViewBasis === 'halfyear'
                          ? 'half-year'
                          : 'year';

                return (
                  <div key={idx} className="grid grid-cols-[1fr_220px_1fr_40px] gap-3 items-center">
                  <Input
                    value={phase.name}
                    onChange={e => updatePhaseEntry(idx, 'name', e.target.value)}
                    placeholder="Phase name"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={phase.durationValue}
                      onChange={e => updatePhaseEntry(idx, 'durationValue', e.target.value)}
                      className="w-16"
                    />
                    <Select
                      value={phase.durationUnit}
                      onValueChange={v => updatePhaseEntry(idx, 'durationUnit', v)}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                        <SelectItem value="quarters">Quarters</SelectItem>
                        <SelectItem value="years">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground opacity-70">
                      {displayPct}% / {viewLabel}
                    </span>
                    <Select
                      value={fteViewBasis}
                      onValueChange={v => setFteViewBasis(v as FteViewBasis)}
                    >
                      <SelectTrigger className="h-7 px-2 rounded-full bg-background/40 border border-white/10 text-[11px] text-muted-foreground backdrop-blur-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="quarter">Quarter</SelectItem>
                        <SelectItem value="halfyear">Half Year</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removePhaseEntry(idx)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Allocation */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Team Allocation</CardTitle>
          <Button variant="outline" size="sm" onClick={addAllocation} disabled={allocations.length >= data.users.length}>
            <Plus className="h-4 w-4 mr-1" /> Add Member
          </Button>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No team members allocated yet. Click &quot;Add Member&quot; to assign people.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_150px_120px_40px] gap-3 text-xs font-medium text-muted-foreground px-1">
                <span>Member</span>
                <span>Contribution</span>
                <span>FTE %</span>
                <span />
              </div>
              {allocations.map((alloc, idx) => {
                const assignedIds = allocations.map(a => a.userId);
                const availableUsers = data.users
                  .filter(u => u.id === alloc.userId || !assignedIds.includes(u.id))
                  .map(u => {
                    const util = userUtilization[u.id] ?? 0;
                    const free = Math.max(0, 100 - util);
                    return { ...u, _free: free };
                  })
                  .sort((a, b) => b._free - a._free);

                const currentMode: AllocationContributionMode = alloc.contributionMode || 'full';

                return (
                  <div key={idx} className="grid grid-cols-[1fr_150px_120px_40px] gap-3 items-center">
                    <Select value={alloc.userId} onValueChange={v => updateAllocation(idx, 'userId', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map(u => {
                          const initials = u.name
                            .split(' ')
                            .filter(Boolean)
                            .map(n => n[0])
                            .join('')
                            .toUpperCase();
                          return (
                            <SelectItem key={u.id} value={u.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                  style={{ backgroundColor: u.avatarColor, color: 'white' }}
                                >
                                  {initials}
                                </div>
                                <span>{u.name}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <Select
                      value={currentMode}
                      onValueChange={v => updateAllocation(idx, 'contributionMode', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full-time</SelectItem>
                        <SelectItem value="part">Part-time</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>

                    {currentMode === 'custom' ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={alloc.ftePercent}
                        onChange={e => updateAllocation(idx, 'ftePercent', e.target.value)}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">{alloc.ftePercent}%</div>
                    )}

                    <Button variant="ghost" size="icon" onClick={() => removeAllocation(idx)}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!isValid} className="bg-accent text-accent-foreground hover:bg-accent/90">
          Create Project
        </Button>
      </div>
    </div>
  );
}
