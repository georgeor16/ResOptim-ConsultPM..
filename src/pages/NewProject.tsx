import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loadData, saveData, genId } from '@/lib/store';
import type { ProjectCategory, ProjectStatus, Priority, Allocation, Phase, Project } from '@/lib/types';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
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

const categories: ProjectCategory[] = ['Strategy', 'Research', 'Innovation Ecosystem', 'Quantum/Deep Tech', 'Scaleup Support', 'Report', 'Event', 'Scouting', 'Other'];
const priorities: Priority[] = ['High', 'Medium', 'Low'];
const statuses: ProjectStatus[] = ['Active', 'On Hold', 'Completed'];

interface TeamAllocation {
  userId: string;
  ftePercent: number;
  agreedMonthlyHours: number;
  billableHourlyRate: number;
}

interface PhaseEntry {
  name: string;
  durationWeeks: number;
  ftePercent: number;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { isManagerOrAbove } = useAuth();
  const data = loadData();

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('Strategy');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [monthlyFee, setMonthlyFee] = useState('');
  const [projectCurrency, setProjectCurrency] = useState<string>('USD');
  const [allocations, setAllocations] = useState<TeamAllocation[]>([]);
  const [phaseEntries, setPhaseEntries] = useState<PhaseEntry[]>([]);

  const template = getTemplateForCategory(category);

  // Auto-fill when category changes to a templated one
  useEffect(() => {
    if (template) {
      setPhaseEntries(template.phases.map(p => ({ ...p })));
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

  if (!isManagerOrAbove) {
    navigate('/');
    return null;
  }

  const addAllocation = () => {
    const unassigned = data.users.filter(u => !allocations.some(a => a.userId === u.id));
    if (unassigned.length === 0) return;
    const user = unassigned[0];
    setAllocations([...allocations, {
      userId: user.id,
      ftePercent: 20,
      agreedMonthlyHours: 32,
      billableHourlyRate: user.billableHourlyRate,
    }]);
  };

  const updateAllocation = (idx: number, field: keyof TeamAllocation, value: string | number) => {
    const updated = [...allocations];
    if (field === 'userId') {
      const user = data.users.find(u => u.id === value);
      updated[idx] = { ...updated[idx], userId: value as string, billableHourlyRate: user?.billableHourlyRate || 0 };
    } else {
      updated[idx] = { ...updated[idx], [field]: Number(value) };
    }
    setAllocations(updated);
  };

  const removeAllocation = (idx: number) => {
    setAllocations(allocations.filter((_, i) => i !== idx));
  };

  const updatePhaseEntry = (idx: number, field: keyof PhaseEntry, value: string | number) => {
    const updated = [...phaseEntries];
    if (field === 'name') {
      updated[idx] = { ...updated[idx], name: value as string };
    } else {
      updated[idx] = { ...updated[idx], [field]: Number(value) };
    }
    setPhaseEntries(updated);
  };

  const addPhaseEntry = () => {
    setPhaseEntries([...phaseEntries, { name: '', durationWeeks: 1, ftePercent: 50 }]);
  };

  const removePhaseEntry = (idx: number) => {
    setPhaseEntries(phaseEntries.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!name || !client || !startDate || !endDate || !monthlyFee) return;

    const projectId = genId();
    const newProject: Project = {
      id: projectId,
      name,
      client,
      category,
      priority,
      status,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      monthlyFee: parseFloat(monthlyFee),
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

    const newPhases: Phase[] = phaseEntries.map((p, i) => ({
      id: genId(),
      projectId,
      name: p.name,
      order: i,
    }));

    const current = loadData();
    current.projects.push(newProject);
    current.allocations.push(...newAllocations);
    current.phases.push(...newPhases);
    saveData(current);

    navigate(`/projects/${projectId}`);
  };

  const isValid = name && client && startDate && endDate && monthlyFee;

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
              <Label>Monthly Fee *</Label>
              <div className="flex gap-2">
                <Select value={projectCurrency} onValueChange={setProjectCurrency}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)} placeholder="e.g. 30000" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Template Preview */}
      {template && <TemplatePreview template={template} />}

      {/* Phases */}
      <Card>
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
              <div className="grid grid-cols-[1fr_100px_100px_40px] gap-3 text-xs font-medium text-muted-foreground px-1">
                <span>Phase Name</span>
                <span>Duration (wks)</span>
                <span>FTE %</span>
                <span />
              </div>
              {phaseEntries.map((phase, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px_40px] gap-3 items-center">
                  <Input value={phase.name} onChange={e => updatePhaseEntry(idx, 'name', e.target.value)} placeholder="Phase name" />
                  <Input type="number" min={0.5} step={0.5} value={phase.durationWeeks} onChange={e => updatePhaseEntry(idx, 'durationWeeks', e.target.value)} />
                  <Input type="number" min={0} max={100} value={phase.ftePercent} onChange={e => updatePhaseEntry(idx, 'ftePercent', e.target.value)} />
                  <Button variant="ghost" size="icon" onClick={() => removePhaseEntry(idx)}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
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
            <p className="text-sm text-muted-foreground text-center py-6">No team members allocated yet. Click "Add Member" to assign people.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_100px_120px_120px_40px] gap-3 text-xs font-medium text-muted-foreground px-1">
                <span>Member</span>
                <span>FTE %</span>
                <span>Monthly Hours</span>
                <span>Hourly Rate (€)</span>
                <span />
              </div>
              {allocations.map((alloc, idx) => {
                const assignedIds = allocations.map(a => a.userId);
                const availableUsers = data.users.filter(u => u.id === alloc.userId || !assignedIds.includes(u.id));
                return (
                  <div key={idx} className="grid grid-cols-[1fr_100px_120px_120px_40px] gap-3 items-center">
                    <Select value={alloc.userId} onValueChange={v => updateAllocation(idx, 'userId', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} max={100} value={alloc.ftePercent} onChange={e => updateAllocation(idx, 'ftePercent', e.target.value)} />
                    <Input type="number" min={0} value={alloc.agreedMonthlyHours} onChange={e => updateAllocation(idx, 'agreedMonthlyHours', e.target.value)} />
                    <Input type="number" min={0} value={alloc.billableHourlyRate} onChange={e => updateAllocation(idx, 'billableHourlyRate', e.target.value)} />
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
