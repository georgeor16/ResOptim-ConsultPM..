import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ScheduledPause, DayOfWeek } from '@/lib/scheduledPause';
import {
  formatTimeForDisplay,
  formatDaysForDisplay,
  DAYS,
  DAY_LABELS,
  WEEKDAYS,
  WEEKENDS,
  genScheduleId,
  MAX_SCHEDULES,
  findOverlappingSchedule,
} from '@/lib/scheduledPause';

const DEFAULT_FROM = '18:00';
const DEFAULT_UNTIL = '09:00';

interface SchedulePausePanelProps {
  schedules: ScheduledPause[];
  oneOffRemainingMinutes: number;
  onSchedulesChange: (s: ScheduledPause[]) => void;
  onRemoveSchedule: (id: string) => void;
  onOneOffStart: (endsAt: string) => void;
  onOneOffClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingScheduleId: string | null;
  onEditSchedule: (id: string | null) => void;
  /** When false, only one-off countdown is shown (no schedule link/list). */
  showRecurringSchedule?: boolean;
}

export function SchedulePausePanel({
  schedules,
  oneOffRemainingMinutes,
  onSchedulesChange,
  onRemoveSchedule,
  onOneOffStart,
  onOneOffClear,
  open,
  onOpenChange,
  editingScheduleId,
  onEditSchedule,
  showRecurringSchedule = true,
}: SchedulePausePanelProps) {
  const [fromTime, setFromTime] = useState(DEFAULT_FROM);
  const [untilTime, setUntilTime] = useState(DEFAULT_UNTIL);
  const [days, setDays] = useState<DayOfWeek[]>(WEEKDAYS);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [showEndDate, setShowEndDate] = useState(false);
  const [suppressCritical, setSuppressCritical] = useState(false);
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');

  const toggleDay = (d: DayOfWeek) => {
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const setPreset = (preset: DayOfWeek[]) => {
    setDays(preset.length ? [...preset] : DAYS);
  };

  const isOvernight = untilTime <= fromTime;

  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  useEffect(() => {
    if (open) setOverlapWarning(null);
  }, [open]);

  const handleSave = () => {
    if (days.length === 0) return;
    const id = editingScheduleId ?? genScheduleId();
    const schedule: ScheduledPause = {
      id,
      fromTime,
      untilTime,
      days,
      endDate: showEndDate ? endDate : undefined,
      suppressCritical,
    };
    const others = editingScheduleId ? schedules.filter(s => s.id !== editingScheduleId) : schedules;
    const overlapping = findOverlappingSchedule(others, schedule);
    if (overlapping) {
      setOverlapWarning(`This overlaps with your ${formatTimeForDisplay(overlapping.fromTime)} → ${formatTimeForDisplay(overlapping.untilTime)} (${formatDaysForDisplay(overlapping.days)}) schedule — adjust times or remove the conflicting schedule.`);
    } else {
      setOverlapWarning(null);
    }
    const next = editingScheduleId
      ? schedules.map(s => (s.id === editingScheduleId ? schedule : s))
      : [...schedules, schedule].slice(0, MAX_SCHEDULES);
    onSchedulesChange(next);
    onOpenChange(false);
    onEditSchedule(null);
    setFromTime(DEFAULT_FROM);
    setUntilTime(DEFAULT_UNTIL);
    setDays(WEEKDAYS);
    setEndDate(undefined);
    setShowEndDate(false);
    setSuppressCritical(false);
  };

  const handleOneOff = (minutes: number) => {
    const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    onOneOffStart(endsAt);
    onOpenChange(false);
  };

  const handleCustomOneOff = () => {
    const h = Math.max(0, parseInt(customHours, 10) || 0);
    const m = Math.max(0, Math.min(59, parseInt(customMinutes, 10) || 0));
    handleOneOff(h * 60 + m);
    setCustomHours('');
    setCustomMinutes('');
  };

  const loadScheduleForEdit = (s: ScheduledPause) => {
    setFromTime(s.fromTime);
    setUntilTime(s.untilTime);
    setDays(s.days);
    setEndDate(s.endDate);
    setShowEndDate(!!s.endDate);
    setSuppressCritical(s.suppressCritical);
  };

  return (
    <div className="space-y-3">
      {oneOffRemainingMinutes > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-amber-200/90 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span>Paused for {Math.floor(oneOffRemainingMinutes / 60)}h {oneOffRemainingMinutes % 60}m remaining</span>
          <button type="button" onClick={onOneOffClear} className="text-xs underline text-amber-300/90">Resume now</button>
        </div>
      )}

      {showRecurringSchedule && schedules.length > 0 && !open && (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Pausing {formatTimeForDisplay(s.fromTime)} → {formatTimeForDisplay(s.untilTime)} · {formatDaysForDisplay(s.days)}
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={() => { loadScheduleForEdit(s); onEditSchedule(s.id); onOpenChange(true); }} className="underline hover:text-white/70">Edit</button>
                <button type="button" onClick={() => onRemoveSchedule(s.id)} className="underline hover:text-white/70">Remove</button>
              </span>
            </div>
          ))}
          {schedules.length < MAX_SCHEDULES && (
            <button type="button" onClick={() => { onEditSchedule(null); setFromTime(DEFAULT_FROM); setUntilTime(DEFAULT_UNTIL); setDays(WEEKDAYS); setShowEndDate(false); setSuppressCritical(false); onOpenChange(true); }} className="text-xs text-white/50 hover:text-white/70 underline">+ Add another schedule</button>
          )}
          {schedules.length >= MAX_SCHEDULES && <span className="text-[11px] text-white/40">Maximum {MAX_SCHEDULES} schedules — remove one to add another</span>}
        </div>
      )}

      {showRecurringSchedule && !open && oneOffRemainingMinutes === 0 && (
        <button type="button" onClick={() => onOpenChange(true)} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70">
          <Clock className="h-3.5 w-3.5" />
          Schedule a pause
        </button>
      )}

      {open && (
        <div
          className="rounded-xl p-4 overflow-hidden transition-all duration-200 ease-out"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="space-y-4">
            {/* One-off row */}
            <div>
              <p className="text-xs text-white/50 mb-2">Pause for...</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '1 hour', min: 60 },
                  { label: '2 hours', min: 120 },
                  { label: '4 hours', min: 240 },
                  { label: 'Until tomorrow', min: 24 * 60 },
                ].map(({ label, min }) => (
                  <button key={label} type="button" onClick={() => handleOneOff(min)} className="rounded-full px-3 py-1.5 text-xs border border-white/15 bg-white/5 text-white/70 hover:bg-white/10">{label}</button>
                ))}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <input type="number" min={0} max={99} placeholder="H" value={customHours} onChange={e => setCustomHours(e.target.value)} className="w-10 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-center text-white/80" />
                        <span className="self-center text-white/50 mx-1">h</span>
                        <input type="number" min={0} max={59} placeholder="M" value={customMinutes} onChange={e => setCustomMinutes(e.target.value)} className="w-10 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-center text-white/80" />
                        <span className="self-center text-white/50 ml-1 mr-2">m</span>
                        <Button type="button" size="sm" variant="ghost" className="rounded-full h-7 text-xs" onClick={handleCustomOneOff}>Start pause</Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Pause for custom duration</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3" />

            {/* Row 1 — From / Until */}
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-xs text-white/60 w-10 shrink-0">From</Label>
              <Input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)} className="w-28 h-8 text-xs bg-white/5 border-white/15" />
              <Label className="text-xs text-white/60 w-10 shrink-0">Until</Label>
              <Input type="time" value={untilTime} onChange={e => setUntilTime(e.target.value)} className="w-28 h-8 text-xs bg-white/5 border-white/15" />
            </div>
            {isOvernight && <p className="text-[11px] text-white/40">Resumes next day at {formatTimeForDisplay(untilTime)}</p>}

            {/* Row 2 — Days */}
            <div>
              <p className="text-xs text-white/60 mb-2">Repeat</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DAYS.map(d => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} className={cn('rounded-full w-8 h-8 text-[11px] transition-colors', days.includes(d) ? 'bg-emerald-500/20 border border-emerald-500/30 text-white/90' : 'border border-white/15 bg-white/5 text-white/50')}>{DAY_LABELS[d]}</button>
                ))}
              </div>
              <p className="text-[11px] text-white/40">
                <button type="button" onClick={() => setPreset(WEEKDAYS)} className="underline hover:text-white/60">Weekdays</button>
                {' · '}
                <button type="button" onClick={() => setPreset(WEEKENDS)} className="underline hover:text-white/60">Weekends</button>
                {' · '}
                <button type="button" onClick={() => setPreset(DAYS)} className="underline hover:text-white/60">Every day</button>
              </p>
            </div>

            {/* Row 3 — End date */}
            {!showEndDate ? (
              <button type="button" onClick={() => setShowEndDate(true)} className="text-xs text-white/50 hover:text-white/70 underline">+ Add end date</button>
            ) : (
              <div>
                <Label className="text-xs text-white/60">End date</Label>
                <Input type="date" value={endDate ?? ''} onChange={e => setEndDate(e.target.value || undefined)} className="w-36 h-8 text-xs mt-1 bg-white/5 border-white/15" />
                <p className="text-[11px] text-white/40 mt-1">{endDate ? `Schedule ends after ${endDate}` : 'Repeats until removed'}</p>
              </div>
            )}

            {/* Override for Critical */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-white/70">Override for Critical alerts</p>
                <p className="text-[11px] text-white/40">When off, Critical alerts still deliver during this pause</p>
              </div>
              <Switch checked={suppressCritical} onCheckedChange={setSuppressCritical} className="data-[state=checked]:bg-amber-500/60" />
            </div>
            {suppressCritical && <p className="text-[11px] text-amber-400/80">Critical alerts will be suppressed during this window — you may miss urgent notifications</p>}

            {overlapWarning && (
              <p className="text-[11px] text-amber-400/90 rounded-lg px-3 py-2 border border-amber-500/20 bg-amber-500/10">{overlapWarning}</p>
            )}
            <div className="flex items-center gap-3 pt-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn('inline-block', days.length === 0 && 'pointer-events-none')}>
                      <Button type="button" disabled={days.length === 0} onClick={handleSave} className="rounded-full px-4 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.12)' }}>Save schedule</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{days.length === 0 ? 'Select at least one day' : 'Save this schedule'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button type="button" onClick={() => { onOpenChange(false); onEditSchedule(null); }} className="text-xs text-white/50 hover:text-white/70 underline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
