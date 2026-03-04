import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { CalendarProfile, User, WorkingDay } from '@/lib/types';
import { getDefaultCalendarProfile } from '@/lib/calendar';
import { cn } from '@/lib/utils';

const DAY_LABELS: { value: WorkingDay; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

interface CalendarProfileEditorProps {
  user: User;
  onSave: (calendar: CalendarProfile) => void;
  className?: string;
}

export function CalendarProfileEditor({ user, onSave, className }: CalendarProfileEditorProps) {
  const profile = user.calendar ?? getDefaultCalendarProfile();
  const [timezone, setTimezone] = useState(profile.timezone);
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>(profile.workingDays?.length ? [...profile.workingDays] : [1, 2, 3, 4, 5]);
  const [dailyWorkingHours, setDailyWorkingHours] = useState(profile.dailyWorkingHours ?? 8);
  const [weeklyOverride, setWeeklyOverride] = useState(profile.weeklyWorkingHours?.toString() ?? '');
  const [blackoutRaw, setBlackoutRaw] = useState((profile.blackoutDates ?? []).join(', '));

  const toggleDay = (d: WorkingDay) => {
    setWorkingDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSave = () => {
    const weekly = weeklyOverride.trim() ? parseFloat(weeklyOverride) : undefined;
    const blackoutDates = blackoutRaw
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
    onSave({
      timezone,
      workingDays,
      dailyWorkingHours,
      weeklyWorkingHours: weekly,
      blackoutDates,
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <Label className="text-xs">Timezone</Label>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {COMMON_TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Working days</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {DAY_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleDay(value)}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium border transition-colors',
                workingDays.includes(value)
                  ? 'bg-accent/20 border-accent/40 text-accent-foreground'
                  : 'bg-muted/30 border-border text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Daily working hours</Label>
          <Input
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={dailyWorkingHours}
            onChange={e => setDailyWorkingHours(Number(e.target.value))}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Weekly hours (override)</Label>
          <Input
            type="number"
            min={0}
            max={168}
            placeholder={String(workingDays.length * dailyWorkingHours)}
            value={weeklyOverride}
            onChange={e => setWeeklyOverride(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Blackout / holidays (YYYY-MM-DD, comma-separated)</Label>
        <Input
          placeholder="e.g. 2026-12-25, 2026-01-01"
          value={blackoutRaw}
          onChange={e => setBlackoutRaw(e.target.value)}
          className="mt-1"
        />
      </div>
      <Button size="sm" onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Save calendar
      </Button>
    </div>
  );
}
