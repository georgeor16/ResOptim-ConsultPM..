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
import { ArrowLeft, Plus, Clock, Users, DollarSign, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Pencil, Trash2, UserCog, FileDown, Check, Square, GripVertical, FolderInput, UserPlus, X, FlaskConical } from 'lucide-react';
import { addDays, addWeeks, addMonths, parseISO, differenceInDays, format } from 'date-fns';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
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
import { toast } from 'sonner';
import { checkExternalConflictsAfterChange, wasProjectAffectedByExternalChange } from '@/lib/bandwidthConflicts';
import { showExternalConflictToast } from '@/components/ConflictResolutionSheet';
import { useSimulationOptional } from '@/contexts/SimulationContext';
import AddMemberDialog from '@/components/AddMemberDialog';
import MultiSelectAssignee from '@/components/MultiSelectAssignee';
import EditProjectDialog from '@/components/EditProjectDialog';
import ProjectTeamEditor from '@/components/ProjectTeamEditor';
import { BandwidthWarning } from '@/components/BandwidthWarning';
import { LoadPill } from '@/components/LoadPill';
import { AssigneeSplitControl } from '@/components/AssigneeSplitControl';
import { getBaseCurrency, convertCurrency, formatMoney, formatMoneyWithCode, refreshFxRates, loadFxRates, type CurrencyCode, type FxRates } from '@/lib/currency';
import { durationToHours, getTaskDurationHours, HOURS_PER_DAY } from '@/lib/duration';
import {
  getMemberProjectFtePercent,
  getMemberTotalPeakFte,
  getDefaultPeriodBounds,
  getConcurrencyWarnings,
  getCapacityConflict,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Phase = { id: string; name: string; order: number; projectId: string; plannedFtePercent?: number; startDate?: string; endDate?: string };
type User = { id: string; name: string; avatarColor: string };

function PhaseTimelineContext(props: {
  phase: Phase;
  phaseTasks: Task[];
  taskStart?: string;
  taskEnd?: string;
  today: Date;
  taskColor?: string;
}) {
  const { phase, phaseTasks, taskStart, taskEnd, today, taskColor } = props;
  const hasPhaseDates = !!phase.startDate && !!phase.endDate;

  if (!hasPhaseDates) {
    return (
      <div className="mt-2 text-[11px] text-muted-foreground/80">
        No dates set for this phase — add phase dates to see timeline context.
      </div>
    );
  }

  const phaseStart = parseISO(phase.startDate!);
  const phaseEnd = parseISO(phase.endDate!);
  const phaseSpanMs = Math.max(1, phaseEnd.getTime() - phaseStart.getTime());

  const taskStartDate = taskStart ? parseISO(taskStart) : null;
  const taskEndDate = taskEnd ? parseISO(taskEnd) : null;

  let innerLeft = 0;
  let innerWidth = 0;
  let overflow = false;

  if (taskStartDate && taskEndDate) {
    const clampedStart = taskStartDate.getTime();
    const clampedEnd = taskEndDate.getTime();
    const leftMs = Math.max(0, clampedStart - phaseStart.getTime());
    const rightMs = Math.min(phaseEnd.getTime(), clampedEnd) - phaseStart.getTime();
    innerLeft = (leftMs / phaseSpanMs) * 100;
    innerWidth = Math.max(2, ((rightMs - leftMs) / phaseSpanMs) * 100);
    overflow = clampedStart < phaseStart.getTime() || clampedEnd > phaseEnd.getTime();
  }

  const todayInPhase = today >= phaseStart && today <= phaseEnd;
  const todayLeft = todayInPhase ? ((today.getTime() - phaseStart.getTime()) / phaseSpanMs) * 100 : 0;

  const totalHours = phaseTasks.reduce((sum, t) => sum + getTaskDurationHours(t), 0);
  const totalDays = totalHours / HOURS_PER_DAY;
  const phaseSpanDays = Math.max(0, differenceInDays(phaseEnd, phaseStart) + 1);
  const remainingDays = Math.max(0, phaseSpanDays - totalDays);
  const totalWeeks = totalDays / 7;
  const remainingWeeks = remainingDays / 7;

  return (
    <div className="mt-3 space-y-1">
      <p className="text-[11px] text-muted-foreground/80">
        Phase: {format(phaseStart, 'MMM d')} → {format(phaseEnd, 'MMM d')}
      </p>
      <div className="relative h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className="absolute inset-0 rounded-full bg-background/20" />
        {taskStartDate && taskEndDate && (
          <div
            className={cn(
              'absolute top-0 bottom-0 rounded-full',
              overflow ? 'bg-amber-400/60' : taskColor ? '' : 'bg-accent/60'
            )}
            style={{
              left: `${innerLeft}%`,
              width: `${innerWidth}%`,
              backgroundColor: !overflow && taskColor ? taskColor : undefined,
            }}
          />
        )}
        {todayInPhase && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-px bg-foreground/60"
            style={{ left: `${todayLeft}%` }}
          />
        )}
      </div>
      {overflow && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Task extends beyond phase dates
        </p>
      )}
      <p className="text-[11px] text-muted-foreground/80">
        {phaseTasks.length} task{phaseTasks.length !== 1 ? 's' : ''} · ~{totalWeeks.toFixed(1)} weeks
        total · ~{remainingWeeks.toFixed(1)} weeks remaining in phase
      </p>
    </div>
  );
}

function DraggableTaskRow(props: {
  task: Task;
  assignees: User[];
  overCapacityUserIds?: Set<string>;
  externallyAffectedUserIds?: Set<string>;
  taskLogs: number;
  taskHours: number;
  taskFte: number;
  isOverdue: boolean;
  concurrencyWarnings: { user: User; ftePercent: number; slotLabel: string }[];
  noAvailabilityAssignees: User[];
  canToggle: boolean;
  isManagerOrAbove: boolean;
  showCompletedTasks: boolean;
  activeDragTaskId: string | null;
  isSelected: boolean;
  onSelectToggle: (taskId: string) => void;
  onRowClick: (taskId: string, event: React.MouseEvent) => void;
  onCompletionToggle: (task: Task) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onTitleBlur: (task: Task, value: string) => void;
  onDescriptionBlur: (task: Task, value: string) => void;
  onDeleteClick: (taskId: string) => void;
  onDeleteConfirm: (taskId: string) => void;
  onDeleteCancel: () => void;
  inlineDeleteTaskId: string | null;
  currentUserId: string;
  updateItem: (key: 'tasks', item: Task) => Promise<void>;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}) {
  const {
    task,
    assignees,
    overCapacityUserIds,
    taskLogs,
    taskHours,
    taskFte,
    isOverdue,
    concurrencyWarnings,
    noAvailabilityAssignees,
    canToggle,
    isManagerOrAbove,
    showCompletedTasks,
    activeDragTaskId,
    isSelected,
    onSelectToggle,
    onRowClick,
    onCompletionToggle,
    onStatusChange,
    onTitleBlur,
    onDescriptionBlur,
    onDeleteClick,
    onDeleteConfirm,
    onDeleteCancel,
    inlineDeleteTaskId,
    currentUserId,
  } = props;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: task.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: task.id });
  const setRowRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const isHidden = !showCompletedTasks && task.status === 'Done';
  const showPlaceholderAbove = isOver && activeDragTaskId !== task.id;

  return (
    <div
      ref={setRowRef}
      role="button"
      tabIndex={0}
      onClick={(e) => onRowClick(task.id, e)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onRowClick(task.id, e as unknown as React.MouseEvent); }}
      className={cn(
        'group relative flex items-center justify-between px-5 py-3 transition-all',
        isOverdue && 'bg-danger/5',
        task.status === 'Done' && 'opacity-75',
        isHidden && 'hidden',
        isDragging && 'opacity-50 shadow-lg',
        isSelected && 'bg-accent/10 border-l-2 border-l-accent/50',
      )}
    >
      {showPlaceholderAbove && (
        <div className="absolute left-4 right-4 top-0 h-0.5 bg-accent/60 rounded-full z-10 pointer-events-none" aria-hidden />
      )}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectToggle(task.id); }}
          className="shrink-0 h-5 w-5 rounded border border-white/20 bg-background/50 backdrop-blur-sm flex items-center justify-center hover:bg-muted/50 transition-colors"
          aria-label={isSelected ? 'Deselect task' : 'Select task'}
        >
          {isSelected ? <Check className="h-3 w-3 text-accent" /> : null}
        </button>
        <button
          type="button"
          className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 shrink-0" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); canToggle && onCompletionToggle(task); }}
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
        <Select value={task.status} onValueChange={(v) => onStatusChange(task, v as TaskStatus)} disabled={!isManagerOrAbove && !(task.assigneeIds || []).includes(currentUserId)}>
          <SelectTrigger className="w-[130px] h-7 text-xs" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="To Do">To Do</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Blocked">Blocked</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1 min-w-0 space-y-0.5" onClick={(e) => e.stopPropagation()}>
          <Input
            defaultValue={task.title}
            onBlur={async (e) => {
              const value = e.target.value.trim();
              if (value && value !== task.title) {
                await props.updateItem('tasks', { ...task, title: value });
                props.setRefreshKey((k) => k + 1);
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className={cn(
              'h-7 text-sm bg-background/40 border-white/10 px-2 py-1',
              task.status === 'Done' && 'line-through text-muted-foreground'
            )}
          />
          {task.description && (
            <Textarea
              defaultValue={task.description}
              onBlur={async (e) => {
                const value = e.target.value;
                if (value !== task.description) {
                  await props.updateItem('tasks', { ...task, description: value });
                  props.setRefreshKey((k) => k + 1);
                }
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }}
              className="min-h-[2.25rem] text-xs bg-background/30 border-white/10 px-2 py-1 text-muted-foreground resize-none whitespace-pre-wrap break-words overflow-hidden"
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {assignees.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {assignees.map((assignee) => (
                <div
                  key={assignee.id}
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background"
                  style={{ backgroundColor: assignee.avatarColor, color: 'white' }}
                  title={assignee.name}
                >
                  {assignee.name.split(' ').map((n) => n[0]).join('')}
                </div>
              ))}
            </div>
            {overCapacityUserIds && assignees.some((a) => overCapacityUserIds.has(a.id)) && (
              <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-normal">Over capacity commitment</span>
            )}
            {externallyAffectedUserIds && assignees.some((a) => externallyAffectedUserIds.has(a.id)) && (
              <span className="text-[10px] text-muted-foreground/80 font-normal">Bandwidth reduced externally</span>
            )}
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
                <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium cursor-help">Concurrency</span>
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
                <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium cursor-help">No hours</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px]">
                {noAvailabilityAssignees.map((u) => (
                  <p key={u.id} className="text-xs">{u.name} has no available hours during this task window</p>
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
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {inlineDeleteTaskId === task.id ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-destructive/5 rounded-full px-3 py-1">
                <span>Delete this task? Member FTE % will update.</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onDeleteConfirm(task.id)}>Confirm</Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onDeleteCancel}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteClick(task.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseCard(props: {
  phase: Phase;
  phaseTasks: Task[];
  expanded: boolean;
  dragOverId: string | null;
  phaseDropId: string;
  isManagerOrAbove: boolean;
  projectId: string;
  projectName: string;
  togglePhase: (phaseId: string) => void;
  updateItem: (key: 'phases' | 'tasks', item: Phase | Task) => Promise<void>;
  logActivityEvent: (opts: { userId: string; projectId: string; type: string; message: string }) => void;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  data: AppData;
  viewPeriod: BandwidthViewPeriod;
  projectStartDate: string;
  projectEndDate: string;
  showCompletedTasks: boolean;
  activeDragTaskId: string | null;
  currentUserId: string;
  handleCompletionToggle: (task: Task) => void;
  handleStatusChange: (task: Task, status: TaskStatus) => void;
  handleDeleteTask: (taskId: string) => void;
  inlineDeleteTaskId: string | null;
  setInlineDeleteTaskId: (id: string | null) => void;
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onTaskRowClick: (taskId: string, event: React.MouseEvent) => void;
  onSelectToggle: (taskId: string) => void;
}) {
  const { setNodeRef: setPhaseDropRef } = useDroppable({ id: props.phaseDropId });
  const {
    phase,
    phaseTasks,
    expanded,
    dragOverId,
    phaseDropId,
    isManagerOrAbove,
    projectId,
    projectName,
    togglePhase,
    updateItem,
    logActivityEvent,
    setRefreshKey,
    data,
    viewPeriod,
    projectStartDate,
    projectEndDate,
    showCompletedTasks,
    activeDragTaskId,
    currentUserId,
    handleCompletionToggle,
    handleStatusChange,
    handleDeleteTask,
    inlineDeleteTaskId,
    setInlineDeleteTaskId,
    selectedTaskIds,
    setSelectedTaskIds,
    onTaskRowClick,
    onSelectToggle,
  } = props;
  const phDone = phaseTasks.filter((t) => t.status === 'Done').length;
  const phaseFte = computePhaseFtePercent(phaseTasks);
  const plannedFte = phase.plannedFtePercent;
  const phaseTaskIds = new Set(phaseTasks.map((t) => t.id));
  const selectedInPhase = phaseTasks.filter((t) => selectedTaskIds.has(t.id)).length;
  const allInPhaseSelected = phaseTasks.length > 0 && selectedInPhase === phaseTasks.length;
  const someInPhaseSelected = selectedInPhase > 0;

  const periodBounds = getDefaultPeriodBounds(viewPeriod);
  const overCapacityUserIds = new Set<string>();
  const externallyAffectedUserIds = new Set<string>();
  for (const a of data.allocations.filter((a) => a.projectId === projectId)) {
    const user = data.users.find((u) => u.id === a.userId);
    if (!user) continue;
    const taskFte = getMemberProjectFtePercent(data, user, projectId, viewPeriod, periodBounds.start, periodBounds.end);
    const conflict = getCapacityConflict(taskFte, a.ftePercent);
    if (conflict.status === 'exceeds') overCapacityUserIds.add(user.id);
    if (wasProjectAffectedByExternalChange(user.id, projectId)) externallyAffectedUserIds.add(user.id);
  }

  const handlePhaseSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (allInPhaseSelected) {
        phaseTaskIds.forEach((id) => next.delete(id));
      } else {
        phaseTaskIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  return (
    <Card
      ref={setPhaseDropRef}
      className={cn('transition-all duration-200', dragOverId === phaseDropId && 'ring-2 ring-accent/40 bg-accent/5 border-accent/30')}
    >
      <div className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors cursor-pointer" onClick={() => togglePhase(phase.id)}>
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {phaseTasks.length > 0 && (
            <button
              type="button"
              onClick={handlePhaseSelectAll}
              className={cn(
                'shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors',
                allInPhaseSelected ? 'bg-accent border-accent/50 text-accent-foreground' : 'border-white/20 bg-background/50 hover:bg-muted/50',
                someInPhaseSelected && !allInPhaseSelected && 'border-accent/40'
              )}
              aria-label={allInPhaseSelected ? 'Deselect all in phase' : 'Select all in phase'}
            >
              {allInPhaseSelected ? <Check className="h-3 w-3" /> : someInPhaseSelected ? <span className="w-2 h-0.5 bg-accent/80 rounded" /> : null}
            </button>
          )}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {isManagerOrAbove ? (
              <Input
                defaultValue={phase.name}
                onBlur={async (e) => {
                  const value = e.target.value.trim();
                  if (value && value !== phase.name) {
                    await updateItem('phases', { ...phase, name: value });
                    logActivityEvent({ userId: currentUserId, projectId, type: 'phase_updated', message: `Phase "${phase.name}" was renamed to "${value}" in project ${projectName}` });
                    setRefreshKey((k) => k + 1);
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="h-7 text-sm font-semibold bg-background/40 border-white/10 px-2 py-1 w-40"
              />
            ) : (
              <span className="font-semibold">{phase.name}</span>
            )}
            <span className="text-xs text-muted-foreground">{phDone}/{phaseTasks.length} done</span>
          </div>
          {typeof plannedFte === 'number' && (
            <Badge variant="outline" className="text-[10px] bg-secondary/60 text-secondary-foreground border-border">Plan {plannedFte}% FTE</Badge>
          )}
          {phaseTasks.length > 0 && (
            <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">{phaseFte}% FTE</Badge>
          )}
        </div>
      </div>
      <div className={cn('border-t divide-y', !expanded && 'hidden')}>
        {phaseTasks.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">No tasks in this phase</div>
        ) : (
          <>
            {phaseTasks.map((task) => {
              const assignees = data.users.filter((u) => (task.assigneeIds || []).includes(u.id));
              const taskLogs = data.timelogs.filter((t) => t.taskId === task.id).reduce((s, t) => s + t.hours, 0);
              const taskHours = getTaskDurationHours(task);
              const taskFte = computeTaskFtePercent(taskHours, task.startDate, task.dueDate);
              const concurrencyWarnings = assignees.flatMap((u) =>
                getConcurrencyWarnings(data, u, viewPeriod, projectStartDate, projectEndDate, 75)
                  .filter((w) => w.taskNames.includes(task.title))
                  .map((w) => ({ user: u, ...w }))
              );
              const noAvailabilityAssignees = assignees.filter((u) => {
                const profile = getMemberCalendar(u);
                return getAvailableHoursForMember(profile, task.startDate, task.dueDate) === 0;
              });
              const canToggle = isManagerOrAbove || (task.assigneeIds || []).includes(currentUserId);
              return (
                <DraggableTaskRow
                  key={task.id}
                  task={task}
                  assignees={assignees}
                  overCapacityUserIds={overCapacityUserIds}
                  externallyAffectedUserIds={externallyAffectedUserIds}
                  taskLogs={taskLogs}
                  taskHours={taskHours}
                  taskFte={taskFte}
                  isOverdue={new Date(task.dueDate) < new Date() && task.status !== 'Done'}
                  concurrencyWarnings={concurrencyWarnings}
                  noAvailabilityAssignees={noAvailabilityAssignees}
                  canToggle={canToggle}
                  isManagerOrAbove={isManagerOrAbove}
                  showCompletedTasks={showCompletedTasks}
                  activeDragTaskId={activeDragTaskId}
                  isSelected={selectedTaskIds.has(task.id)}
                  onSelectToggle={onSelectToggle}
                  onRowClick={onTaskRowClick}
                  onCompletionToggle={handleCompletionToggle}
                  onStatusChange={handleStatusChange}
                  onTitleBlur={async (t, value) => { await props.updateItem('tasks', { ...t, title: value }); setRefreshKey((k) => k + 1); }}
                  onDescriptionBlur={async (t, value) => { await props.updateItem('tasks', { ...t, description: value }); setRefreshKey((k) => k + 1); }}
                  onDeleteClick={(id) => setInlineDeleteTaskId(id)}
                  onDeleteConfirm={handleDeleteTask}
                  onDeleteCancel={() => setInlineDeleteTaskId(null)}
                  inlineDeleteTaskId={inlineDeleteTaskId}
                  currentUserId={currentUserId}
                  updateItem={async (key, item) => { await props.updateItem(key as 'tasks', item as Task); }}
                  setRefreshKey={setRefreshKey}
                />
              );
            })}
          </>
        )}
      </div>
    </Card>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManagerOrAbove, isAdmin, currentUser } = useAuth();
  const simulation = useSimulationOptional();
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
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const lastClickedTaskIdRef = useRef<string | null>(null);

  type BulkEditForm = {
    durationValue: number | '';
    durationUnit: TaskDurationUnit | '';
    startDate: string | '';
    dueDate: string | '';
    shiftAmount: number | '';
    shiftUnit: 'days' | 'weeks' | 'months' | '';
    shiftForward: boolean;
    assigneeMode: 'add' | 'replace' | '';
    assigneeUserId: string | '';
    phaseId: string | '';
    completionStatus: 'complete' | 'incomplete' | '';
  };
  const emptyBulkEdit: BulkEditForm = {
    durationValue: '',
    durationUnit: '',
    startDate: '',
    dueDate: '',
    shiftAmount: '',
    shiftUnit: '',
    shiftForward: true,
    assigneeMode: '',
    assigneeUserId: '',
    phaseId: '',
    completionStatus: '',
  };
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(emptyBulkEdit);
  const ganttChartRef = useRef<HTMLElement | null>(null);

  const PHASE_DROP_PREFIX = 'phase-';
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor);
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
  const orderedTaskIds = phases.flatMap(p => tasks.filter(t => t.phaseId === p.id).sort((a, b) => a.order - b.order).map(t => t.id));
  const timelogs = data.timelogs.filter(t => t.projectId === project.id);

  const handleTaskRowClick = (taskId: string, event: React.MouseEvent) => {
    const shift = event.shiftKey;
    const meta = event.metaKey || event.ctrlKey;
    if (shift && lastClickedTaskIdRef.current) {
      const idx = orderedTaskIds.indexOf(taskId);
      const lastIdx = orderedTaskIds.indexOf(lastClickedTaskIdRef.current);
      if (idx >= 0 && lastIdx >= 0) {
        const lo = Math.min(idx, lastIdx);
        const hi = Math.max(idx, lastIdx);
        setSelectedTaskIds(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(orderedTaskIds[i]);
          return next;
        });
      } else {
        lastClickedTaskIdRef.current = taskId;
        setSelectedTaskIds(prev => new Set(prev).add(taskId));
      }
    } else if (meta) {
      lastClickedTaskIdRef.current = taskId;
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        return next;
      });
    } else {
      lastClickedTaskIdRef.current = taskId;
      setSelectedTaskIds(prev => (prev.has(taskId) && prev.size === 1 ? prev : new Set([taskId])));
    }
  };
  const handleSelectToggle = (taskId: string) => {
    lastClickedTaskIdRef.current = taskId;
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
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

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragTaskId(String(e.active.id));
  };

  const handleDragOver = (e: DragOverEvent) => {
    setDragOverId(e.over ? String(e.over.id) : null);
    if (e.over && String(e.over.id).startsWith(PHASE_DROP_PREFIX)) {
      const phaseId = String(e.over.id).slice(PHASE_DROP_PREFIX.length);
      setExpandedPhases(prev => (prev.has(phaseId) ? prev : new Set(prev).add(phaseId)));
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveDragTaskId(null);
    setDragOverId(null);
    if (!overId || overId === activeId) return;
    const draggedTask = data.tasks.find(t => t.id === activeId);
    if (!draggedTask || draggedTask.projectId !== project.id) return;

    const targetPhaseId = overId.startsWith(PHASE_DROP_PREFIX)
      ? overId.slice(PHASE_DROP_PREFIX.length)
      : data.tasks.find(t => t.id === overId)?.phaseId;
    if (!targetPhaseId) return;

    const isBulkDrag = selectedTaskIds.has(activeId) && selectedTaskIds.size > 1;
    const tasksToMove: Task[] = isBulkDrag
      ? orderedTaskIds.filter(id => selectedTaskIds.has(id)).map(id => data.tasks.find(t => t.id === id)!).filter(Boolean)
      : [draggedTask];

    const moveIds = new Set(tasksToMove.map(t => t.id));
    const targetPhaseTasksExcludingMoved = data.tasks
      .filter(t => t.phaseId === targetPhaseId && !moveIds.has(t.id))
      .sort((a, b) => a.order - b.order);
    const insertIndex = overId.startsWith(PHASE_DROP_PREFIX)
      ? targetPhaseTasksExcludingMoved.length
      : targetPhaseTasksExcludingMoved.findIndex(t => t.id === overId);
    const insertIdx = insertIndex >= 0 ? insertIndex : targetPhaseTasksExcludingMoved.length;
    const newOrdered = [
      ...targetPhaseTasksExcludingMoved.slice(0, insertIdx),
      ...tasksToMove,
      ...targetPhaseTasksExcludingMoved.slice(insertIdx),
    ];
    for (let i = 0; i < newOrdered.length; i++) {
      await updateItem('tasks', { ...newOrdered[i], phaseId: targetPhaseId, order: i });
    }
    const sourcePhaseIds = [...new Set(tasksToMove.map(t => t.phaseId))].filter(pid => pid !== targetPhaseId);
    for (const phaseId of sourcePhaseIds) {
      const sourceTasks = data.tasks
        .filter(t => t.phaseId === phaseId && !moveIds.has(t.id))
        .sort((a, b) => a.order - b.order);
      for (let i = 0; i < sourceTasks.length; i++) {
        await updateItem('tasks', { ...sourceTasks[i], order: i });
      }
    }
    const fromPhase = phases.find(p => p.id === draggedTask.phaseId);
    const toPhase = phases.find(p => p.id === targetPhaseId);
    if (isBulkDrag && tasksToMove.length > 0) {
      logActivityEvent({
        userId: currentUser?.id || 'system',
        projectId: project.id,
        type: 'task_updated',
        message: `[${tasksToMove.length}] tasks moved from [${fromPhase?.name ?? 'Unknown'}] to [${toPhase?.name ?? 'Unknown'}] by ${currentUser?.name ?? 'User'}`,
      });
      setSelectedTaskIds(new Set());
    } else if (!isBulkDrag && fromPhase && toPhase && draggedTask.phaseId !== targetPhaseId) {
      logActivityEvent({
        userId: currentUser?.id || 'system',
        projectId: project.id,
        taskId: draggedTask.id,
        type: 'task_updated',
        message: `[${draggedTask.title}] moved from [${fromPhase.name}] to [${toPhase.name}] by ${currentUser?.name ?? 'User'}`,
      });
    }
    setRefreshKey(k => k + 1);
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
    const createdTask: Task = {
      id: idNew,
      projectId: project.id,
      phaseId: targetPhaseId,
      title: newTask.title,
      description: newTask.description ?? '',
      assigneeIds: newTask.assigneeIds ?? [],
      status: 'To Do' as TaskStatus,
      durationValue: newTask.durationValue,
      durationUnit: newTask.durationUnit,
      estimatedHours: estimatedHours ?? 0,
      startDate: newTask.startDate || project.startDate || '',
      dueDate: newTask.dueDate || project.endDate || '',
      order: phaseTasks.length,
    };
    await addItem('tasks', createdTask);
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_created',
      message: `Task "${newTask.title}" created in project ${project.name}`,
    });

    const periodBounds = getDefaultPeriodBounds(viewPeriod);
    const dataWithNewTask: AppData = { ...data, tasks: [...data.tasks, createdTask] };
    for (const userId of newTask.assigneeIds ?? []) {
      const user = data.users.find(u => u.id === userId);
      const alloc = allocations.find(a => a.userId === userId);
      if (!user || !alloc) continue;
      const taskFte = getMemberProjectFtePercent(dataWithNewTask, user, project.id, viewPeriod, periodBounds.start, periodBounds.end);
      const conflict = getCapacityConflict(taskFte, alloc.ftePercent);
      if (conflict.status === 'exceeds') {
        toast.warning(`Adding this task pushes ${user.name} over their ${alloc.ftePercent}% capacity commitment on ${project.name} — now requiring ${Math.round(taskFte)}%`, {
          duration: 8000,
          action: {
            label: 'Edit team',
            onClick: () => setTeamEditorOpen(true),
          },
        });
        break;
      }
    }
    for (const userId of newTask.assigneeIds ?? []) {
      const user = data.users.find(u => u.id === userId);
      if (!user) continue;
      const previousTotalFte = getMemberTotalPeakFte(data, user, viewPeriod, periodBounds.start, periodBounds.end);
      checkExternalConflictsAfterChange(dataWithNewTask, {
        userId,
        sourceProjectId: project.id,
        changeType: 'task_assigned',
        previousTotalFte,
        onToast: showExternalConflictToast,
      });
    }

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

  const handleBulkMoveToPhase = async (phaseId: string) => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    const tasksToMove = ids.map(id => data.tasks.find(t => t.id === id)).filter((t): t is Task => !!t).sort((a, b) => {
      const ai = orderedTaskIds.indexOf(a.id);
      const bi = orderedTaskIds.indexOf(b.id);
      return ai - bi;
    });
    const targetTasks = data.tasks.filter(t => t.phaseId === phaseId && !selectedTaskIds.has(t.id)).sort((a, b) => a.order - b.order);
    const newOrdered = [...targetTasks, ...tasksToMove];
    for (let i = 0; i < newOrdered.length; i++) {
      await updateItem('tasks', { ...newOrdered[i], phaseId, order: i });
    }
    const sourcePhaseIds = [...new Set(tasksToMove.map(t => t.phaseId))];
    for (const pid of sourcePhaseIds) {
      const left = data.tasks.filter(t => t.phaseId === pid && !selectedTaskIds.has(t.id)).sort((a, b) => a.order - b.order);
      for (let i = 0; i < left.length; i++) await updateItem('tasks', { ...left[i], order: i });
    }
    const fromPhase = phases.find(p => p.id === tasksToMove[0]?.phaseId);
    const toPhase = phases.find(p => p.id === phaseId);
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_updated',
      message: `[${tasksToMove.length}] tasks moved from [${fromPhase?.name ?? 'Unknown'}] to [${toPhase?.name ?? 'Unknown'}] by ${currentUser?.name ?? 'User'}`,
    });
    setSelectedTaskIds(new Set());
    setRefreshKey(k => k + 1);
  };

  const handleBulkReassign = async (userId: string) => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    const member = data.users.find(u => u.id === userId);
    for (const taskId of ids) {
      const task = data.tasks.find(t => t.id === taskId);
      if (task) await updateItem('tasks', { ...task, assigneeIds: [userId] });
    }
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_updated',
      message: `[${ids.length}] tasks reassigned to [${member?.name ?? 'Member'}] by ${currentUser?.name ?? 'User'}`,
    });
    setSelectedTaskIds(new Set());
    setRefreshKey(k => k + 1);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    for (const taskId of ids) {
      const task = data.tasks.find(t => t.id === taskId);
      const timelogsToDelete = data.timelogs.filter(t => t.taskId === taskId);
      const subtasksToDelete = data.subtasks.filter(s => s.taskId === taskId);
      for (const t of timelogsToDelete) await deleteItem('timelogs', t.id);
      for (const s of subtasksToDelete) await deleteItem('subtasks', s.id);
      await deleteItem('tasks', taskId);
    }
    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_deleted',
      message: `[${ids.length}] tasks deleted by ${currentUser?.name ?? 'User'}`,
    });
    setSelectedTaskIds(new Set());
    setRefreshKey(k => k + 1);
  };

  const applyShift = (dateStr: string, amount: number, unit: 'days' | 'weeks' | 'months', forward: boolean): string => {
    const d = parseISO(dateStr);
    const delta = forward ? amount : -amount;
    const next = unit === 'days' ? addDays(d, delta) : unit === 'weeks' ? addWeeks(d, delta) : addMonths(d, delta);
    return format(next, 'yyyy-MM-dd');
  };

  const handleBulkEditApply = async () => {
    const ids = Array.from(selectedTaskIds);
    const selectedTasks = ids.map(id => data.tasks.find(t => t.id === id)).filter((t): t is Task => !!t);
    if (selectedTasks.length === 0) return;
    const f = bulkEditForm;
    const summaryParts: string[] = [];

    for (const task of selectedTasks) {
      let start = task.startDate;
      let end = task.dueDate;
      let estimatedHours = task.estimatedHours;
      let durationValue = task.durationValue ?? task.estimatedHours;
      let durationUnit: TaskDurationUnit = task.durationUnit ?? 'hours';
      let assigneeIds = [...(task.assigneeIds || [])];
      let phaseId = task.phaseId;
      let status = task.status;

      if (f.shiftAmount !== '' && f.shiftUnit && Number.isFinite(Number(f.shiftAmount))) {
        const amt = Number(f.shiftAmount);
        start = applyShift(start, amt, f.shiftUnit as 'days' | 'weeks' | 'months', f.shiftForward);
        end = applyShift(end, amt, f.shiftUnit as 'days' | 'weeks' | 'months', f.shiftForward);
      }
      if (f.startDate !== '') {
        start = f.startDate as string;
        const taskDurationDays = Math.max(0, differenceInDays(parseISO(end), parseISO(task.startDate)));
        end = format(addDays(parseISO(start), taskDurationDays), 'yyyy-MM-dd');
      }
      if (f.durationValue !== '' && f.durationUnit && Number.isFinite(Number(f.durationValue))) {
        durationValue = Number(f.durationValue);
        durationUnit = f.durationUnit as TaskDurationUnit;
        estimatedHours = durationToHours(durationValue, durationUnit);
        const daysSpan = estimatedHours / HOURS_PER_DAY;
        end = format(addDays(parseISO(start), Math.max(0, Math.ceil(daysSpan))), 'yyyy-MM-dd');
      }
      if (f.dueDate !== '') {
        end = f.dueDate as string;
        const daysSpan = Math.max(0, differenceInDays(parseISO(end), parseISO(start)));
        estimatedHours = daysSpan * HOURS_PER_DAY;
      }
      if (f.assigneeMode === 'replace' && f.assigneeUserId) {
        assigneeIds = [f.assigneeUserId];
      } else if (f.assigneeMode === 'add' && f.assigneeUserId && !assigneeIds.includes(f.assigneeUserId)) {
        assigneeIds = [...assigneeIds, f.assigneeUserId];
      }
      if (f.phaseId !== '') phaseId = f.phaseId as string;
      if (f.completionStatus === 'complete') status = 'Done' as TaskStatus;
      else if (f.completionStatus === 'incomplete') status = 'To Do' as TaskStatus;

      const applyDuration = f.durationValue !== '' && f.durationUnit;
      const payload: Task = {
        ...task,
        startDate: start,
        dueDate: end,
        estimatedHours,
        ...(applyDuration ? { durationValue, durationUnit } : {}),
        assigneeIds,
        phaseId,
        status,
      };
      if (f.assigneeMode === 'replace') (payload as Task).assigneeSplit = undefined;
      await updateItem('tasks', payload);
    }

    if (f.shiftAmount !== '' && f.shiftUnit) summaryParts.push(`dates shifted by ${f.shiftForward ? '+' : '-'}${f.shiftAmount} ${f.shiftUnit}`);
    if (f.startDate !== '') summaryParts.push('start date set');
    if (f.dueDate !== '') summaryParts.push('end date set');
    if (f.durationValue !== '' && f.durationUnit) summaryParts.push('duration updated');
    if (f.assigneeMode && f.assigneeUserId) {
      const member = data.users.find(u => u.id === f.assigneeUserId);
      summaryParts.push(f.assigneeMode === 'add' ? `added [${member?.name}]` : `assigned to [${member?.name}]`);
    }
    if (f.phaseId !== '') summaryParts.push('phase changed');
    if (f.completionStatus === 'complete') summaryParts.push('marked complete');
    if (f.completionStatus === 'incomplete') summaryParts.push('marked incomplete');

    logActivityEvent({
      userId: currentUser?.id || 'system',
      projectId: project.id,
      type: 'task_updated',
      message: `[${selectedTasks.length}] tasks updated by ${currentUser?.name ?? 'User'} — ${summaryParts.join(', ') || 'bulk edit'}`,
    });
    setBulkEditForm(emptyBulkEdit);
    setBulkEditOpen(false);
    setSelectedTaskIds(new Set());
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
                    const capacity = alloc?.ftePercent ?? 0;
                    const projectFte = getMemberProjectFtePercent(data, user, project.id, viewPeriod, periodBounds.start, periodBounds.end);
                    const capacityConflict = getCapacityConflict(projectFte, capacity);
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
                    const requiredClass = capacityConflict.status === 'exceeds' ? 'text-amber-600 dark:text-amber-400' : capacityConflict.status === 'approaching' ? 'text-amber-600/80 dark:text-amber-400/80' : '';
                    return (
                      <div key={user.id} className="group flex items-center justify-between px-5 py-3">
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
                            <p className="text-sm font-medium text-foreground/95 flex items-center gap-1.5 flex-wrap">
                              {user.name}
                              {capacityConflict.status === 'exceeds' && (
                                <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400 opacity-90">Over capacity commitment</span>
                              )}
                              {isManagerOrAbove && simulation && (
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-0.5"
                                  onClick={() => {
                                    simulation.enterSimulation(data);
                                    navigate('/simulation', { state: { appData: data } });
                                  }}
                                >
                                  <FlaskConical className="h-3 w-3" />
                                  What if...
                                </button>
                              )}
                            </p>
                            {alloc?.roleOnProject && <p className="text-xs text-muted-foreground">{alloc.roleOnProject}</p>}
                            <p className="text-xs text-muted-foreground/80">
                              <span>Capacity: {Math.round(capacity)}%</span>
                              <span className="text-muted-foreground/60"> · </span>
                              <span className={requiredClass || 'text-muted-foreground/80'}>Required: {Math.round(projectFte)}%</span>
                              <span className="text-muted-foreground/60"> · </span>
                              <span className={ofTotalFteClass || 'text-muted-foreground/80'}>{Math.round(totalPeakFte)}% total FTE</span>
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
                        data={data}
                        viewPeriod={viewPeriod}
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
                    {newTask.phaseId && (
                      <PhaseTimelineContext
                        phase={phases.find(p => p.id === newTask.phaseId)!}
                        phaseTasks={tasks.filter(t => t.phaseId === newTask.phaseId)}
                        taskStart={newTask.startDate || undefined}
                        taskEnd={newTask.dueDate || undefined}
                        today={new Date()}
                      />
                    )}
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
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
            {phases.map(phase => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                phaseTasks={visibleTasks.filter(t => t.phaseId === phase.id).sort((a, b) => a.order - b.order)}
                expanded={expandedPhases.has(phase.id)}
                dragOverId={dragOverId}
                phaseDropId={`${PHASE_DROP_PREFIX}${phase.id}`}
                isManagerOrAbove={!!isManagerOrAbove}
                projectId={project.id}
                projectName={project.name}
                togglePhase={togglePhase}
                updateItem={updateItem}
                logActivityEvent={logActivityEvent}
                setRefreshKey={setRefreshKey}
                data={data}
                viewPeriod={viewPeriod}
                projectStartDate={project.startDate}
                projectEndDate={project.endDate}
                showCompletedTasks={showCompletedTasks}
                activeDragTaskId={activeDragTaskId}
                currentUserId={currentUser?.id || 'system'}
                handleCompletionToggle={handleCompletionToggle}
                handleStatusChange={handleStatusChange}
                handleDeleteTask={handleDeleteTask}
                inlineDeleteTaskId={inlineDeleteTaskId}
                setInlineDeleteTaskId={setInlineDeleteTaskId}
                selectedTaskIds={selectedTaskIds}
                setSelectedTaskIds={setSelectedTaskIds}
                onTaskRowClick={handleTaskRowClick}
                onSelectToggle={handleSelectToggle}
              />
            ))}
            <DragOverlay dropAnimation={null} style={{ zIndex: 1000 }}>
              {activeDragTaskId ? (() => {
                const task = data.tasks.find(t => t.id === activeDragTaskId);
                if (!task) return null;
                const bulkCount = selectedTaskIds.has(activeDragTaskId) && selectedTaskIds.size > 1 ? selectedTaskIds.size : 0;
                return (
                  <div className="flex items-center justify-between px-5 py-3 rounded-lg border bg-card/95 backdrop-blur shadow-lg opacity-95 cursor-grabbing border-accent/30 min-w-[200px]">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{task.title}</span>
                      {bulkCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] bg-accent/20 text-accent border-accent/30">
                          {bulkCount} tasks
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })() : null}
            </DragOverlay>
            </DndContext>
          )}
          {!showCompletedTasks && doneTasks > 0 && (
            <p className="text-xs text-muted-foreground/70 text-center py-2">
              {doneTasks} task{doneTasks !== 1 ? 's' : ''} completed
            </p>
          )}

          {selectedTaskIds.size >= 2 && (
            <div className="sticky bottom-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-background/80 backdrop-blur-xl border border-white/10 shadow-lg text-sm">
                <span className="text-muted-foreground font-medium">{selectedTaskIds.size} selected</span>
                {selectedTaskIds.size < tasks.length ? (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedTaskIds(new Set(orderedTaskIds))}>
                    Select all
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelectedTaskIds(new Set())}>
                    Deselect all
                  </Button>
                )}
                <Popover open={bulkEditOpen} onOpenChange={(open) => {
                  if (open) {
                    const st = Array.from(selectedTaskIds).map(id => data.tasks.find(t => t.id === id)).filter((t): t is Task => !!t);
                    const first = st[0];
                    if (!first || st.length === 0) return;
                    const sameDur = st.every(t => (t.durationValue ?? t.estimatedHours) === (first.durationValue ?? first.estimatedHours));
                    const sameUnit = st.every(t => (t.durationUnit ?? 'hours') === (first.durationUnit ?? 'hours'));
                    const sameStart = st.every(t => t.startDate === first.startDate);
                    const sameDue = st.every(t => t.dueDate === first.dueDate);
                    const samePhase = st.every(t => t.phaseId === first.phaseId);
                    setBulkEditForm({
                      durationValue: sameDur && sameUnit ? (first.durationValue ?? first.estimatedHours) : '',
                      durationUnit: sameUnit ? (first.durationUnit ?? 'hours') : '',
                      startDate: sameStart ? first.startDate : '',
                      dueDate: sameDue ? first.dueDate : '',
                      shiftAmount: '',
                      shiftUnit: '',
                      shiftForward: true,
                      assigneeMode: '',
                      assigneeUserId: '',
                      phaseId: samePhase ? first.phaseId : '',
                      completionStatus: '',
                    });
                  } else {
                    setBulkEditForm(emptyBulkEdit);
                  }
                  setBulkEditOpen(open);
                }}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                      <Pencil className="h-3.5 w-3.5" /> Bulk Edit
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-0 bg-background/90 backdrop-blur-xl border-white/10" align="center" side="top">
                    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                      <p className="text-sm font-medium text-foreground">Bulk edit {selectedTaskIds.size} tasks</p>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Duration</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              type="number"
                              min={0.5}
                              step={0.5}
                              placeholder="Leave unchanged"
                              value={bulkEditForm.durationValue === '' ? '' : bulkEditForm.durationValue}
                              onChange={e => setBulkEditForm(f => ({ ...f, durationValue: e.target.value === '' ? '' : Number(e.target.value) }))}
                              className="flex-1 bg-background/50 border-white/10"
                            />
                            <Select value={bulkEditForm.durationUnit || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, durationUnit: (v === '_' ? '' : v) as TaskDurationUnit | '' }))}>
                              <SelectTrigger className="w-[100px] bg-background/50 border-white/10"><SelectValue placeholder="Unit" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_">—</SelectItem>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                                <SelectItem value="months">Months</SelectItem>
                                <SelectItem value="quarters">Quarters</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Start date</Label>
                            <Input
                              type="date"
                              value={bulkEditForm.startDate === '' ? '' : bulkEditForm.startDate}
                              onChange={e => setBulkEditForm(f => ({ ...f, startDate: e.target.value || '' }))}
                              className="mt-1 bg-background/50 border-white/10"
                            />
                            {bulkEditForm.startDate === '' && (() => { const vals = Array.from(selectedTaskIds).map(id => data.tasks.find(t => t.id === id)?.startDate).filter(Boolean); return new Set(vals).size > 1; })() && <p className="text-[10px] text-muted-foreground/70 mt-0.5">Multiple values</p>}
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">End date</Label>
                            <Input
                              type="date"
                              value={bulkEditForm.dueDate === '' ? '' : bulkEditForm.dueDate}
                              onChange={e => setBulkEditForm(f => ({ ...f, dueDate: e.target.value || '' }))}
                              className="mt-1 bg-background/50 border-white/10"
                            />
                            {bulkEditForm.dueDate === '' && (() => { const vals = Array.from(selectedTaskIds).map(id => data.tasks.find(t => t.id === id)?.dueDate).filter(Boolean); return new Set(vals).size > 1; })() && <p className="text-[10px] text-muted-foreground/70 mt-0.5">Multiple values</p>}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Shift by offset</Label>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <Input
                              type="number"
                              placeholder="Amount"
                              value={bulkEditForm.shiftAmount === '' ? '' : bulkEditForm.shiftAmount}
                              onChange={e => setBulkEditForm(f => ({ ...f, shiftAmount: e.target.value === '' ? '' : Number(e.target.value) }))}
                              className="w-20 bg-background/50 border-white/10"
                            />
                            <Select value={bulkEditForm.shiftUnit || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, shiftUnit: (v === '_' ? '' : v) as 'days' | 'weeks' | 'months' | '' }))}>
                              <SelectTrigger className="w-24 bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_">—</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                                <SelectItem value="weeks">Weeks</SelectItem>
                                <SelectItem value="months">Months</SelectItem>
                              </SelectContent>
                            </Select>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input type="checkbox" checked={bulkEditForm.shiftForward} onChange={e => setBulkEditForm(f => ({ ...f, shiftForward: e.target.checked }))} className="rounded" />
                              Forward
                            </label>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Assignees</Label>
                          <div className="flex gap-2 mt-1">
                            <Select value={bulkEditForm.assigneeMode || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, assigneeMode: (v === '_' ? '' : v) as 'add' | 'replace' | '' }))}>
                              <SelectTrigger className="flex-1 bg-background/50 border-white/10"><SelectValue placeholder="Add or replace" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_">—</SelectItem>
                                <SelectItem value="add">Add to existing</SelectItem>
                                <SelectItem value="replace">Replace all</SelectItem>
                              </SelectContent>
                            </Select>
                            {(bulkEditForm.assigneeMode === 'add' || bulkEditForm.assigneeMode === 'replace') && (
                              <Select value={bulkEditForm.assigneeUserId || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, assigneeUserId: v === '_' ? '' : v }))}>
                                <SelectTrigger className="flex-1 bg-background/50 border-white/10"><SelectValue placeholder="Member" /></SelectTrigger>
                                <SelectContent>
                                  {projectMembers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Phase</Label>
                          <Select value={bulkEditForm.phaseId || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, phaseId: v === '_' ? '' : v }))}>
                            <SelectTrigger className="mt-1 w-full bg-background/50 border-white/10"><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_">—</SelectItem>
                              {phases.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Completion</Label>
                          <Select value={bulkEditForm.completionStatus || '_'} onValueChange={v => setBulkEditForm(f => ({ ...f, completionStatus: (v === '_' ? '' : v) as 'complete' | 'incomplete' | '' }))}>
                            <SelectTrigger className="mt-1 w-full bg-background/50 border-white/10"><SelectValue placeholder="Leave unchanged" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_">—</SelectItem>
                              <SelectItem value="complete">Mark complete</SelectItem>
                              <SelectItem value="incomplete">Mark incomplete</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {(() => {
                        const st = Array.from(selectedTaskIds).map(id => data.tasks.find(t => t.id === id)).filter((t): t is Task => !!t);
                        const outsideCount = st.filter(t => {
                          let start = t.startDate, end = t.dueDate;
                          if (bulkEditForm.shiftAmount !== '' && bulkEditForm.shiftUnit && Number.isFinite(Number(bulkEditForm.shiftAmount))) {
                            start = applyShift(start, Number(bulkEditForm.shiftAmount), bulkEditForm.shiftUnit as 'days' | 'weeks' | 'months', bulkEditForm.shiftForward);
                            end = applyShift(end, Number(bulkEditForm.shiftAmount), bulkEditForm.shiftUnit as 'days' | 'weeks' | 'months', bulkEditForm.shiftForward);
                          }
                          if (bulkEditForm.startDate !== '') {
                            start = bulkEditForm.startDate as string;
                            const taskDays = Math.max(0, differenceInDays(parseISO(end), parseISO(t.startDate)));
                            end = format(addDays(parseISO(start), taskDays), 'yyyy-MM-dd');
                          }
                          if (bulkEditForm.durationValue !== '' && bulkEditForm.durationUnit && Number.isFinite(Number(bulkEditForm.durationValue))) {
                            const h = durationToHours(Number(bulkEditForm.durationValue), bulkEditForm.durationUnit as TaskDurationUnit);
                            end = format(addDays(parseISO(start), Math.ceil(h / HOURS_PER_DAY)), 'yyyy-MM-dd');
                          }
                          if (bulkEditForm.dueDate !== '') end = bulkEditForm.dueDate as string;
                          return start < project.startDate || end > project.endDate;
                        }).length;
                        const hasChanges = bulkEditForm.durationValue !== '' || bulkEditForm.durationUnit !== '' || bulkEditForm.startDate !== '' || bulkEditForm.dueDate !== '' || (bulkEditForm.shiftAmount !== '' && bulkEditForm.shiftUnit) || bulkEditForm.assigneeMode !== '' || bulkEditForm.phaseId !== '' || bulkEditForm.completionStatus !== '';
                        const previewParts: string[] = [];
                        if (bulkEditForm.shiftAmount !== '' && bulkEditForm.shiftUnit) previewParts.push(`dates shift ${bulkEditForm.shiftForward ? '+' : '-'}${bulkEditForm.shiftAmount} ${bulkEditForm.shiftUnit}`);
                        if (bulkEditForm.startDate !== '') previewParts.push('start date set');
                        if (bulkEditForm.dueDate !== '') previewParts.push('end date set');
                        if (bulkEditForm.durationValue !== '' && bulkEditForm.durationUnit) previewParts.push('duration updated');
                        if (bulkEditForm.assigneeMode && bulkEditForm.assigneeUserId) {
                          const u = data.users.find(x => x.id === bulkEditForm.assigneeUserId);
                          previewParts.push(bulkEditForm.assigneeMode === 'add' ? `add [${u?.name}]` : `assigned to [${u?.name}]`);
                        }
                        if (bulkEditForm.phaseId !== '') previewParts.push('phase changed');
                        if (bulkEditForm.completionStatus === 'complete') previewParts.push('marked complete');
                        if (bulkEditForm.completionStatus === 'incomplete') previewParts.push('marked incomplete');
                        return (
                          <>
                            {outsideCount > 0 && (
                              <p className="text-xs text-muted-foreground/80">{outsideCount} task{outsideCount !== 1 ? 's' : ''} will fall outside the project timeline</p>
                            )}
                            {(bulkEditForm.durationValue !== '' || bulkEditForm.startDate !== '' || bulkEditForm.dueDate !== '' || (bulkEditForm.shiftAmount !== '' && bulkEditForm.shiftUnit)) && (
                              <p className="text-xs text-muted-foreground/70">This change may affect member FTE % and bandwidth.</p>
                            )}
                            {hasChanges && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {selectedTaskIds.size} tasks will be updated — {previewParts.join(', ') || 'changes applied'}
                              </p>
                            )}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setBulkEditOpen(false); setBulkEditForm(emptyBulkEdit); }}>Cancel</button>
                              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleBulkEditApply} disabled={!hasChanges}>
                                Apply
                              </Button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                      <FolderInput className="h-3.5 w-3.5" /> Move to Phase
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="center">
                    {phases.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted/60"
                        onClick={() => { handleBulkMoveToPhase(p.id); }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                      <UserPlus className="h-3.5 w-3.5" /> Reassign
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="center">
                    {projectMembers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted/60 flex items-center gap-2"
                        onClick={() => { handleBulkReassign(u.id); }}
                      >
                        <span className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background" style={{ backgroundColor: u.avatarColor, color: 'white' }}>
                          {u.name.split(' ').map((n) => n[0]).join('')}
                        </span>
                        {u.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {!bulkDeleteConfirmOpen ? (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setBulkDeleteConfirmOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Delete {selectedTaskIds.size} tasks? FTE will update.</span>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => { handleBulkDelete(); setBulkDeleteConfirmOpen(false); }}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setBulkDeleteConfirmOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setSelectedTaskIds(new Set()); setBulkDeleteConfirmOpen(false); }}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
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
                    data={data}
                    viewPeriod={viewPeriod}
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
                <PhaseTimelineContext
                  phase={phases.find(p => p.id === editingTask.phaseId)!}
                  phaseTasks={tasks.filter(t => t.phaseId === editingTask.phaseId)}
                  taskStart={editingTask.startDate}
                  taskEnd={editingTask.dueDate}
                  today={new Date()}
                />
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
        onNavigateToProject={() => setTeamEditorOpen(false)}
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
  phases: { id: string; name: string; order: number; startDate?: string; endDate?: string }[];
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

  const [showUnscheduled, setShowUnscheduled] = useState(true);

  const byPhase = phases.map(phase => {
    const phaseTasks = tasks.filter(t => t.phaseId === phase.id).sort((a, b) => a.order - b.order);
    const scheduled = phaseTasks.filter(t => t.startDate && t.dueDate);
    const unscheduled = phaseTasks.filter(t => !t.startDate || !t.dueDate);
    return { phase, phaseTasks, scheduled, unscheduled };
  });

  const unscheduledCount = byPhase.reduce((acc, p) => acc + p.unscheduled.length, 0);

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

              {byPhase.map(({ phase, scheduled }, pi) => {
                if (scheduled.length === 0) return null;
                const phaseHasDates = !!phase.startDate && !!phase.endDate;
                return (
                  <div key={phase.id} className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                      {phase.name}
                      {!phaseHasDates && (
                        <span className="ml-2 text-[10px] text-muted-foreground/70">
                          Phase undated
                        </span>
                      )}
                    </p>
                    {scheduled.map(task => {
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
                            {!phaseHasDates && (
                              <span className="ml-2 text-[10px] text-amber-100/90">
                                Phase undated
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {unscheduledCount > 0 && (
              <div className="mt-6 pt-3 border-t border-dashed border-border/50">
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-2"
                  onClick={() => setShowUnscheduled(v => !v)}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px]">
                    {showUnscheduled ? '−' : '+'}
                  </span>
                  <span className="font-medium">Unscheduled</span>
                  <span className="text-muted-foreground/70">
                    · {unscheduledCount} task{unscheduledCount !== 1 ? 's' : ''} without dates
                  </span>
                </button>
                {showUnscheduled && (
                  <div className="space-y-3 text-xs">
                    {byPhase.filter(p => p.unscheduled.length > 0).map(({ phase, unscheduled }) => (
                      <div key={phase.id}>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                          {phase.name}
                          {(!phase.startDate || !phase.endDate) && (
                            <span className="ml-2 text-[10px] text-muted-foreground/70">
                              Set phase dates to schedule
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {unscheduled.map(task => {
                            const assignee = users.find(u => (task.assigneeIds || []).includes(u.id));
                            return (
                              <div
                                key={task.id}
                                className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-dashed border-border/70 bg-background/40 text-xs text-muted-foreground"
                              >
                                {assignee && (
                                  <span
                                    className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold border border-background"
                                    style={{ backgroundColor: assignee.avatarColor, color: 'white' }}
                                  >
                                    {assignee.name.split(' ').map(n => n[0]).join('')}
                                  </span>
                                )}
                                <span className="max-w-[220px] truncate" title={task.title}>
                                  {task.title}
                                </span>
                                <span className="text-[10px] px-1 rounded-full bg-muted/60 text-muted-foreground/90">
                                  No dates set
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
