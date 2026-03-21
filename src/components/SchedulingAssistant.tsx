import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AppData, CalendarProfile, Task, Phase, Project, User } from '@/lib/types';
import { loadData, updateItem } from '@/lib/store';
import { getAllCalendarProfiles } from '@/lib/calendarStore';
import { getMemberCalendar, isWorkingDay } from '@/lib/calendar';
import { cn } from '@/lib/utils';
import { computeTaskFtePercent } from '@/lib/fte';
import { getTaskDurationHours, HOURS_PER_DAY } from '@/lib/duration';

type UnscheduledReason = 'no_task_dates' | 'no_phase_dates' | 'both_undated';

interface UnscheduledTaskRow {
  task: Task;
  project: Project;
  phase: Phase | undefined;
  users: User[];
  reason: UnscheduledReason;
}

function getUnscheduledReason(task: Task, phase?: Phase): UnscheduledReason | null {
  const hasTaskDates = !!task.startDate && !!task.dueDate;
  const hasPhaseDates = !!phase?.startDate && !!phase?.endDate;
  if (hasTaskDates && hasPhaseDates) return null;
  if (!hasTaskDates && hasPhaseDates) return 'no_task_dates';
  if (hasTaskDates && !hasPhaseDates) return 'no_phase_dates';
  return 'both_undated';
}

function reasonLabel(reason: UnscheduledReason): string {
  if (reason === 'no_task_dates') return 'No dates set on task';
  if (reason === 'no_phase_dates') return 'Phase has no dates set';
  return 'Both task and phase undated';
}

function buildUnscheduled(data: AppData): UnscheduledTaskRow[] {
  const byPhase: Record<string, Phase> = {};
  for (const p of data.phases) byPhase[p.id] = p;

  const byProject: Record<string, Project> = {};
  for (const p of data.projects) byProject[p.id] = p;

  return data.tasks
    .map(task => {
      const phase = byPhase[task.phaseId];
      const project = byProject[task.projectId];
      const reason = getUnscheduledReason(task, phase);
      if (!reason || !project) return null;
      const users = (task.assigneeIds || []).map(id => data.users.find(u => u.id === id)).filter((u): u is User => !!u);
      return { task, project, phase, users, reason };
    })
    .filter((x): x is UnscheduledTaskRow => !!x);
}

/**
 * Given a task and its assignees' calendar profiles, find the earliest start date
 * (from phaseStart) where all assignees are available, then walk forward for the
 * required number of working days. Returns null if no valid window is found.
 */
function autoScheduleTask(
  task: Task,
  profiles: Map<string, CalendarProfile>,
  users: User[],
  phaseStart: string,
  phaseEnd: string,
): { startDate: string; dueDate: string } | null {
  const hours = getTaskDurationHours(task);
  const requiredDays = Math.max(1, Math.ceil(hours / HOURS_PER_DAY));

  const assigneeProfiles = users
    .filter(u => (task.assigneeIds ?? []).includes(u.id))
    .map(u => profiles.get(u.id) ?? getMemberCalendar(u));

  const start = new Date(phaseStart + 'T00:00:00');
  const end = new Date(phaseEnd + 'T00:00:00');
  const dayMs = 24 * 60 * 60 * 1000;

  // Walk through each calendar day to find a valid window
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    const allAvailable = assigneeProfiles.every(p => isWorkingDay(p, dateStr));
    if (!allAvailable) continue;

    // Found candidate start — walk forward requiredDays working days
    let counted = 0;
    let endStr = dateStr;
    for (let t2 = t; t2 <= end.getTime() && counted < requiredDays; t2 += dayMs) {
      const d2 = new Date(t2);
      const ds = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
      if (assigneeProfiles.every(p => isWorkingDay(p, ds))) {
        endStr = ds;
        counted++;
      }
    }
    if (counted === requiredDays) return { startDate: dateStr, dueDate: endStr };
    // Not enough working days left in phase — skip to next candidate
  }
  return null;
}

function TaskDateRow({
  row,
  profiles,
  onApply,
}: {
  row: UnscheduledTaskRow;
  profiles: Map<string, CalendarProfile>;
  onApply: (task: Task, start: string, end: string) => void;
}) {
  const t = row.task;
  const [localStart, setLocalStart] = useState(t.startDate || '');
  const [localEnd, setLocalEnd] = useState(t.dueDate || '');
  const assignees = row.users;
  const hours = getTaskDurationHours(t);
  const fte = hours > 0 && localStart && localEnd ? computeTaskFtePercent(hours, localStart, localEnd) : 0;

  // Compute blackout conflicts for each assignee within the selected date range
  const blackoutConflicts = useMemo<{ name: string; dates: string[] }[]>(() => {
    if (!localStart || !localEnd) return [];
    const conflicts: { name: string; dates: string[] }[] = [];
    for (const u of assignees) {
      const profile = profiles.get(u.id) ?? getMemberCalendar(u);
      const blocked = profile.blackoutDates.filter(d => d >= localStart && d <= localEnd);
      if (blocked.length > 0) conflicts.push({ name: u.name, dates: blocked });
    }
    return conflicts;
  }, [assignees, profiles, localStart, localEnd]);

  return (
    <div className="rounded-md bg-background/60 border border-white/5 px-2 py-1.5 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate" title={t.title}>
            {t.title}
          </span>
          <Badge variant="outline" className="text-[10px] bg-muted/40 border-muted/60 text-muted-foreground">
            {reasonLabel(row.reason)}
          </Badge>
        </div>
        {assignees.length > 0 && (
          <div className="flex -space-x-1">
            {assignees.map(u => (
              <div
                key={u.id}
                className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold border border-background"
                style={{ backgroundColor: u.avatarColor, color: 'white' }}
                title={u.name}
              >
                {u.name.split(' ').map(n => n[0]).join('')}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Start</span>
        <Input
          type="date"
          value={localStart}
          onChange={e => setLocalStart(e.target.value)}
          className="h-7 w-32 bg-background/60 border-white/10"
        />
        <span>End</span>
        <Input
          type="date"
          value={localEnd}
          onChange={e => setLocalEnd(e.target.value)}
          className="h-7 w-32 bg-background/60 border-white/10"
        />
        <Button
          size="xs"
          className="ml-auto h-7 px-2 text-[11px] bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={!localStart || !localEnd}
          onClick={() => onApply(t, localStart, localEnd)}
        >
          Apply
        </Button>
      </div>
      {hours > 0 && localStart && localEnd && (
        <p className="text-[10px] text-muted-foreground/80">
          This will add approximately {fte}% FTE for assigned members over this period.
        </p>
      )}
      {blackoutConflicts.map(c => (
        <p key={c.name} className="text-[10px] text-amber-500/90">
          ⚠ {c.name} has {c.dates.length} blackout date{c.dates.length !== 1 ? 's' : ''} in this range ({c.dates.join(', ')})
        </p>
      ))}
    </div>
  );
}

export function useUnscheduledCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    loadData().then(d => {
      setCount(buildUnscheduled(d).length);
    }).catch(() => setCount(0));
  }, []);

  return count;
}

export function SchedulingAssistantButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [data, setData] = useState<AppData | null>(null);
  const [profiles, setProfiles] = useState<Map<string, CalendarProfile>>(new Map());

  const refresh = async () => {
    setLoading(true);
    const d = await loadData();
    setData(d);
    const p = await getAllCalendarProfiles(d.users);
    setProfiles(p);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open]);

  const unscheduled = useMemo(() => (data ? buildUnscheduled(data) : []), [data]);

  const totalCount = unscheduled.length;

  const handleAutoScheduleAll = async () => {
    if (!data) return;
    setAutoScheduling(true);
    const schedulable = unscheduled.filter(
      row => row.reason === 'no_task_dates' && !!row.phase?.startDate && !!row.phase?.endDate
    );
    const failed: string[] = [];
    for (const row of schedulable) {
      const result = autoScheduleTask(
        row.task,
        profiles,
        row.users,
        row.phase!.startDate!,
        row.phase!.endDate!,
      );
      if (result) {
        const hours = getTaskDurationHours(row.task);
        await updateItem('tasks', { ...row.task, ...result, estimatedHours: hours || undefined });
      } else {
        failed.push(row.task.title);
      }
    }
    await refresh();
    setAutoScheduling(false);
    if (schedulable.length === 0) {
      toast.info('No tasks could be auto-scheduled. Set phase dates first.');
    } else if (failed.length === 0) {
      toast.success(`Auto-scheduled ${schedulable.length} task${schedulable.length !== 1 ? 's' : ''}.`);
    } else {
      toast.warning(
        `Scheduled ${schedulable.length - failed.length} task${schedulable.length - failed.length !== 1 ? 's' : ''}. Could not schedule: ${failed.join(', ')}.`
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-muted-foreground hover:text-foreground hover:bg-background/90 ml-2"
        aria-label="Open Scheduling Assistant"
      >
        <CalendarClock className="h-4 w-4" />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-accent text-[10px] text-accent-foreground flex items-center justify-center px-1">
            {totalCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-xl bg-background/90 backdrop-blur-xl border-l border-white/10 p-0 flex flex-col"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-white/10">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Scheduling Assistant
              {totalCount > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  · {totalCount} unscheduled task{totalCount !== 1 ? 's' : ''}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/80">Bulk actions:</span>
            <Button
              variant="outline"
              size="xs"
              disabled={loading || autoScheduling || totalCount === 0}
              onClick={handleAutoScheduleAll}
              className="h-6 px-2 text-[11px]"
            >
              {autoScheduling ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Scheduling…</>
              ) : (
                'Auto-schedule all'
              )}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading unscheduled tasks...
              </div>
            )}
            {!loading && totalCount === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/80 text-sm">
                <p className="font-medium mb-1">All tasks scheduled — nothing outstanding.</p>
                <p className="text-xs">You can always reopen this panel from the top bar.</p>
              </div>
            )}
            {!loading && totalCount > 0 && data && (
              <SchedulingAssistantList data={data} rows={unscheduled} profiles={profiles} onChanged={refresh} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface ListProps {
  data: AppData;
  rows: UnscheduledTaskRow[];
  profiles: Map<string, CalendarProfile>;
  onChanged: () => Promise<void> | void;
}

function SchedulingAssistantList({ data, rows, profiles, onChanged }: ListProps) {
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all');

  const grouped = useMemo(() => {
    const map = new Map<string, { project: Project; phases: Map<string, { phase?: Phase; tasks: UnscheduledTaskRow[] }> }>();

    for (const row of rows) {
      if (!map.has(row.project.id)) {
        map.set(row.project.id, { project: row.project, phases: new Map() });
      }
      const proj = map.get(row.project.id)!;
      const phaseKey = row.phase?.id ?? '__no_phase__';
      if (!proj.phases.has(phaseKey)) {
        proj.phases.set(phaseKey, { phase: row.phase, tasks: [] });
      }
      proj.phases.get(phaseKey)!.tasks.push(row);
    }

    return Array.from(map.values());
  }, [rows]);

  const handleApplyTaskDates = async (task: Task, startDate: string, dueDate: string) => {
    if (!startDate || !dueDate) return;
    const hours = getTaskDurationHours(task);
    await updateItem('tasks', { ...task, startDate, dueDate, estimatedHours: hours || (HOURS_PER_DAY * Math.max(1, (new Date(dueDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))) });
    await onChanged();
  };

  const handleSetPhaseDates = async (phase: Phase, startDate: string, endDate: string) => {
    if (!startDate || !endDate) return;
    await updateItem('phases', { ...phase, startDate, endDate });
    await onChanged();
  };

  const filtered = projectFilter === 'all'
    ? grouped
    : grouped.filter(g => g.project.id === projectFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/80">Filter by project:</span>
          <Select value={projectFilter} onValueChange={v => setProjectFilter(v)}>
            <SelectTrigger className="h-7 w-[160px] bg-background/60 border-white/10">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {data.projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.map(group => {
        const totalInProject = Array.from(group.phases.values()).reduce((acc, p) => acc + p.tasks.length, 0);
        return (
          <div key={group.project.id} className="rounded-lg border border-white/10 bg-card/60 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">{group.project.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {group.project.client} · {totalInProject} unscheduled task{totalInProject !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {Array.from(group.phases.values()).map(phaseGroup => {
                const phase = phaseGroup.phase;
                const hasPhaseDates = !!phase?.startDate && !!phase?.endDate;
                const [phaseStart, phaseEnd] = [phase?.startDate ?? '', phase?.endDate ?? ''];
                return (
                  <div key={phase?.id ?? '__no_phase__'} className="px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {phase ? phase.name : 'No phase'}
                        </span>
                        <span className="text-[10px] text-muted-foreground/80">
                          {phaseGroup.tasks.length} task{phaseGroup.tasks.length !== 1 ? 's' : ''} in this phase
                        </span>
                      </div>
                      {!hasPhaseDates && phase && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Set phase dates:</span>
                          <Input
                            type="date"
                            defaultValue={phaseStart}
                            className="h-6 w-28 bg-background/60 border-white/10"
                            onBlur={e => handleSetPhaseDates(phase, e.target.value, phaseEnd || e.target.value)}
                          />
                          <Input
                            type="date"
                            defaultValue={phaseEnd}
                            className="h-6 w-28 bg-background/60 border-white/10"
                            onBlur={e => handleSetPhaseDates(phase, phaseStart || e.target.value, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {phaseGroup.tasks.map(row => (
                        <TaskDateRow key={row.task.id} row={row} profiles={profiles} onApply={handleApplyTaskDates} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

