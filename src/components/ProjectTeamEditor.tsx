import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { BandwidthWarning } from '@/components/BandwidthWarning';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { addItem, updateItem, deleteItem, genId, loadData, saveData } from '@/lib/store';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getDefaultPeriodBounds,
  getCapacityConflict,
  getMemberProjectTasksWithFte,
} from '@/lib/bandwidth';
import { getBandwidthStatus } from '@/lib/fte';
import { getTaskDurationHours } from '@/lib/duration';
import { logActivityEvent } from '@/lib/notifications';
import { checkExternalConflictsAfterChange } from '@/lib/bandwidthConflicts';
import { showExternalConflictToast } from '@/components/ConflictResolutionSheet';
import { useSimulationOptional } from '@/contexts/SimulationContext';
import type { AppData, Allocation, Task, User } from '@/lib/types';
import { Plus, Trash2, UserMinus, ArrowRightLeft, ListChecks, ChevronUp, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoleSkillInlineEditor } from '@/components/RoleSkillInlineEditor';

const VIEW_PERIOD = 'month' as const;

const CAPACITY_PRESETS = [25, 50, 75, 100] as const;

function CapacitySelector({
  value,
  onChange,
  className,
  taskFteRequired,
  hasConflict,
}: {
  value: number;
  onChange: (pct: number) => void;
  className?: string;
  taskFteRequired?: number;
  hasConflict?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState(String(value));
  const isPreset = CAPACITY_PRESETS.includes(value as 25 | 50 | 75 | 100);

  useEffect(() => {
    if (!isPreset) {
      setCustom(true);
      setCustomVal(String(value));
    }
  }, [value, isPreset]);

  const content = (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg transition-colors',
        hasConflict && 'ring-1 ring-amber-500/50 bg-amber-500/5',
        hasConflict && value < (taskFteRequired ?? 0) && 'ring-red-500/40 bg-red-500/5',
        className
      )}
    >
      {!custom ? (
        <>
          <div className="inline-flex rounded-lg border border-white/10 bg-background/40 p-0.5">
            {CAPACITY_PRESETS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => onChange(pct)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors',
                  value === pct
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'text-muted-foreground hover:bg-muted/50 border border-transparent'
                )}
              >
                {pct}%
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setCustom(true);
              setCustomVal(String(value));
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
          >
            Custom
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={100}
            step={5}
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onBlur={() => {
              const n = Math.min(100, Math.max(0, Number(customVal) || 0));
              onChange(n);
              setCustomVal(String(n));
              if (CAPACITY_PRESETS.includes(n as 25 | 50 | 75 | 100)) setCustom(false);
            }}
            className="h-8 w-16 text-xs bg-background/50 border-white/10"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <button
            type="button"
            onClick={() => setCustom(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Presets
          </button>
        </div>
      )}
    </div>
  );

  if (hasConflict && taskFteRequired != null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex">{content}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            Current tasks require {Math.round(taskFteRequired)}% — consider raising capacity or reducing task load
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return content;
}

interface ProjectTeamEditorProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  /** Initial data; if not provided, will load on open */
  initialData?: AppData | null;
  /** Called when user clicks "Open project" from Review tasks — e.g. navigate then close modal */
  onNavigateToProject?: (projectId: string) => void;
}

export default function ProjectTeamEditor({
  projectId,
  open,
  onOpenChange,
  onUpdated,
  initialData,
  onNavigateToProject,
}: ProjectTeamEditorProps) {
  const navigate = useNavigate();
  const simulation = useSimulationOptional();
  const [data, setData] = useState<AppData | null>(initialData ?? null);
  const [addUserId, setAddUserId] = useState('');
  const [addCapacity, setAddCapacity] = useState(100);
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignFromUserId, setReassignFromUserId] = useState('');
  const [reassignToUserId, setReassignToUserId] = useState('');
  const [reviewTasksForUserId, setReviewTasksForUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialData) setData(initialData);
      else loadData().then(setData);
    }
  }, [open, initialData]);

  const project = data?.projects.find(p => p.id === projectId);
  const allocations = (data?.allocations ?? []).filter(a => a.projectId === projectId);
  const tasks = (data?.tasks ?? []).filter(t => t.projectId === projectId);
  const periodBounds = project ? getDefaultPeriodBounds(VIEW_PERIOD) : { start: '', end: '' };
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

  const handleCreateSkill = async (nameRaw: string) => {
    if (!data) throw new Error('No data loaded');
    const name = nameRaw.trim();
    if (!name) throw new Error('Skill name required');
    const orgId = data.organisations?.[0]?.id ?? 'org-1';
    const existing = (data.skills ?? []).find(s => s.orgId === orgId && s.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const now = new Date().toISOString();
    const maxOrder = Math.max(-1, ...(data.skills ?? []).filter(s => s.orgId === orgId).map(s => s.order ?? -1));
    const created = { id: genId(), name, orgId, archived: false, order: maxOrder + 1, createdAt: now, updatedAt: now };
    const nextData: AppData = { ...data, skills: [...(data.skills ?? []), created] };
    setData(nextData);
    saveData(nextData);
    window.dispatchEvent(new Event('allocations-updated'));
    return created;
  };

  const availableToAdd = (data?.users ?? []).filter(
    u => !allocations.some(a => a.userId === u.id)
  );

  const handleRemoveMember = async (alloc: Allocation) => {
    if (!data) return;
    const user = data.users.find(u => u.id === alloc.userId);
    const projectName = project?.name ?? 'project';
    await deleteItem('allocations', alloc.id);
    if (user && project) {
      logActivityEvent({
        userId: user.id,
        projectId: project.id,
        type: 'member_removed',
        message: `${user.name} was removed from ${projectName}`,
      });
    }
    onUpdated();
    setData(await loadData());
    window.dispatchEvent(new CustomEvent('allocations-updated'));
  };

  const handleAddMember = async () => {
    if (!addUserId || !project || !data) return;
    const user = data.users.find(u => u.id === addUserId);
    if (!user) return;
    const capacity = Math.min(100, Math.max(0, addCapacity));
    const addedUserId = addUserId;
    await addItem('allocations', {
      id: genId(),
      projectId: project.id,
      userId: addUserId,
      ftePercent: capacity,
      agreedMonthlyHours: Math.round((173 * capacity) / 100),
      billableHourlyRate: user.billableHourlyRate,
    });
    setAddUserId('');
    setAddCapacity(100);
    onUpdated();
    const freshData = await loadData();
    setData(freshData);
    window.dispatchEvent(new CustomEvent('allocations-updated'));
    checkExternalConflictsAfterChange(freshData, {
      userId: addedUserId,
      sourceProjectId: project.id,
      changeType: 'member_added',
      onToast: showExternalConflictToast,
    });
  };

  const handleReassignTask = async () => {
    if (!reassignTaskId || !reassignFromUserId || !reassignToUserId || reassignFromUserId === reassignToUserId || !data || !project) return;
    const task = data.tasks.find(t => t.id === reassignTaskId);
    if (!task) return;
    const assigneeIds = task.assigneeIds ?? [];
    if (!assigneeIds.includes(reassignFromUserId)) return;

    const newAssigneeIds = assigneeIds.filter(id => id !== reassignFromUserId).concat(reassignToUserId);
    await updateItem('tasks', { ...task, assigneeIds: newAssigneeIds });
    if (project) {
      const fromUser = data.users.find(u => u.id === reassignFromUserId);
      const toUser = data.users.find(u => u.id === reassignToUserId);
      logActivityEvent({
        userId: toUser?.id || fromUser?.id || 'system',
        projectId: project.id,
        taskId: task.id,
        type: 'task_reassigned',
        message: `Task "${task.title}" was reassigned from ${fromUser?.name ?? 'one member'} to ${toUser?.name ?? 'another member'}`,
      });
    }

    const toAlloc = allocations.find(a => a.userId === reassignToUserId);
    if (!toAlloc) {
      const toUser = data.users.find(u => u.id === reassignToUserId);
      if (toUser) {
        await addItem('allocations', {
          id: genId(),
          projectId: project.id,
          userId: reassignToUserId,
          ftePercent: 100,
          agreedMonthlyHours: 173,
          billableHourlyRate: toUser.billableHourlyRate,
        });
      }
    }

    setReassignTaskId(null);
    setReassignFromUserId('');
    setReassignToUserId('');
    onUpdated();
    const freshData = await loadData();
    setData(freshData);
    window.dispatchEvent(new CustomEvent('allocations-updated'));
    checkExternalConflictsAfterChange(freshData, {
      userId: reassignToUserId,
      sourceProjectId: project.id,
      changeType: 'task_assigned',
      onToast: showExternalConflictToast,
    });
  };

  const handleUpdateCapacity = async (alloc: Allocation, ftePercent: number) => {
    const pct = Math.min(100, Math.max(0, ftePercent));
    await updateItem('allocations', {
      ...alloc,
      ftePercent: pct,
      agreedMonthlyHours: Math.round((173 * pct) / 100),
    });
    onUpdated();
    setData(await loadData());
    window.dispatchEvent(new CustomEvent('allocations-updated'));
  };

  const handleRaiseCapacityToMatch = async (alloc: Allocation, taskFte: number) => {
    const newCapacity = Math.min(100, Math.ceil(taskFte));
    const prevCapacity = alloc.ftePercent;
    await updateItem('allocations', {
      ...alloc,
      ftePercent: newCapacity,
      agreedMonthlyHours: Math.round((173 * newCapacity) / 100),
    });
    const user = data?.users.find(u => u.id === alloc.userId);
    if (project && user) {
      logActivityEvent({
        userId: user.id,
        projectId: project.id,
        type: 'member_updated',
        message: `Capacity for ${user.name} on ${project.name} raised from ${prevCapacity}% to ${newCapacity}% to match task demand`,
      });
    }
    onUpdated();
    const freshData = await loadData();
    setData(freshData);
    window.dispatchEvent(new CustomEvent('allocations-updated'));
    checkExternalConflictsAfterChange(freshData, {
      userId: alloc.userId,
      sourceProjectId: alloc.projectId,
      changeType: 'capacity_raised',
      onToast: showExternalConflictToast,
    });
  };

  if (!data || !project) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSimulate = () => {
    if (!data) return;
    simulation?.enterSimulation(data);
    onOpenChange(false);
    navigate('/simulation', { state: { appData: data } });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-card/95 backdrop-blur-xl border border-white/10">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg font-semibold text-foreground/95">
            Edit Team — {project.name}
          </DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 shrink-0"
            onClick={handleSimulate}
          >
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
            Simulate
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto pr-2 -mr-2">
          {/* Current members */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Team members
            </Label>
            <div className="space-y-2">
              {allocations.length === 0 ? (
                <div className="rounded-xl px-4 py-6 text-center text-sm text-muted-foreground bg-background/40 backdrop-blur border border-white/5">
                  No team members assigned. Add one below.
                </div>
              ) : (
                allocations.map(alloc => {
                  const user = data.users.find(u => u.id === alloc.userId);
                  if (!user) return null;
                  const capacity = data.allocations.find(a => a.id === alloc.id)?.ftePercent ?? alloc.ftePercent;
                  const taskFte = getMemberProjectFtePercent(data, user, project.id, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                  const conflict = getCapacityConflict(taskFte, capacity);
                  const totalFte = getMemberTotalPeakFte(data, user, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                  const remaining = Math.max(0, 100 - totalFte);
                  const isOverallocated = totalFte > 100;
                  const availableClass =
                    isOverallocated
                      ? 'text-destructive'
                      : remaining > 50
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : remaining >= 25
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive';
                  const showConflictSubline = conflict.status === 'exceeds' || conflict.status === 'approaching';
                  return (
                    <div
                      key={alloc.id}
                      className="rounded-xl bg-background/50 backdrop-blur border border-white/10 flex flex-col gap-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <BandwidthWarning totalFtePercent={totalFte} useBadge={totalFte > 100}>
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: user.avatarColor, color: 'white' }}
                          >
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        </BandwidthWarning>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-medium truncate">{user.name}</p>
                            <RoleSkillInlineEditor
                              user={user}
                              roleOptions={taxonomy.roleOptions}
                              skillOptions={taxonomy.skillOptions}
                              onCreateSkill={handleCreateSkill}
                              onSave={async (next) => {
                                if (!data) return;
                                const updated = { ...user, ...next };
                                setData(prev => !prev ? prev : ({ ...prev, users: prev.users.map(u => u.id === user.id ? updated : u) }));
                                await updateItem('users', updated);
                                window.dispatchEvent(new Event('allocations-updated'));
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {user.primaryRole ? (resolve.roleNameById.get(user.primaryRole) ?? 'Unknown role') : 'No role assigned'}
                            </span>
                            {(user.skills?.length ?? 0) > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] text-muted-foreground hover:text-foreground cursor-default">
                                      View skills
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-background/90 backdrop-blur border-white/10">
                                    <p className="text-xs text-foreground/90">
                                      {(user.skills ?? []).map(id => resolve.skillNameById.get(id) ?? 'Unknown').join(', ')}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {showConflictSubline ? (
                            <p className={cn(
                              'text-xs mt-0.5',
                              conflict.status === 'exceeds' && 'text-amber-600/90 dark:text-amber-400/90',
                              conflict.status === 'exceeds' && conflict.overBy && conflict.overBy > 20 && 'text-red-600/90 dark:text-red-400/90',
                              conflict.status === 'approaching' && 'text-amber-600/80 dark:text-amber-400/80'
                            )}>
                              {conflict.status === 'exceeds' && conflict.overBy != null && (
                                <>Tasks require {Math.round(conflict.taskFte)}% · Capacity set to {Math.round(capacity)}% — {Math.round(conflict.overBy)}% over limit</>
                              )}
                              {conflict.status === 'approaching' && (
                                <>{user.name} is near their capacity limit for this project</>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/80 mt-0.5">
                              <span>{Math.round(capacity)}% on this project</span>
                              <span className="text-muted-foreground/60"> — </span>
                              <span className={availableClass}>
                                {isOverallocated
                                  ? 'Overallocated'
                                  : `${Math.round(remaining)}% total FTE available`}
                              </span>
                            </p>
                          )}
                        </div>
                        <CapacitySelector
                          value={capacity}
                          onChange={(pct) => {
                            setData(prev => !prev ? prev : {
                              ...prev,
                              allocations: prev.allocations.map(a =>
                                a.id === alloc.id ? { ...a, ftePercent: pct } : a
                              ),
                            });
                            const current = data.allocations.find(a => a.id === alloc.id);
                            if (current && current.ftePercent !== pct) handleUpdateCapacity(current, pct);
                          }}
                          taskFteRequired={conflict.status !== 'ok' ? taskFte : undefined}
                          hasConflict={conflict.status !== 'ok'}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemoveMember(alloc)}
                          title="Remove from project"
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                      {conflict.status !== 'ok' && (
                        <div className="flex flex-wrap items-center gap-2 pl-12 text-xs">
                          {conflict.status === 'exceeds' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                              onClick={() => handleRaiseCapacityToMatch(alloc, taskFte)}
                            >
                              <ChevronUp className="h-3.5 w-3.5 mr-1" />
                              Increase capacity to match tasks
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-muted-foreground hover:bg-muted/50"
                            onClick={() => setReviewTasksForUserId(user.id)}
                          >
                            <ListChecks className="h-3.5 w-3.5 mr-1" />
                            Review tasks
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Add member */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add member
            </Label>
            <div className="rounded-xl bg-background/50 backdrop-blur border border-white/10 p-3 flex flex-wrap items-center gap-3">
              <Select value={addUserId} onValueChange={(v) => { setAddUserId(v); setAddCapacity(100); }}>
                <SelectTrigger className="w-[200px] h-9 bg-background/60 border-white/10">
                  <SelectValue placeholder="Select from roster" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{ backgroundColor: u.avatarColor, color: 'white' }}
                        >
                          {u.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        {u.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addUserId ? (
                <>
                  <CapacitySelector value={addCapacity} onChange={setAddCapacity} />
                  {(() => {
                    const user = data.users.find(u => u.id === addUserId);
                    if (!user) return null;
                    const totalFte = getMemberTotalPeakFte(data, user, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                    const syntheticAlloc = { id: '_pre', projectId: project.id, userId: addUserId, ftePercent: addCapacity, agreedMonthlyHours: Math.round((173 * addCapacity) / 100), billableHourlyRate: user.billableHourlyRate };
                    const syntheticData: AppData = { ...data, allocations: [...data.allocations, syntheticAlloc] };
                    const totalFteAfterAdd = getMemberTotalPeakFte(syntheticData, user, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                    const remaining = Math.max(0, 100 - totalFte);
                    const isOverallocated = totalFte > 100;
                    const wouldOverallocate = totalFteAfterAdd > 100;
                    const wouldApproach = totalFteAfterAdd > 75 && totalFteAfterAdd <= 100;
                    const availableClass =
                      isOverallocated ? 'text-destructive' : remaining > 50 ? 'text-emerald-600 dark:text-emerald-400' : remaining >= 25 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive';
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className={cn('text-xs', availableClass)}>
                          {isOverallocated ? 'Overallocated' : `${Math.round(remaining)}% total FTE available`}
                        </span>
                        {wouldApproach && !wouldOverallocate && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            Adding at this capacity will bring total FTE to {Math.round(totalFteAfterAdd)}% — approaching full bandwidth
                          </span>
                        )}
                        {wouldOverallocate && (
                          <span className="text-[11px] text-destructive">
                            This will overallocate — total FTE would reach {Math.round(totalFteAfterAdd)}%. Consider lower capacity or reviewing tasks elsewhere.
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : null}
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={!addUserId}
                className="ml-auto bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Add
              </Button>
            </div>
          </div>

          {/* Reassign task */}
          {tasks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Reassign task
              </Label>
              <div className="rounded-xl border border-white/10 bg-background/40 backdrop-blur divide-y divide-white/5">
                {tasks.map(task => {
                  const assignees = (task.assigneeIds ?? [])
                    .map(id => data.users.find(u => u.id === id))
                    .filter(Boolean) as User[];
                  const isReassigning = reassignTaskId === task.id;
                  return (
                    <div key={task.id} className="px-4 py-2.5 flex items-center justify-between gap-2 rounded-lg bg-background/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {assignees.length ? assignees.map(u => u.name).join(', ') : 'Unassigned'} · {getTaskDurationHours(task)}h
                        </p>
                      </div>
                      {!isReassigning ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-xs"
                          onClick={() => {
                            setReassignTaskId(task.id);
                            setReassignFromUserId(assignees[0]?.id ?? '');
                            setReassignToUserId('');
                          }}
                          disabled={assignees.length === 0}
                        >
                          Reassign
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <Select
                            value={reassignFromUserId}
                            onValueChange={setReassignFromUserId}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue placeholder="From" />
                            </SelectTrigger>
                            <SelectContent>
                              {assignees.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground">→</span>
                          <Select
                            value={reassignToUserId}
                            onValueChange={setReassignToUserId}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue placeholder="To" />
                            </SelectTrigger>
                            <SelectContent>
                              {allocations
                                .filter(a => a.userId !== reassignFromUserId)
                                .map(a => data.users.find(u => u.id === a.userId))
                                .filter(Boolean)
                                .map(u => u!)
                                .map(u => (
                                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 text-xs" onClick={handleReassignTask} disabled={!reassignToUserId}>
                            Apply
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setReassignTaskId(null);
                              setReassignFromUserId('');
                              setReassignToUserId('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Review tasks sheet — tasks for selected member on this project, sorted by FTE contribution */}
    <Sheet open={!!reviewTasksForUserId} onOpenChange={(open) => !open && setReviewTasksForUserId(null)}>
      <SheetContent className="w-full max-w-md bg-background/95 backdrop-blur-xl border-white/10">
        <SheetHeader>
          <SheetTitle className="text-base">
            {reviewTasksForUserId && (() => {
              const u = data?.users.find(x => x.id === reviewTasksForUserId);
              return u ? `Tasks for ${u.name}` : 'Review tasks';
            })()}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto max-h-[70vh]">
          {reviewTasksForUserId && data && project && (() => {
            const user = data.users.find(u => u.id === reviewTasksForUserId);
            if (!user) return null;
            const tasksWithFte = getMemberProjectTasksWithFte(data, user.id, project.id, VIEW_PERIOD, periodBounds.start, periodBounds.end);
            const phaseById = Object.fromEntries((data.phases ?? []).filter(p => p.projectId === project.id).map(p => [p.id, p]));
            if (tasksWithFte.length === 0) {
              return <p className="text-sm text-muted-foreground">No tasks assigned on this project.</p>;
            }
            return tasksWithFte.map(({ task, ftePercent }) => (
              <div
                key={task.id}
                className="rounded-lg bg-background/50 border border-white/10 px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {phaseById[task.phaseId]?.name ?? '—'} · {getTaskDurationHours(task)}h
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0">{Math.round(ftePercent)}% FTE</span>
              </div>
            ));
          })()}
        </div>
        <div className="mt-4 flex gap-2">
          {onNavigateToProject && project && (
            <Button
              variant="outline"
              size="sm"
              className="border-white/10"
              onClick={() => {
                onNavigateToProject(project.id);
                setReviewTasksForUserId(null);
                onOpenChange(false);
              }}
            >
              Open project
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setReviewTasksForUserId(null)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
