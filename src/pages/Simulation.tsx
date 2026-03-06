import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSimulation } from '@/contexts/SimulationContext';
import { loadData } from '@/lib/store';
import { genId } from '@/lib/store';
import type { AppData, Allocation, Task } from '@/lib/types';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getDefaultPeriodBounds,
  getCapacityConflict,
} from '@/lib/bandwidth';
import { getBandwidthStatus } from '@/lib/fte';
import { computeSimulationDelta, saveSimulationSnapshot } from '@/lib/simulation';
import { getSharedSimulation, markSharedSimulationApplied } from '@/lib/sharedSimulations';
import { logActivityEvent, addNotification } from '@/lib/notifications';
import { ShareSimulationPopover } from '@/components/ShareSimulationPopover';
import { SimulationTemplatesPanel } from '@/components/SimulationTemplatesPanel';
import { PlanningInsightsPanel } from '@/components/PlanningInsightsPanel';
import { recordSimulationRun, saveAsPersonalTemplate } from '@/lib/simulationTemplates';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, ArrowRight, Undo2, Plus, X, Share2, BookOpen, FlaskConical, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const VIEW_PERIOD = 'month' as const;

function loadBarClass(fte: number): string {
  if (fte > 100) return 'bg-red-500/90';
  if (fte >= 100) return 'bg-orange-500/80';
  if (fte >= 75) return 'bg-amber-500/70';
  return 'bg-emerald-500/60';
}

function buildMembersList(data: AppData) {
  const periodBounds = getDefaultPeriodBounds(VIEW_PERIOD);
  const activeProjects = data.projects.filter((p) => p.status === 'Active');
  return data.users.map((user) => {
    const totalFte = getMemberTotalPeakFte(
      data,
      user,
      VIEW_PERIOD,
      periodBounds.start,
      periodBounds.end
    );
    const remaining = Math.max(0, 100 - totalFte);
    const status = getBandwidthStatus(totalFte);
    const projectIds = Array.from(
      new Set([
        ...data.allocations.filter((a) => a.userId === user.id).map((a) => a.projectId),
        ...data.tasks
          .filter((t) => (t.assigneeIds ?? []).includes(user.id))
          .map((t) => t.projectId),
      ])
    ).filter((pid) => activeProjects.some((p) => p.id === pid));
    const projectAllocs = projectIds.map((projectId) => {
      const project = data.projects.find((p) => p.id === projectId);
      const alloc = data.allocations.find((a) => a.projectId === projectId && a.userId === user.id);
      const ftePercent = getMemberProjectFtePercent(
        data,
        user,
        projectId,
        VIEW_PERIOD,
        periodBounds.start,
        periodBounds.end
      );
      const capacity = alloc?.ftePercent ?? 0;
      const conflict = getCapacityConflict(ftePercent, capacity);
      return {
        projectId,
        projectName: project?.name ?? 'Unknown',
        ftePercent,
        capacity,
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
}

function BandwidthTablePanel({
  data,
  title,
  baseData = null,
  delta,
  isSimulated = false,
}: {
  data: AppData;
  title: string;
  baseData?: AppData | null;
  delta?: ReturnType<typeof computeSimulationDelta> | null;
  isSimulated?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const members = useMemo(() => buildMembersList(data), [data]);
  const baseMembers = useMemo(
    () => (baseData ? buildMembersList(baseData) : []),
    [baseData]
  );
  const baseMap = useMemo(() => {
    const m = new Map<string, (typeof baseMembers)[0]>();
    baseMembers.forEach((row) => m.set(row.user.id, row));
    return m;
  }, [baseMembers]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const affectedSet = delta ? delta.affectedMemberIds : new Set<string>();

  return (
    <Card
      className={cn(
        'border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col',
        isSimulated && 'ring-1 ring-amber-500/20'
      )}
    >
      <div className="px-4 py-2 border-b border-border/60 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground/90">{title}</h3>
      </div>
      <CardContent className="p-0 flex-1 overflow-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="w-10 py-2" />
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Total FTE %</th>
                <th className="text-right py-2 px-3 font-medium text-muted-foreground">Remaining %</th>
                <th className="py-2 px-3 min-w-[100px] font-medium text-muted-foreground">Load</th>
              </tr>
            </thead>
            <tbody>
              {members.map(({ user, totalFte, remaining, status, projectAllocs }) => {
                const isExpanded = expandedIds.has(user.id);
                const baseRow = baseData ? baseMap.get(user.id) : null;
                const showDelta =
                  isSimulated && baseRow && (baseRow.totalFte !== totalFte || baseRow.remaining !== remaining);
                const isAffected = affectedSet.has(user.id);
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b border-border/40',
                      status === 'overallocated' && 'bg-red-500/5',
                      isAffected && isSimulated && 'bg-amber-500/5'
                    )}
                  >
                    <td className="py-1.5 px-2">
                      <button
                        type="button"
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                        onClick={() => toggleExpanded(user.id)}
                        disabled={projectAllocs.length === 0}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            backgroundColor: user.avatarColor,
                            color: 'white',
                          }}
                        >
                          {user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        <span className="font-medium text-foreground/95 text-xs">{user.name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground capitalize text-xs">
                      {user.role}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {showDelta ? (
                        <span className="text-xs">
                          <span className="text-muted-foreground line-through">
                            {Math.round(baseRow!.totalFte)}%
                          </span>
                          <span className="text-amber-600 dark:text-amber-400 mx-1">
                            <ArrowRight className="inline h-3 w-3" />
                          </span>
                          <span className="font-medium">{Math.round(totalFte)}%</span>
                        </span>
                      ) : (
                        <span className="font-medium text-xs">{Math.round(totalFte)}%</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground text-xs">
                      {showDelta ? (
                        <span>
                          <span className="line-through">{Math.round(baseRow!.remaining)}%</span>
                          <span className="text-amber-600 dark:text-amber-400 mx-1">
                            <ArrowRight className="inline h-3 w-3" />
                          </span>
                          <span className={cn(remaining < 25 && 'text-red-500', remaining >= 25 && remaining < 50 && 'text-amber-600')}>
                            {Math.round(remaining)}%
                          </span>
                        </span>
                      ) : (
                        <span>{Math.round(remaining)}%</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 min-w-[100px]">
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', loadBarClass(totalFte))}
                          style={{ width: `${Math.min(100, totalFte)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {members.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-xs">No members</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Simulation() {
  const { isManagerOrAbove, currentUser } = useAuth();
  const navigate = useNavigate();
  const sim = useSimulation();
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [currentShareId, setCurrentShareId] = useState<string | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [simulationTab, setSimulationTab] = useState<'build' | 'templates' | 'insights'>('build');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateDesc, setSaveTemplateDesc] = useState('');
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addStepType, setAddStepType] = useState<string>('add_allocation');
  const [addProjectId, setAddProjectId] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [addCapacity, setAddCapacity] = useState(100);
  const [removeAllocId, setRemoveAllocId] = useState('');
  const [updateAllocId, setUpdateAllocId] = useState('');
  const [updateCapacity, setUpdateCapacity] = useState(50);
  const [reassignTaskId, setReassignTaskId] = useState('');
  const [reassignFrom, setReassignFrom] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const sessionStartRef = useRef<number | null>(null);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navState = location.state as { appData?: AppData; steps?: import('@/lib/simulation').SimulationStep[] } | null;
  const stateData = navState?.appData;
  const stateSteps = navState?.steps;

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'insights') setSimulationTab('insights');
  }, [searchParams]);

  useEffect(() => {
    if (sim.baseData) return;
    if (stateData && stateData.users && stateData.projects) {
      if (stateSteps && stateSteps.length > 0) {
        sim.enterSimulationWithSteps(stateData, stateSteps);
      } else {
        sim.enterSimulation(stateData);
      }
      return;
    }
    loadData().then((data) => {
      sim.enterSimulation(data);
    });
  }, [stateData, stateSteps, sim]);

  useEffect(() => {
    if (sim.baseData && sim.isSimulationMode) {
      if (sessionStartRef.current == null) sessionStartRef.current = Date.now();
    } else {
      sessionStartRef.current = null;
    }
  }, [sim.baseData, sim.isSimulationMode]);

  // Clear simulation mode when leaving the page so the banner disappears
  useEffect(() => {
    return () => {
      sim.exitSimulation();
    };
  }, [sim]);

  const activeProjects = useMemo(
    () => (sim.baseData?.projects.filter((p) => p.status === 'Active') ?? []),
    [sim.baseData]
  );
  const allocationsForRemove = useMemo(
    () => sim.simulatedData?.allocations ?? [],
    [sim.simulatedData]
  );
  const tasksForReassign = useMemo(
    () =>
      (sim.simulatedData?.tasks ?? []).filter(
        (t) => (t.assigneeIds ?? []).length > 0 && t.status !== 'Done'
      ),
    [sim.simulatedData]
  );

  const delta = useMemo(
    () =>
      sim.baseData && sim.simulatedData
        ? (sim.delta ?? computeSimulationDelta(sim.baseData, sim.simulatedData))
        : null,
    [sim.baseData, sim.simulatedData, sim.delta]
  );
  const hasSteps = (sim.steps?.length ?? 0) > 0;
  const sharedSnapshot = currentShareId ? getSharedSimulation(currentShareId) : null;
  const colleagueUsers = useMemo(
    () => (sim.baseData?.users ?? []).filter((u) => u.id !== currentUser?.id).map((u) => ({ id: u.id, name: u.name })),
    [sim.baseData, currentUser?.id]
  );
  const projectLabel = useMemo(() => {
    if (!delta || delta.affectedProjectIds.size === 0) return 'Simulation';
    const firstId = [...delta.affectedProjectIds][0];
    return sim.baseData?.projects.find((p) => p.id === firstId)?.name ?? 'Simulation';
  }, [delta, sim.baseData]);

  const handleRunTemplate = (steps: import('@/lib/simulation').SimulationStep[], templateId?: string) => {
    if (!sim.baseData) return;
    setCurrentTemplateId(templateId ?? null);
    sim.enterSimulationWithSteps(sim.baseData, steps);
    setSimulationTab('build');
  };

  const handleAddStep = () => {
    const data = sim.simulatedData!;
    if (addStepType === 'add_allocation' && addProjectId && addUserId) {
      const project = data.projects.find((p) => p.id === addProjectId);
      const user = data.users.find((u) => u.id === addUserId);
      if (!project || !user) return;
      const capacity = Math.min(100, Math.max(0, addCapacity));
      const allocation: Allocation = {
        id: genId(),
        projectId: addProjectId,
        userId: addUserId,
        ftePercent: capacity,
        agreedMonthlyHours: Math.round((173 * capacity) / 100),
        billableHourlyRate: user.billableHourlyRate,
      };
      sim.addStep({
        id: `step-${Date.now()}`,
        type: 'add_allocation',
        label: `Added ${user.name} to ${project.name} at ${capacity}%`,
        allocation,
      });
      setAddUserId('');
      setAddProjectId('');
      setAddCapacity(100);
      setAddStepOpen(false);
    } else if (addStepType === 'remove_allocation' && removeAllocId) {
      const alloc = data.allocations.find((a) => a.id === removeAllocId);
      if (!alloc) return;
      const user = data.users.find((u) => u.id === alloc.userId);
      const project = data.projects.find((p) => p.id === alloc.projectId);
      sim.addStep({
        id: `step-${Date.now()}`,
        type: 'remove_allocation',
        label: `Removed ${user?.name ?? 'member'} from ${project?.name ?? 'project'}`,
        allocationId: alloc.id,
        projectId: alloc.projectId,
        userId: alloc.userId,
      });
      setRemoveAllocId('');
      setAddStepOpen(false);
    } else if (addStepType === 'update_allocation_capacity' && updateAllocId) {
      const alloc = data.allocations.find((a) => a.id === updateAllocId);
      if (!alloc) return;
      const cap = Math.min(100, Math.max(0, updateCapacity));
      const user = data.users.find((u) => u.id === alloc.userId);
      const project = data.projects.find((p) => p.id === alloc.projectId);
      sim.addStep({
        id: `step-${Date.now()}`,
        type: 'update_allocation_capacity',
        label: `Set ${user?.name ?? 'member'} capacity on ${project?.name ?? 'project'} to ${cap}%`,
        allocationId: alloc.id,
        ftePercent: cap,
      });
      setUpdateAllocId('');
      setUpdateCapacity(50);
      setAddStepOpen(false);
    } else if (addStepType === 'reassign_task' && reassignTaskId && reassignFrom && reassignTo && reassignFrom !== reassignTo) {
      const task = data.tasks.find((t) => t.id === reassignTaskId);
      if (!task || !(task.assigneeIds ?? []).includes(reassignFrom)) return;
      const fromUser = data.users.find((u) => u.id === reassignFrom);
      const toUser = data.users.find((u) => u.id === reassignTo);
      sim.addStep({
        id: `step-${Date.now()}`,
        type: 'reassign_task',
        label: `Reassigned "${task.title}" from ${fromUser?.name} to ${toUser?.name}`,
        taskId: task.id,
        fromUserId: reassignFrom,
        toUserId: reassignTo,
      });
      setReassignTaskId('');
      setReassignFrom('');
      setReassignTo('');
      setAddStepOpen(false);
    }
  };

  const handleApply = async () => {
    setApplyConfirmOpen(false);
    const delta = sim.delta ?? (sim.baseData && sim.simulatedData ? computeSimulationDelta(sim.baseData, sim.simulatedData) : null);
    const sharedBeforeApply = currentShareId ? getSharedSimulation(currentShareId) : null;
    const reviewerIds = sharedBeforeApply?.reviewers.map((r) => r.userId) ?? [];
    const requestedChangeIds = new Set(
      sharedBeforeApply?.reviewers.filter((r) => r.status === 'changes_requested').map((r) => r.userId) ?? []
    );
    const approvedNames = sharedBeforeApply?.reviewers.filter((r) => r.status === 'approved').map((r) => r.userName) ?? [];

    const sessionMinutes = sessionStartRef.current ? (Date.now() - sessionStartRef.current) / 60000 : undefined;
    recordSimulationRun({
      steps: sim.steps,
      applied: true,
      templateId: currentTemplateId ?? undefined,
      sessionDurationMinutes: sessionMinutes,
      wasShared: !!currentShareId,
    });
    saveSimulationSnapshot({
      steps: sim.steps,
      summary: delta
        ? `Introduce ${delta.newConflicts} new conflict(s), resolve ${delta.resolvedConflicts}, affect ${delta.affectedMemberIds.size} members, ${delta.affectedProjectIds.size} projects`
        : `${sim.steps.length} step(s)`,
      applied: true,
    });
    setCurrentTemplateId(null);
    await sim.applyAll();

    if (currentShareId && currentUser) {
      markSharedSimulationApplied(currentShareId, currentUser.id);
      const projectLabel = sharedBeforeApply?.projectLabel ?? 'Simulation';
      if (approvedNames.length > 0) {
        logActivityEvent({
          userId: currentUser.id,
          type: 'project_status_changed',
          message: `Simulation applied by ${currentUser.name} — approved by ${approvedNames.join(', ')}`,
        });
      }
      reviewerIds.forEach((userId) => {
        const msg = requestedChangeIds.has(userId)
          ? `${currentUser?.name} has applied the simulation you reviewed for ${projectLabel} — applied without incorporating your requested changes`
          : `${currentUser?.name} has applied the simulation you reviewed for ${projectLabel} — changes are now live`;
        addNotification({
          id: `notif-applied-${Date.now()}-${userId}`,
          userId,
          type: 'simulation_applied',
          category: 'project',
          title: 'Simulation applied',
          message: msg,
          sharedSimulationId: currentShareId,
          relatedUserId: currentUser.id,
          createdAt: new Date().toISOString(),
          read: false,
        });
      });
    }

    navigate('/bandwidth');
  };

  const handleDiscard = () => {
    if (sim.steps.length > 0) {
      const sessionMinutes = sessionStartRef.current ? (Date.now() - sessionStartRef.current) / 60000 : undefined;
      recordSimulationRun({
        steps: sim.steps,
        applied: false,
        templateId: currentTemplateId ?? undefined,
        sessionDurationMinutes: sessionMinutes,
        wasShared: !!currentShareId,
      });
      const delta = sim.delta ?? (sim.baseData && sim.simulatedData ? computeSimulationDelta(sim.baseData, sim.simulatedData) : null);
      saveSimulationSnapshot({
        steps: sim.steps,
        summary: delta
          ? `Would have: ${delta.newConflicts} new conflict(s), ${delta.resolvedConflicts} resolved, ${delta.affectedMemberIds.size} members`
          : `${sim.steps.length} step(s) (discarded)`,
        applied: false,
      });
    }
    setCurrentTemplateId(null);
    sim.discard();
    navigate(-1);
  };

  if (!isManagerOrAbove) {
    return (
      <div className="text-center py-12 text-muted-foreground">Access restricted</div>
    );
  }

  if (!sim.baseData || !sim.simulatedData) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        Loading simulation...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={simulationTab} onValueChange={(v) => setSimulationTab(v as 'build' | 'templates' | 'insights')}>
            <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TabsList className="bg-muted/30 border border-white/10">
              <TabsTrigger value="build" className="gap-1.5">
                <FlaskConical className="h-4 w-4" />
                Simulation
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <BookOpen className="h-4 w-4" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Planning Insights
              </TabsTrigger>
            </TabsList>
            <div>
              <h1 className="text-xl font-bold text-foreground">What-If Simulation</h1>
              <p className="text-xs text-muted-foreground">
                Preview bandwidth impact before committing changes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          {hasSteps && currentUser && (
            <>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full bg-background/80 backdrop-blur border-white/10"
              onClick={() => { setSaveTemplateName(`Simulation ${new Date().toLocaleDateString()}`); setSaveTemplateDesc(''); setSaveTemplateOpen(true); }}
            >
              Save as Template
            </Button>
            <ShareSimulationPopover
              baseData={sim.baseData}
              steps={sim.steps}
              simulatedData={sim.simulatedData}
              delta={delta}
              projectLabel={projectLabel}
              ownerId={currentUser.id}
              ownerName={currentUser.name}
              colleagueUsers={colleagueUsers}
              onShared={setCurrentShareId}
            >
              <Button variant="outline" size="sm" className="rounded-full bg-background/80 backdrop-blur border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                <Share2 className="h-4 w-4 mr-1" />
                Share simulation
              </Button>
            </ShareSimulationPopover>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleDiscard}>
            <X className="h-4 w-4 mr-1" />
            Discard Simulation
          </Button>
          </div>
        </div>

        <TabsContent value="templates" className="mt-4">
          <div className="rounded-xl bg-background/60 backdrop-blur border border-white/10 p-4">
            <SimulationTemplatesPanel
              data={sim.baseData}
              onRunWithSteps={handleRunTemplate}
              onClose={() => setSimulationTab('build')}
            />
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <div className="rounded-xl bg-background/60 backdrop-blur border border-white/10 p-4">
            <PlanningInsightsPanel />
          </div>
        </TabsContent>

        <TabsContent value="build" className="mt-4 space-y-4">
      {/* Reviewer status when shared */}
      {sharedSnapshot && sharedSnapshot.reviewers.length > 0 && (
        <div className="rounded-xl bg-muted/30 backdrop-blur-sm border border-white/10 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Shared with {sharedSnapshot.reviewers.length} reviewer{sharedSnapshot.reviewers.length !== 1 ? 's' : ''}
            {' · '}
            {sharedSnapshot.reviewers.filter((r) => r.status === 'approved').length} approved
            {' · '}
            {sharedSnapshot.reviewers.filter((r) => r.status === 'pending').length} pending
            {' · '}
            {sharedSnapshot.reviewers.filter((r) => r.status === 'changes_requested').length} requested changes
          </span>
          <div className="flex items-center gap-1.5">
            {sharedSnapshot.reviewers.map((r) => (
              <div
                key={r.userId}
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2',
                  r.status === 'approved' && 'bg-emerald-500/20 border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
                  r.status === 'pending' && 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-400',
                  r.status === 'changes_requested' && 'bg-red-500/20 border-red-500/50 text-red-700 dark:text-red-400'
                )}
                title={`${r.userName}: ${r.status}`}
              >
                {r.userName.split(' ').map((n) => n[0]).join('')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delta summary */}
      {hasSteps && (
        <div className="rounded-xl bg-muted/30 backdrop-blur-sm border border-white/10 px-4 py-3 text-sm text-muted-foreground">
          Simulation would introduce{' '}
          <span className="font-medium text-foreground">{delta.newConflicts}</span> new conflict
          {delta.newConflicts !== 1 ? 's' : ''}
          {' · '}
          Resolve <span className="font-medium text-foreground">{delta.resolvedConflicts}</span>{' '}
          existing conflict{delta.resolvedConflicts !== 1 ? 's' : ''}
          {' · '}
          Affect <span className="font-medium text-foreground">{delta.affectedMemberIds.size}</span>{' '}
          members across{' '}
          <span className="font-medium text-foreground">{delta.affectedProjectIds.size}</span>{' '}
          projects
        </div>
      )}

      {/* Step log */}
      {hasSteps && (
        <div className="rounded-xl bg-amber-500/5 backdrop-blur-sm border border-amber-500/20 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Steps
          </p>
          <div className="flex flex-wrap gap-2">
            {sim.steps.map((step, i) => (
              <div
                key={step.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-background/60 border border-white/10 px-2.5 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">Step {i + 1}:</span>
                <span className="text-foreground/90">{step.label}</span>
                <button
                  type="button"
                  className="text-amber-600 hover:text-amber-500 p-0.5"
                  onClick={() => sim.undoStepAtIndex(i)}
                  title="Undo this step"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add step */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Add step:</Label>
        <Select value={addStepType} onValueChange={setAddStepType}>
          <SelectTrigger className="w-[200px] h-9 bg-background/60 border-white/10 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="add_allocation">Add member to project</SelectItem>
            <SelectItem value="remove_allocation">Remove member from project</SelectItem>
            <SelectItem value="update_allocation_capacity">Change capacity</SelectItem>
            <SelectItem value="reassign_task">Reassign task</SelectItem>
          </SelectContent>
        </Select>
        {addStepType === 'add_allocation' && (
          <>
            <Select value={addProjectId} onValueChange={setAddProjectId}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addUserId} onValueChange={setAddUserId}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="Member" />
              </SelectTrigger>
              <SelectContent>
                {(sim.simulatedData?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(addCapacity)} onValueChange={(v) => setAddCapacity(Number(v))}>
              <SelectTrigger className="w-[80px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 75, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {addStepType === 'remove_allocation' && (
          <Select value={removeAllocId} onValueChange={setRemoveAllocId}>
            <SelectTrigger className="w-[240px] h-9 text-xs">
              <SelectValue placeholder="Select allocation to remove" />
            </SelectTrigger>
            <SelectContent>
              {allocationsForRemove.map((a) => {
                const u = sim.simulatedData?.users.find((x) => x.id === a.userId);
                const p = sim.simulatedData?.projects.find((x) => x.id === a.projectId);
                return (
                  <SelectItem key={a.id} value={a.id}>
                    {u?.name} on {p?.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        {addStepType === 'update_allocation_capacity' && (
          <>
            <Select value={updateAllocId} onValueChange={setUpdateAllocId}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue placeholder="Select allocation" />
              </SelectTrigger>
              <SelectContent>
                {allocationsForRemove.map((a) => {
                  const u = sim.simulatedData?.users.find((x) => x.id === a.userId);
                  const p = sim.simulatedData?.projects.find((x) => x.id === a.projectId);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {u?.name} on {p?.name} ({a.ftePercent}%)
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={String(updateCapacity)} onValueChange={(v) => setUpdateCapacity(Number(v))}>
              <SelectTrigger className="w-[80px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 75, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        {addStepType === 'reassign_task' && (
          <>
            <Select value={reassignTaskId} onValueChange={setReassignTaskId}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue placeholder="Task" />
              </SelectTrigger>
              <SelectContent>
                {tasksForReassign.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reassignFrom} onValueChange={setReassignFrom}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {reassignTaskId
                  ? (sim.simulatedData?.tasks
                      .find((x) => x.id === reassignTaskId)
                      ?.assigneeIds ?? [])
                      .map((id) => sim.simulatedData?.users.find((u) => u.id === id))
                      .filter(Boolean)
                      .map((u) => (
                        <SelectItem key={u!.id} value={u!.id}>{u!.name}</SelectItem>
                      ))
                  : []}
              </SelectContent>
            </Select>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {(sim.simulatedData?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <Button size="sm" onClick={handleAddStep}>
          <Plus className="h-4 w-4 mr-1" />
          Add step
        </Button>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-h-[320px]">
          <BandwidthTablePanel
            data={sim.baseData}
            title="Current State"
          />
        </div>
        <div className="min-h-[320px]">
          <BandwidthTablePanel
            data={sim.simulatedData}
            title="Simulated State"
            baseData={sim.baseData}
            delta={sim.delta}
            isSimulated
          />
        </div>
      </div>

      {/* Apply / Discard */}
      <div className="flex items-center gap-3 pt-4 border-t border-border/40">
        <Button
          onClick={() => setApplyConfirmOpen(true)}
          disabled={!hasSteps}
        >
          Apply All Changes
        </Button>
        <Button variant="outline" onClick={handleDiscard}>
          Discard Simulation
        </Button>
      </div>
        </TabsContent>
      </Tabs>

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base">Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="e.g. Q4 onboarding"
                className="mt-1 bg-background/60 border-white/10"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Textarea
                value={saveTemplateDesc}
                onChange={(e) => setSaveTemplateDesc(e.target.value)}
                placeholder="When to use this template..."
                className="mt-1 bg-background/60 border-white/10 min-h-[60px]"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!currentUser || !saveTemplateName.trim()) return;
                  saveAsPersonalTemplate({
                    name: saveTemplateName.trim(),
                    description: saveTemplateDesc.trim(),
                    steps: sim.steps,
                    ownerId: currentUser.id,
                  });
                  toast.success('Template saved. Find it in the Templates tab.');
                  setSaveTemplateOpen(false);
                  setSimulationTab('templates');
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply simulation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will apply {sim.steps.length} change{sim.steps.length !== 1 ? 's' : ''} affecting{' '}
              {delta.affectedMemberIds.size} members across {delta.affectedProjectIds.size} projects.
              This cannot be undone automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
