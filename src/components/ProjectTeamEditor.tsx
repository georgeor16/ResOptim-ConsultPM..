import { useState, useEffect } from 'react';
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
import { LoadPill } from '@/components/LoadPill';
import { addItem, updateItem, deleteItem, genId, loadData } from '@/lib/store';
import {
  getMemberProjectFtePercent,
  getMemberTotalPeakFte,
  getDefaultPeriodBounds,
} from '@/lib/bandwidth';
import { getBandwidthStatus } from '@/lib/fte';
import { getTaskDurationHours } from '@/lib/duration';
import { logActivityEvent } from '@/lib/notifications';
import type { AppData, Allocation, Task, User } from '@/lib/types';
import { Plus, Trash2, UserMinus, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const VIEW_PERIOD = 'month' as const;

interface ProjectTeamEditorProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  /** Initial data; if not provided, will load on open */
  initialData?: AppData | null;
}

export default function ProjectTeamEditor({
  projectId,
  open,
  onOpenChange,
  onUpdated,
  initialData,
}: ProjectTeamEditorProps) {
  const [data, setData] = useState<AppData | null>(initialData ?? null);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignFromUserId, setReassignFromUserId] = useState('');
  const [reassignToUserId, setReassignToUserId] = useState('');

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
    await addItem('allocations', {
      id: genId(),
      projectId: project.id,
      userId: addUserId,
      ftePercent: 0,
      agreedMonthlyHours: 0,
      billableHourlyRate: user.billableHourlyRate,
      ...(addRole.trim() ? { roleOnProject: addRole.trim() } : {}),
    });
    setAddUserId('');
    setAddRole('');
    onUpdated();
    setData(await loadData());
    window.dispatchEvent(new CustomEvent('allocations-updated'));
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
          ftePercent: 0,
          agreedMonthlyHours: 0,
          billableHourlyRate: toUser.billableHourlyRate,
        });
      }
    }

    setReassignTaskId(null);
    setReassignFromUserId('');
    setReassignToUserId('');
    onUpdated();
    setData(await loadData());
    window.dispatchEvent(new CustomEvent('allocations-updated'));
  };

  const handleUpdateRole = async (alloc: Allocation, roleOnProject: string) => {
    await updateItem('allocations', { ...alloc, roleOnProject: roleOnProject || undefined });
    onUpdated();
    setData(await loadData());
    window.dispatchEvent(new CustomEvent('allocations-updated'));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-card/95 backdrop-blur-xl border border-white/10">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground/95">
            Edit Team — {project.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto pr-2 -mr-2">
          {/* Current members */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Team members
            </Label>
            <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40">
              {allocations.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No team members assigned. Add one below.
                </div>
              ) : (
                allocations.map(alloc => {
                  const user = data.users.find(u => u.id === alloc.userId);
                  if (!user) return null;
                  const projectFte = getMemberProjectFtePercent(data, user, project.id, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                  const totalFte = getMemberTotalPeakFte(data, user, VIEW_PERIOD, periodBounds.start, periodBounds.end);
                  const totalFteStatus = getBandwidthStatus(totalFte);
                  const ofTotalFteClass =
                    totalFteStatus === 'overallocated'
                      ? 'text-destructive'
                      : totalFteStatus === 'full'
                        ? 'text-amber-600 dark:text-amber-400'
                        : totalFteStatus === 'approaching'
                          ? 'text-amber-600/80 dark:text-amber-400/80'
                          : '';
                  return (
                    <div
                      key={alloc.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <BandwidthWarning totalFtePercent={totalFte} useBadge={totalFte > 100}>
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: user.avatarColor, color: 'white' }}
                        >
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                      </BandwidthWarning>
                      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <Input
                            placeholder="Role (e.g. Lead)"
                            value={data.allocations.find(a => a.id === alloc.id)?.roleOnProject ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              setData(prev => !prev ? prev : {
                                ...prev,
                                allocations: prev.allocations.map(a =>
                                  a.id === alloc.id ? { ...a, roleOnProject: v || undefined } : a
                                ),
                              });
                            }}
                            onBlur={e => {
                              const v = e.target.value.trim();
                              const current = data.allocations.find(a => a.id === alloc.id);
                              if (current && v !== (current.roleOnProject ?? '')) handleUpdateRole(current, v);
                            }}
                            className="h-7 text-xs bg-background/50 border-white/10 w-28"
                          />
                          <p className="text-xs text-muted-foreground/80 mt-0.5">
                            <span>{Math.round(projectFte)}% on this project</span>
                            <span className="text-muted-foreground/60"> · </span>
                            <span className={ofTotalFteClass || 'text-muted-foreground/80'}>{Math.round(projectFte)}% of total FTE</span>
                          </p>
                        </div>
                        <LoadPill ftePercent={totalFte} showValue={false} />
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
            <div className="flex flex-wrap items-end gap-2">
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger className="w-[200px] h-9 bg-background/50 border-white/10">
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
              <Input
                placeholder="Role (optional)"
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                className="w-28 h-9 text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={!addUserId}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
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
              <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40">
                {tasks.map(task => {
                  const assignees = (task.assigneeIds ?? [])
                    .map(id => data.users.find(u => u.id === id))
                    .filter(Boolean) as User[];
                  const isReassigning = reassignTaskId === task.id;
                  return (
                    <div key={task.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
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
  );
}
