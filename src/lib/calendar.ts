import type { CalendarProfile, User } from './types';

const DEFAULT_WORKING_DAYS: (0 | 1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5]; // Mon–Fri
const DEFAULT_DAILY_HOURS = 8;

export function getDefaultCalendarProfile(): CalendarProfile {
  let timezone = 'UTC';
  try {
    timezone = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone || 'UTC';
  } catch {
    timezone = 'UTC';
  }
  return {
    timezone,
    workingDays: [...DEFAULT_WORKING_DAYS],
    dailyWorkingHours: DEFAULT_DAILY_HOURS,
    weeklyWorkingHours: DEFAULT_WORKING_DAYS.length * DEFAULT_DAILY_HOURS,
    blackoutDates: [],
  };
}

export function getMemberCalendar(user: User): CalendarProfile {
  if (user.calendar?.timezone) {
    return {
      timezone: user.calendar.timezone,
      workingDays: user.calendar.workingDays?.length ? user.calendar.workingDays : [...DEFAULT_WORKING_DAYS],
      dailyWorkingHours: user.calendar.dailyWorkingHours ?? DEFAULT_DAILY_HOURS,
      weeklyWorkingHours: user.calendar.weeklyWorkingHours ?? (user.calendar.workingDays?.length ?? 5) * (user.calendar.dailyWorkingHours ?? DEFAULT_DAILY_HOURS),
      blackoutDates: user.calendar.blackoutDates ?? [],
    };
  }
  return getDefaultCalendarProfile();
}

/** Check if a date (YYYY-MM-DD) is a working day for the profile (weekday + not blackout). */
export function isWorkingDay(profile: CalendarProfile, dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  if (!profile.workingDays.includes(day)) return false;
  if (profile.blackoutDates.includes(dateStr)) return false;
  return true;
}

/** Count working days in [startDate, endDate] (inclusive) for the member's calendar. */
export function getWorkingDaysInRange(profile: CalendarProfile, startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00').getTime();
  const end = new Date(endDate + 'T23:59:59').getTime();
  let count = 0;
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += dayMs) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    if (isWorkingDay(profile, dateStr)) count++;
  }
  return count;
}

/** Available hours for the member in [startDate, endDate] using their calendar. */
export function getAvailableHoursForMember(profile: CalendarProfile, startDate: string, endDate: string): number {
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return 0;
  const workingDays = getWorkingDaysInRange(profile, startDate, endDate);
  return workingDays * (profile.dailyWorkingHours ?? 8);
}

/** Weekly available hours from profile. */
export function getWeeklyAvailableHours(profile: CalendarProfile): number {
  return profile.weeklyWorkingHours ?? profile.workingDays.length * profile.dailyWorkingHours;
}
