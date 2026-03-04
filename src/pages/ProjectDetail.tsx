import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loadData, updateItem, addItem, deleteItem, deleteProject, genId } from '@/lib/store';
import type { AppData, Task, TaskStatus, TaskDurationUnit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Clock, Users, DollarSign, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Pencil, Trash2, UserCog, FileDown, Check, Square } from 'lucide-react';
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
import AddMemberDialog from '@/components/AddMemberDialog';
import MultiSelectAssignee from '@/components/MultiSelectAssignee';
import EditProjectDialog from '@/components/EditProjectDialog';
import ProjectTeamEditor from '@/components/ProjectTeamEditor';
import { BandwidthWarning } from '@/components/BandwidthWarning';
import { LoadPill } from '@/components/LoadPill';
import { AssigneeSplitControl } from '@/components/AssigneeSplitControl';
import { getBaseCurrency, convertCurrency, formatMoney, formatMoneyWithCode, refreshFxRates, loadFxRates, type CurrencyCode, type FxRates } from '@/lib/currency';
import { durationToHours, getTaskDurationHours } from '@/lib/duration';
import {
  getMemberProjectFtePercent,
  getMemberTotalPeakFte,
  getDefaultPeriodBounds,
  getConcurrencyWarnings,
  type ViewPeriod as BandwidthViewPeriod,
} from '@/lib/bandwidth';
import { getBandwidthStatus } from '@/lib/fte';
import { getMemberCalendar, getAvailableHoursForMember } from '@/lib/calendar';
import { computeTaskFtePercent, computePhaseFtePercent } from '@/lib/fte';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { GanttExportPanel } from '@/components/GanttExportPanel';
import { ActivityFeed } from '@/components/ActivityFeed';
import { getActivityForProject, logActivityEvent } from '@/lib/notifications';
import { cn } from '@/lib/utils';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManagerOrAbove, isAdmin, currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<BandwidthViewPeriod>('month');
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);
  const [inlineDeleteTaskId, setInlineDeleteTaskId] = useState<string | null>(null);
  const ganttChartRef = useRef<HTMLElement | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    phaseId: '',
    assigneeIds: [] as string[],
    durationValue: 8,
    durationUnit: 'hours' as TaskDurationUnit,
    estimatedHours: 8,
    startDate: '',
    dueDate: '',
  });
  const baseCurrency = getBaseCurrency();
  const [rates, setRates] = useState<FxRates>(loadFxRates());

  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    loadData().then(setData);
  }, [refreshKey]);
  useEffect(() => {
    refreshFxRates().then(setRates);
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  const project = data.projects.find(p => p.id === id);

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => navigate('/')} className="mt-4">Back to Dashboard</Button>
      </div>
    );
  }

  const allocations = data.allocations.filter(a => a.projectId === project.id);
  const tasks = data.tasks.filter(t => t.projectId === project.id);
  const phases = data.phases.filter(p => p.projectId === project.id).sort((a, b) => a.order - b.order);
  const timelogs = data.timelogs.filter(t => t.projectId === project.id);
  const periodBounds = getDefaultPeriodBounds(viewPeriod);
  const projectMemberIds = Array.from(
    new Set([
      ...allocations.map(a => a.userId),
      ...tasks.flatMap(t => t.assigneeIds ?? []),
    ])
  );
  const projectMembers = data.users.filter(u => projectMemberIds.includes(u.id));
  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  const projectActivity = getActivityForProject(project.id);

  // Financials (converted to base currency)
  const projectRevenue = conv(project.monthlyFee, project.currency || 'USD');
  const projectCost = allocations.reduce((c, alloc) => {
    const user = data.users.find(u => u.id === alloc.userId);
    return c + (user ? conv(user.monthlySalary * (alloc.ftePercent / 100), user.currency || 'USD') : 0);
  }, 0);
  const margin = projectRevenue > 0 ? ((projectRevenue - projectCost) / projectRevenue) * 100 : 0;
  const marginColor = margin > 30 ? 'financial-positive' : margin > 10 ? 'financial-warning' : 'financial-negative';

  // Overage check
  const overageAlerts = allocations.map(alloc => {
    const user = data.users.find(u => u.id === alloc.userId);
    const logged = timelogs.filter(t => t.userId === alloc.userId).reduce((s, t) => s + t.hours, 0);
    const delta = logged - alloc.agreedMonthlyHours;
    return { user, alloc, logged, delta, overage: delta > 0 };
  }).filter(a => a.overage);

  const doneTasks = tasks.filter(t => t.status === 'Done').length;
  const progress = tasks.length > 0 ? (doneTasks / tasks.length) * 100 : 0;

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    const wasDone = task.status === 'Done';
    await updateItem('tasks', { ...task, status });
    if (!wasDone && status === 'Done') {
      logActivityEvent({
        userId: currentUser?.id || 'system',
        projectId: project.id,
        taskId: task.id,
        type: 'task_completed',
        message: `Task "${task.title}" was marked complete`,
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleCompletionToggle = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'Done' ? 'To Do' : 'Done';
    await updateItem('tasks', { ...task, status: nextStatus });
    setRefreshKey(k => k + 1);
  };

  const handleCreateTask = async () => {
    if (!newTask.title) return;

    // Ensure we have a phase to attach the task to
    let targetPhaseId = newTask.phaseId;
    if (!targetPhaseId) {
      if (phases.length === 0) {
        const newPhaseId = genId();
        await addItem('phases', {
          id: newPhaseId,
          projectId: project.id,
          name: 'General',
          order: 0,
        });
        targetPhaseId = newPhaseId;
      } else {
        targetPhaseId = phases[0].id;
      }
    }

    const phaseTasks = tasks.filter(t => t.phaseId === targetPhaseId);
    const estimatedHours = newTask.durationValue != null && newTask.durationUnit
      ? durationToHours(newTask.durationValue, newTask.durationUnit)
      : newTask.estimatedHours;
    const idNew = genId();
    await addItem('tasks', {
      id: idNew,
      projectId: project.id,
      phaseId: targetPhaseId,
      title: newTask.title,
      description: newTask.description,
      assigneeIds: newTask.assigneeIds,
      status: 'To Do' as TaskStatus,
      durationValue: newTask.durationValue,
      durationUnit: newTask.durationUnit,
      estimatedHours,
      startDate: newTask.startDate || project.startDate,
      dueDate: newTask.dueDate || project.endDate,
      order: phaseTasks.length,
    });
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_created',
      message: `Task "${newTask.title}" created in project ${project.name}`,
    });

    setNewTask({
      title: '',
      description: '',
      phaseId: '',
      assigneeIds: [],
      durationValue: 8,
      durationUnit: 'hours',
      estimatedHours: 8,
      startDate: '',
      dueDate: '',
    });
    setTaskDialogOpen(false);
    setRefreshKey(k => k + 1);
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = data.tasks.find(t => t.id === taskId);
    const timelogsToDelete = data.timelogs.filter(t => t.taskId === taskId);
    const subtasksToDelete = data.subtasks.filter(s => s.taskId === taskId);
    for (const t of timelogsToDelete) await deleteItem('timelogs', t.id);
    for (const s of subtasksToDelete) await deleteItem('subtasks', s.id);
    await deleteItem('tasks', taskId);
    if (task) {
      logActivityEvent({
        userId: currentUser?.id || 'system',
        projectId: project.id,
        taskId,
        type: 'task_deleted',
        message: `Task "${task.title}" was deleted`,
      });
    }
    setRefreshKey(k => k + 1);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask({
      ...task,
      durationValue: task.durationValue ?? task.estimatedHours,
      durationUnit: task.durationUnit ?? 'hours',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    await updateItem('tasks', editingTask);
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      taskId: editingTask.id,
      type: 'task_updated',
      message: `Task "${editingTask.title}" was updated`,
    });
    setEditDialogOpen(false);
    setEditingTask(null);
    setRefreshKey(k => k + 1);
  };

  const statusBadge = (status: TaskStatus) => {
    const colors: Record<TaskStatus, string> = {
      'To Do': 'bg-secondary text-secondary-foreground',
      'In Progress': 'bg-accent/10 text-accent border-accent/20',
      'Blocked': 'bg-danger/10 text-danger border-danger/20',
      'Done': 'bg-success/10 text-success border-success/20',
    };
    return <Badge variant="outline" className={colors[status]}>{status}</Badge>;
  };

  // Filter tasks for team members
  const visibleTasks = isManagerOrAbove ? tasks : tasks.filter(t => (t.assigneeIds || []).includes(currentUser?.id || ''));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <Badge variant="outline" className={
              project.status === 'Active' ? 'bg-status-active/10 text-status-active border-status-active/20' :
              project.status === 'On Hold' ? 'bg-status-onhold/10 text-status-onhold border-status-onhold/20' :
              'bg-status-completed/10 text-status-completed border-status-completed/20'
            }>
              {project.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.client} · {project.category}{project.category === 'Other' && project.categoryOtherSpec ? ` (${project.categoryOtherSpec})` : ''}</p>
        </div>
        {isManagerOrAbove && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTeamEditorOpen(true)}
              className="gap-1.5"
            >
              <UserCog className="h-4 w-4" />
              Edit Team
            </Button>
            <AddMemberDialog
              projectId={project.id}
              projectCurrency={(project.currency || 'USD') as CurrencyCode}
              availableUsers={data.users.filter(u => !allocations.some(a => a.userId === u.id))}
              onAdded={() => setRefreshKey(k => k + 1)}
            />
            <EditProjectDialog project={project} onUpdated={() => setRefreshKey(k => k + 1)} />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Overage alerts */}
      {isManagerOrAbove && overageAlerts.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="font-medium text-sm">Billing Overage Alert</span>
            </div>
            {overageAlerts.map(alert => (
              <p key={alert.user?.id} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{alert.user?.name}</span>: {alert.logged}h logged vs {alert.alloc.agreedMonthlyHours}h cap →{' '}
                <span className="font-semibold text-warning">
                  Extra billing: {formatMoney(alert.delta * alert.alloc.billableHourlyRate, (project.currency || 'USD') as CurrencyCode)}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isManagerOrAbove && (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><DollarSign className="h-3.5 w-3.5" />Fee</div>
                    <p className="text-xl font-bold">{formatMoneyWithCode(projectRevenue, baseCurrency as CurrencyCode)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><DollarSign className="h-3.5 w-3.5" />Internal Margin</div>
                    <p className={`text-xl font-bold ${marginColor}`}>{margin.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">{formatMoneyWithCode(projectRevenue - projectCost, baseCurrency as CurrencyCode)}</p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><CheckCircle2 className="h-3.5 w-3.5" />Progress</div>
                <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40 transition-all duration-300"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-muted-foreground/90">{progress.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground/70">{doneTasks}/{tasks.length} tasks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><Users className="h-3.5 w-3.5" />Team</div>
                <p className="text-xl font-bold">{allocations.length}</p>
                <p className="text-xs text-muted-foreground">assigned members</p>
              </CardContent>
            </Card>
          </div>

          {/* Assigned team — task-derived commitment, view period, load pill */}
          <Card className="bg-card/80 backdrop-blur-sm border-white/10">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Assigned Team</CardTitle>
              <Select value={viewPeriod} onValueChange={v => setViewPeriod(v as BandwidthViewPeriod)}>
                <SelectTrigger className="w-[120px] h-8 text-xs bg-background/50 border-white/10">
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
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {projectMembers.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm text-muted-foreground">No team members on this project</div>
                ) : (
                  projectMembers.map(user => {
                    const alloc = allocations.find(a => a.userId === user.id);
                    const projectFte = getMemberProjectFtePercent(data, user, project.id, viewPeriod, periodBounds.start, periodBounds.end);
                    const totalPeakFte = getMemberTotalPeakFte(data, user, viewPeriod, periodBounds.start, periodBounds.end);
                    const logged = timelogs.filter(t => t.userId === user.id).reduce((s, t) => s + t.hours, 0);
                    const totalFteStatus = getBandwidthStatus(totalPeakFte);
                    const ofTotalFteClass =
                      totalFteStatus === 'overallocated'
                        ? 'text-destructive'
                        : totalFteStatus === 'full'
                          ? 'text-amber-600 dark:text-amber-400'
                          : totalFteStatus === 'approaching'
                            ? 'text-amber-600/80 dark:text-amber-400/80'
                            : '';
                    return (
                      <div key={user.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <BandwidthWarning totalFtePercent={totalPeakFte}>
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: user.avatarColor, color: 'white' }}
                            >
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </div>
                          </BandwidthWarning>
                          <div>
                            <p className="text-sm font-medium text-foreground/95">{user.name}</p>
                            {alloc?.roleOnProject && <p className="text-xs text-muted-foreground">{alloc.roleOnProject}</p>}
                            <p className="text-xs text-muted-foreground/80">
                              <span>{Math.round(projectFte)}% on this project</span>
                              <span className="text-muted-foreground/60"> · </span>
                              <span className={ofTotalFteClass || 'text-muted-foreground/80'}>{Math.round(projectFte)}% of total FTE</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <LoadPill ftePercent={totalPeakFte} showValue={true} />
                          {isManagerOrAbove && alloc && (
                            <>
                              <div className="text-right text-xs text-muted-foreground">
                                <p>Logged {logged}h</p>
                                <p>{formatMoney(alloc.billableHourlyRate, (project.currency || 'USD') as CurrencyCode)}/h</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={async () => {
                                  await deleteItem('allocations', alloc.id);
                                  setRefreshKey(k => k + 1);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Tasks by Phase</h2>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Checkbox
                checked={showCompletedTasks}
                onCheckedChange={v => setShowCompletedTasks(v === true)}
              />
              <span>Show completed tasks</span>
            </label>
            {isManagerOrAbove && (
              <Dialog
                open={taskDialogOpen}
                onOpenChange={open => {
                  setTaskDialogOpen(open);
                  if (open && !newTask.phaseId && phases.length > 0) {
                    setNewTask(t => ({ ...t, phaseId: phases[0].id }));
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Plus className="h-4 w-4 mr-1" /> Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Title</Label>
                      <Input value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={newTask.description} onChange={e => setNewTask(t => ({ ...t, description: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Phase</Label>
                      <Select value={newTask.phaseId} onValueChange={v => setNewTask(t => ({ ...t, phaseId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
                        <SelectContent>
                          {phases.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Assignees</Label>
                      <MultiSelectAssignee
                        users={allocations.map(a => data.users.find(u => u.id === a.userId)!).filter(Boolean)}
                        allUsers={data.users}
                        allocations={data.allocations.filter(a => data.projects.some(p => p.status === 'Active' && p.id === a.projectId))}
                        selectedIds={newTask.assigneeIds}
                        onChange={ids => setNewTask(t => ({ ...t, assigneeIds: ids }))}
                      />
                    </div>
                    <div>
                      <Label>Duration</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={newTask.durationValue}
                          onChange={e => {
                            const v = Number(e.target.value);
                            setNewTask(t => ({ ...t, durationValue: v, estimatedHours: durationToHours(v, t.durationUnit) }));
                          }}
                          className="w-24"
                        />
                        <Select
                          value={newTask.durationUnit}
                          onValueChange={u => {
                            const unit = u as TaskDurationUnit;
                            setNewTask(t => ({ ...t, durationUnit: unit, estimatedHours: durationToHours(t.durationValue, unit) }));
                          }}
                        >
                          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                            <SelectItem value="months">Months</SelectItem>
                            <SelectItem value="quarters">Quarters</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">= {durationToHours(newTask.durationValue, newTask.durationUnit)}h effort</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Start</Label>
                        <Input type="date" value={newTask.startDate} onChange={e => setNewTask(t => ({ ...t, startDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Due</Label>
                        <Input type="date" value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} />
                      </div>
                    </div>
                    <Button
                      onClick={handleCreateTask}
                      disabled={!newTask.title}
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Create Task
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {phases.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No phases defined for this project yet.</p>
              </CardContent>
            </Card>
          ) : (
            phases.map(phase => {
              const phaseTasks = visibleTasks.filter(t => t.phaseId === phase.id).sort((a, b) => a.order - b.order);
              const phDone = phaseTasks.filter(t => t.status === 'Done').length;
              const expanded = expandedPhases.has(phase.id);
              const phaseFte = computePhaseFtePercent(phaseTasks);
              const plannedFte = phase.plannedFtePercent;

              return (
                <Card key={phase.id}>
                  <div
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors cursor-pointer"
                    onClick={() => togglePhase(phase.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div
                        className="flex items-center gap-2"
                        onClick={e => {
                          // prevent toggle when editing the phase name
                          e.stopPropagation();
                        }}
                      >
                        {isManagerOrAbove ? (
                          <Input
                            defaultValue={phase.name}
                            onBlur={async e => {
                              const value = e.target.value.trim();
                              if (value && value !== phase.name) {
                                await updateItem('phases', { ...phase, name: value });
                                logActivityEvent({
                                  userId: currentUser?.id || 'system',
                                  projectId: project.id,
                                  type: 'phase_updated',
                                  message: `Phase "${phase.name}" was renamed to "${value}" in project ${project.name}`,
                                });
                                setRefreshKey(k => k + 1);
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="h-7 text-sm font-semibold bg-background/40 border-white/10 px-2 py-1 w-40"
                          />
                        ) : (
                          <span className="font-semibold">{phase.name}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{phDone}/{phaseTasks.length} done</span>
                      </div>
                      {typeof plannedFte === 'number' && (
                        <Badge variant="outline" className="text-[10px] bg-secondary/60 text-secondary-foreground border-border">
                          Plan {plannedFte}% FTE
                        </Badge>
                      )}
                      {phaseTasks.length > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">
                          {phaseFte}% FTE
                        </Badge>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t divide-y">
                      {phaseTasks.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">No tasks in this phase</div>
                      ) : (
                        <>
                          {(showCompletedTasks ? phaseTasks : phaseTasks.filter(t => t.status !== 'Done')).map(task => {
                          const assignees = data.users.filter(u => (task.assigneeIds || []).includes(u.id));
                          const taskLogs = timelogs.filter(t => t.taskId === task.id).reduce((s, t) => s + t.hours, 0);
                          const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'Done';
                          const taskHours = getTaskDurationHours(task);
                          const taskFte = computeTaskFtePercent(taskHours, task.startDate, task.dueDate);
                          const concurrencyWarnings = assignees.flatMap(u =>
                            getConcurrencyWarnings(data, u, viewPeriod, project.startDate, project.endDate, 75)
                              .filter(w => w.taskNames.includes(task.title))
                              .map(w => ({ user: u, ...w }))
                          );
                          const noAvailabilityAssignees = assignees.filter(u => {
                            const profile = getMemberCalendar(u);
                            return getAvailableHoursForMember(profile, task.startDate, task.dueDate) === 0;
                          });
                          const canToggle = isManagerOrAbove || (task.assigneeIds || []).includes(currentUser?.id || '');

                          return (
                            <div key={task.id} className={`flex items-center justify-between px-5 py-3 ${isOverdue ? 'bg-danger/5' : ''} ${task.status === 'Done' ? 'opacity-75' : ''}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => canToggle && handleCompletionToggle(task)}
                                  disabled={!canToggle}
                                  className={cn(
                                    'h-6 w-6 shrink-0 rounded-md border border-white/20 bg-background/50 backdrop-blur-sm flex items-center justify-center transition-opacity',
                                    canToggle && 'hover:bg-muted/50 cursor-pointer',
                                    !canToggle && 'cursor-default opacity-60',
                                    task.status === 'Done' && 'bg-accent/20 border-accent/30'
                                  )}
                                  aria-label={task.status === 'Done' ? 'Mark incomplete' : 'Mark complete'}
                                >
                                  {task.status === 'Done' ? <Check className="h-3.5 w-3.5 text-accent-foreground" /> : <Square className="h-3.5 w-3.5 text-muted-foreground/60" />}
                                </button>
                                <Select
                                  value={task.status}
                                  onValueChange={(v) => handleStatusChange(task, v as TaskStatus)}
                                  disabled={!isManagerOrAbove && !(task.assigneeIds || []).includes(currentUser?.id || '')}
                                >
                                  <SelectTrigger className="w-[130px] h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="To Do">To Do</SelectItem>
                                    <SelectItem value="In Progress">In Progress</SelectItem>
                                    <SelectItem value="Blocked">Blocked</SelectItem>
                                    <SelectItem value="Done">Done</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <Input
                                    defaultValue={task.title}
                                    onBlur={async e => {
                                      const value = e.target.value.trim();
                                      if (value && value !== task.title) {
                                        await updateItem('tasks', { ...task, title: value });
                                        setRefreshKey(k => k + 1);
                                      }
                                    }}
                                    onKeyDown={async e => {
                                      if (e.key === 'Enter') {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className={cn(
                                      'h-7 text-sm bg-background/40 border-white/10 px-2 py-1',
                                      task.status === 'Done' && 'line-through text-muted-foreground'
                                    )}
                                  />
                                  {task.description && (
                                    <Input
                                      defaultValue={task.description}
                                      onBlur={async e => {
                                        const value = e.target.value;
                                        if (value !== task.description) {
                                          await updateItem('tasks', { ...task, description: value });
                                          setRefreshKey(k => k + 1);
                                        }
                                      }}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      className="h-7 text-xs bg-background/30 border-white/10 px-2 py-1 text-muted-foreground"
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {assignees.length > 0 && (
                                  <div className="flex -space-x-1.5">
                                    {assignees.map(assignee => (
                                      <div
                                        key={assignee.id}
                                        className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background"
                                        style={{ backgroundColor: assignee.avatarColor, color: 'white' }}
                                        title={assignee.name}
                                      >
                                        {assignee.name.split(' ').map(n => n[0]).join('')}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {taskLogs}/{taskHours}h
                                  </span>
                                  <Badge variant="outline" className="text-[10px] font-normal bg-accent/5 text-accent border-accent/20">
                                    {taskFte}% FTE
                                  </Badge>
                                  {concurrencyWarnings.length > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium cursor-help">
                                          Concurrency
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[220px]">
                                        {concurrencyWarnings.slice(0, 3).map((w, i) => (
                                          <p key={i} className="text-xs">
                                            {w.user.name} at {Math.round(w.ftePercent)}% during {w.slotLabel} (overlapping tasks)
                                          </p>
                                        ))}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {noAvailabilityAssignees.length > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium cursor-help">
                                          No hours
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[220px]">
                                        {noAvailabilityAssignees.map(u => (
                                          <p key={u.id} className="text-xs">
                                            {u.name} has no available hours during this task window
                                          </p>
                                        ))}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {isOverdue && (
                                  <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20 text-xs">
                                    Overdue
                                  </Badge>
                                )}
                                {isManagerOrAbove && (
                                  <div className="flex items-center gap-1">
                                    {inlineDeleteTaskId === task.id ? (
                                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-destructive/5 rounded-full px-3 py-1">
                                        <span>Delete this task? Member FTE % will update.</span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                          onClick={async () => {
                                            await handleDeleteTask(task.id);
                                            setInlineDeleteTaskId(null);
                                          }}
                                        >
                                          Confirm
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => setInlineDeleteTaskId(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => setInlineDeleteTaskId(task.id)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        </>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
          {!showCompletedTasks && doneTasks > 0 && (
            <p className="text-xs text-muted-foreground/70 text-center py-2">
              {doneTasks} task{doneTasks !== 1 ? 's' : ''} completed
            </p>
          )}
        </TabsContent>

        {/* Edit Task Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Task</DialogTitle>
            </DialogHeader>
            {editingTask && (
              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input value={editingTask.title} onChange={e => setEditingTask(t => t ? { ...t, title: e.target.value } : t)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={editingTask.description} onChange={e => setEditingTask(t => t ? { ...t, description: e.target.value } : t)} />
                </div>
                <div>
                  <Label>Phase</Label>
                  <Select value={editingTask.phaseId} onValueChange={v => setEditingTask(t => t ? { ...t, phaseId: v } : t)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {phases.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assignees</Label>
                  <MultiSelectAssignee
                    users={allocations.map(a => data.users.find(u => u.id === a.userId)!).filter(Boolean)}
                    allUsers={data.users}
                    allocations={data.allocations.filter(a => data.projects.some(p => p.status === 'Active' && p.id === a.projectId))}
                    selectedIds={editingTask.assigneeIds}
                    onChange={ids => setEditingTask(t => t ? { ...t, assigneeIds: ids } : t)}
                  />
                </div>
                {editingTask.assigneeIds.length > 1 && (
                  <div>
                    <Label className="text-xs">Allocation split %</Label>
                    <AssigneeSplitControl
                      task={editingTask}
                      assignees={data.users.filter(u => editingTask.assigneeIds.includes(u.id))}
                      onChange={split => setEditingTask(t => t ? { ...t, assigneeSplit: split } : t)}
                    />
                  </div>
                )}
                <div>
                  <Label>Status</Label>
                  <Select value={editingTask.status} onValueChange={v => setEditingTask(t => t ? { ...t, status: v as TaskStatus } : t)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="To Do">To Do</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Blocked">Blocked</SelectItem>
                      <SelectItem value="Done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duration</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={editingTask.durationValue ?? 0}
                      onChange={e => {
                        const v = Number(e.target.value);
                        const unit = editingTask.durationUnit ?? 'hours';
                        setEditingTask(t => t ? { ...t, durationValue: v, estimatedHours: durationToHours(v, unit) } : t);
                      }}
                      className="w-24"
                    />
                    <Select
                      value={editingTask.durationUnit ?? 'hours'}
                      onValueChange={u => {
                        const unit = u as TaskDurationUnit;
                        const val = editingTask.durationValue ?? editingTask.estimatedHours ?? 0;
                        setEditingTask(t => t ? { ...t, durationUnit: unit, durationValue: val, estimatedHours: durationToHours(val, unit) } : t);
                      }}
                    >
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                        <SelectItem value="quarters">Quarters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">= {getTaskDurationHours(editingTask)}h effort</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start</Label>
                    <Input type="date" value={editingTask.startDate} onChange={e => setEditingTask(t => t ? { ...t, startDate: e.target.value } : t)} />
                  </div>
                  <div>
                    <Label>Due</Label>
                    <Input type="date" value={editingTask.dueDate} onChange={e => setEditingTask(t => t ? { ...t, dueDate: e.target.value } : t)} />
                  </div>
                </div>
                <Button onClick={handleSaveEdit} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Save Changes</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <TabsContent value="gantt" className="mt-4">
          <div className="relative">
            <div ref={ganttChartRef}>
              <GanttView key={refreshKey} phases={phases} tasks={visibleTasks} users={data.users} projectStart={project.startDate} projectEnd={project.endDate} />
            </div>
            <button
              type="button"
              onClick={() => setExportPanelOpen(true)}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-muted-foreground hover:text-foreground hover:bg-background/90 flex items-center justify-center shadow-sm transition-colors"
              aria-label="Export Gantt"
            >
              <FileDown className="h-4 w-4" />
            </button>
          </div>
          <GanttExportPanel
            open={exportPanelOpen}
            onOpenChange={setExportPanelOpen}
            data={data}
            exportTitle={project.name}
            isCumulative={false}
            singleProjectId={project.id}
            chartRef={ganttChartRef}
            onExportPdf={(blob, filename) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
            }}
            onExportPng={(blob, filename) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="bg-card/80 backdrop-blur-sm border-white/10">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Activity Feed</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <ActivityFeed events={projectActivity} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProjectTeamEditor
        projectId={project.id}
        open={teamEditorOpen}
        onOpenChange={setTeamEditorOpen}
        onUpdated={() => setRefreshKey(k => k + 1)}
        initialData={data}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? This will remove the project, its phases, tasks, allocations, and related data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await deleteProject(project.id);
                setDeleteConfirmOpen(false);
                navigate('/projects');
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Simple Gantt chart component
function GanttView({ phases, tasks, users, projectStart, projectEnd }: {
  phases: { id: string; name: string; order: number }[];
  tasks: Task[];
  users: { id: string; name: string; avatarColor: string }[];
  projectStart: string;
  projectEnd: string;
}) {
  const start = new Date(projectStart);
  const end = new Date(projectEnd);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const today = new Date();
  const todayOffset = Math.max(0, Math.min(100, ((today.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100));

  // Generate month labels
  const months: { label: string; offset: number; width: number }[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  while (cursor <= end) {
    const monthStart = Math.max(0, (cursor.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100);
    const nextMonth = new Date(cursor);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = Math.min(100, (nextMonth.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100);
    months.push({
      label: cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      offset: monthStart,
      width: monthEnd - monthStart,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const phaseColors = ['hsl(170, 60%, 40%)', 'hsl(222, 47%, 30%)', 'hsl(270, 50%, 45%)', 'hsl(38, 70%, 50%)', 'hsl(340, 60%, 50%)'];

  const getBarStyle = (startDate: string, endDate: string) => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const left = Math.max(0, ((s.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
    const width = Math.max(1, ((e.getTime() - s.getTime()) / (end.getTime() - start.getTime())) * 100);
    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
  };

  return (
    <Card>
      <CardContent className="p-4 overflow-x-auto">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No tasks to display</div>
        ) : (
          <div className="min-w-[600px]">
            {/* Month headers */}
            <div className="relative h-8 border-b mb-2">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 text-xs text-muted-foreground font-medium" style={{ left: `${m.offset}%` }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* Today marker */}
            <div className="relative">
              <div
                className="absolute top-0 bottom-0 w-px bg-accent z-10"
                style={{ left: `${todayOffset}%` }}
              >
                <div className="absolute -top-5 -translate-x-1/2 text-[10px] text-accent font-medium">Today</div>
              </div>

              {phases.map((phase, pi) => {
                const phaseTasks = tasks.filter(t => t.phaseId === phase.id).sort((a, b) => a.order - b.order);
                if (phaseTasks.length === 0) return null;
                return (
                  <div key={phase.id} className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{phase.name}</p>
                    {phaseTasks.map(task => {
                      const bar = getBarStyle(task.startDate, task.dueDate);
                      const isOverdue = new Date(task.dueDate) < today && task.status !== 'Done';
                      const assignee = users.find(u => (task.assigneeIds || []).includes(u.id));
                      return (
                        <div key={task.id} className="relative h-7 mb-1">
                          <div
                            className={cn(
                              'absolute h-6 rounded-md flex items-center px-2 text-xs font-medium truncate',
                              task.status === 'Done' && 'line-through'
                            )}
                            style={{
                              ...bar,
                              backgroundColor: isOverdue ? 'hsl(0, 72%, 51%)' : phaseColors[pi % phaseColors.length],
                              color: 'white',
                              opacity: task.status === 'Done' ? 0.5 : 1,
                            }}
                            title={`${task.title} (${task.status})`}
                          >
                            {task.title}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
