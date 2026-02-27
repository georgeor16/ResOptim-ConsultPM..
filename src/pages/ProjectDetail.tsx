import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { loadData, updateItem, addItem, genId } from '@/lib/store';
import type { Task, TaskStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Clock, Users, DollarSign, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManagerOrAbove, isAdmin, currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', phaseId: '', assigneeId: '', estimatedHours: 0, startDate: '', dueDate: '' });

  const data = useMemo(() => loadData(), [refreshKey]);
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
  const phases = data.phases.filter(p => p.projectId === project.id).sort((a, b) => a.order - b.order);
  const tasks = data.tasks.filter(t => t.projectId === project.id);
  const timelogs = data.timelogs.filter(t => t.projectId === project.id);

  // Financials
  const projectCost = allocations.reduce((c, alloc) => {
    const user = data.users.find(u => u.id === alloc.userId);
    return c + (user ? user.monthlySalary * (alloc.ftePercent / 100) : 0);
  }, 0);
  const margin = project.monthlyFee > 0 ? ((project.monthlyFee - projectCost) / project.monthlyFee) * 100 : 0;
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

  const handleStatusChange = (task: Task, status: TaskStatus) => {
    updateItem('tasks', { ...task, status });
    setRefreshKey(k => k + 1);
  };

  const handleCreateTask = () => {
    if (!newTask.title || !newTask.phaseId) return;
    const phaseTasks = tasks.filter(t => t.phaseId === newTask.phaseId);
    addItem('tasks', {
      id: genId(),
      projectId: project.id,
      phaseId: newTask.phaseId,
      title: newTask.title,
      description: newTask.description,
      assigneeId: newTask.assigneeId || null,
      status: 'To Do' as TaskStatus,
      estimatedHours: newTask.estimatedHours,
      startDate: newTask.startDate,
      dueDate: newTask.dueDate,
      order: phaseTasks.length,
    });
    setNewTask({ title: '', description: '', phaseId: '', assigneeId: '', estimatedHours: 0, startDate: '', dueDate: '' });
    setTaskDialogOpen(false);
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
  const visibleTasks = isManagerOrAbove ? tasks : tasks.filter(t => t.assigneeId === currentUser?.id);

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
          <p className="text-sm text-muted-foreground">{project.client} · {project.category}</p>
        </div>
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
                  Extra billing: €{(alert.delta * alert.alloc.billableHourlyRate).toLocaleString()}
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
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isManagerOrAbove && (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><DollarSign className="h-3.5 w-3.5" />Monthly Fee</div>
                    <p className="text-xl font-bold">€{project.monthlyFee.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><DollarSign className="h-3.5 w-3.5" />Internal Margin</div>
                    <p className={`text-xl font-bold ${marginColor}`}>{margin.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">€{(project.monthlyFee - projectCost).toLocaleString()}</p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1"><CheckCircle2 className="h-3.5 w-3.5" />Progress</div>
                <p className="text-xl font-bold">{progress.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">{doneTasks}/{tasks.length} tasks</p>
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

          {/* Assigned team */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Assigned Team</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {allocations.map(alloc => {
                  const user = data.users.find(u => u.id === alloc.userId);
                  const logged = timelogs.filter(t => t.userId === alloc.userId).reduce((s, t) => s + t.hours, 0);
                  if (!user) return null;
                  return (
                    <div key={alloc.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: user.avatarColor, color: 'white' }}
                        >
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{alloc.ftePercent}% FTE</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Hours</p>
                          <p className={logged > alloc.agreedMonthlyHours ? 'financial-negative font-medium' : ''}>
                            {logged}/{alloc.agreedMonthlyHours}h
                          </p>
                        </div>
                        {isManagerOrAbove && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Rate</p>
                            <p>€{alloc.billableHourlyRate}/h</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks by Phase</h2>
            {isManagerOrAbove && (
              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
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
                      <Label>Assignee</Label>
                      <Select value={newTask.assigneeId} onValueChange={v => setNewTask(t => ({ ...t, assigneeId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                        <SelectContent>
                          {allocations.map(a => {
                            const user = data.users.find(u => u.id === a.userId);
                            return user ? <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem> : null;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>Est. Hours</Label>
                        <Input type="number" value={newTask.estimatedHours} onChange={e => setNewTask(t => ({ ...t, estimatedHours: Number(e.target.value) }))} />
                      </div>
                      <div>
                        <Label>Start</Label>
                        <Input type="date" value={newTask.startDate} onChange={e => setNewTask(t => ({ ...t, startDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Due</Label>
                        <Input type="date" value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} />
                      </div>
                    </div>
                    <Button onClick={handleCreateTask} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Create Task</Button>
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

              return (
                <Card key={phase.id}>
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">{phase.name}</span>
                      <span className="text-xs text-muted-foreground">{phDone}/{phaseTasks.length} done</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t divide-y">
                      {phaseTasks.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">No tasks in this phase</div>
                      ) : (
                        phaseTasks.map(task => {
                          const assignee = data.users.find(u => u.id === task.assigneeId);
                          const taskLogs = timelogs.filter(t => t.taskId === task.id).reduce((s, t) => s + t.hours, 0);
                          const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'Done';

                          return (
                            <div key={task.id} className={`flex items-center justify-between px-5 py-3 ${isOverdue ? 'bg-danger/5' : ''}`}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Select
                                  value={task.status}
                                  onValueChange={(v) => handleStatusChange(task, v as TaskStatus)}
                                  disabled={!isManagerOrAbove && task.assigneeId !== currentUser?.id}
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
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{task.title}</p>
                                  {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                {assignee && (
                                  <div
                                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                    style={{ backgroundColor: assignee.avatarColor, color: 'white' }}
                                    title={assignee.name}
                                  >
                                    {assignee.name.split(' ').map(n => n[0]).join('')}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {taskLogs}/{task.estimatedHours}h
                                </div>
                                {isOverdue && (
                                  <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20 text-xs">
                                    Overdue
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="gantt" className="mt-4">
          <GanttView phases={phases} tasks={visibleTasks} users={data.users} projectStart={project.startDate} projectEnd={project.endDate} />
        </TabsContent>
      </Tabs>
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
                      const assignee = users.find(u => u.id === task.assigneeId);
                      return (
                        <div key={task.id} className="relative h-7 mb-1">
                          <div
                            className="absolute h-6 rounded-md flex items-center px-2 text-xs font-medium truncate"
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
