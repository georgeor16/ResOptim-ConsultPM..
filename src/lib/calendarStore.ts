import type { CalendarProfile, User } from './types';
import { supabase, isSupabaseConfigured } from './supabase';
import { getDefaultCalendarProfile } from './calendar';

const STORAGE_KEY = 'consulting_pm_data';

// ── Row shape returned by Supabase ──────────────────────────────────────────
interface CalendarProfileRow {
  id: string;
  user_id: string;
  timezone: string;
  working_days: number[];
  daily_working_hours: number;
  weekly_working_hours?: number | null;
  blackout_dates: string[];
}

function rowToProfile(row: CalendarProfileRow): CalendarProfile {
  return {
    timezone: row.timezone,
    workingDays: (row.working_days ?? []) as CalendarProfile['workingDays'],
    dailyWorkingHours: row.daily_working_hours,
    weeklyWorkingHours: row.weekly_working_hours ?? undefined,
    blackoutDates: row.blackout_dates ?? [],
  };
}

function profileToRow(userId: string, profile: CalendarProfile): Omit<CalendarProfileRow, 'id'> {
  return {
    user_id: userId,
    timezone: profile.timezone,
    working_days: profile.workingDays,
    daily_working_hours: profile.dailyWorkingHours,
    weekly_working_hours: profile.weeklyWorkingHours ?? null,
    blackout_dates: profile.blackoutDates,
  };
}

// ── localStorage helpers ────────────────────────────────────────────────────
function loadLocalUsers(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { users?: User[] };
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

function saveLocalCalendar(userId: string, profile: CalendarProfile): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { users?: User[] };
    if (!Array.isArray(data.users)) return;
    const idx = data.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      data.users[idx] = { ...data.users[idx], calendar: profile };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the CalendarProfile for a single user.
 * - Supabase path: reads from calendar_profiles table; on miss, silently migrates
 *   the legacy users.calendar blob into the table and returns it.
 * - localStorage path: reads from users[i].calendar.
 *
 * Accepts an optional `users` array so the caller can pass already-loaded data
 * without a second network trip.
 */
export async function getCalendarProfile(userId: string, users?: User[]): Promise<CalendarProfile> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('calendar_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      return rowToProfile(data as CalendarProfileRow);
    }

    // No row yet — attempt silent migration from users.calendar blob
    const user = users?.find(u => u.id === userId);
    const profile = user?.calendar ?? getDefaultCalendarProfile();
    // Fire-and-forget upsert (migration); don't block the caller
    supabase
      .from('calendar_profiles')
      .upsert(profileToRow(userId, profile), { onConflict: 'user_id' })
      .then(({ error: e }) => {
        if (e) console.warn('calendarStore: migration upsert failed', e);
      });
    return profile;
  }

  // localStorage path
  const localUsers = users ?? loadLocalUsers();
  const user = localUsers.find(u => u.id === userId);
  return user?.calendar ?? getDefaultCalendarProfile();
}

/**
 * Save (upsert) a CalendarProfile for a user.
 * - Supabase path: upserts into calendar_profiles on conflict user_id.
 * - localStorage path: writes to users[i].calendar.
 */
export async function upsertCalendarProfile(userId: string, profile: CalendarProfile): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('calendar_profiles')
      .upsert(profileToRow(userId, profile), { onConflict: 'user_id' });
    if (error) {
      console.error('calendarStore: upsert failed, falling back to localStorage', error);
      saveLocalCalendar(userId, profile);
    }
    return;
  }
  saveLocalCalendar(userId, profile);
}

/**
 * Load calendar profiles for all users in bulk.
 * Returns a Map<userId, CalendarProfile>.
 * - Supabase: single SELECT from calendar_profiles; fills gaps from users.calendar blobs.
 * - localStorage: reads users[i].calendar for each user.
 */
export async function getAllCalendarProfiles(users: User[]): Promise<Map<string, CalendarProfile>> {
  const result = new Map<string, CalendarProfile>();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('calendar_profiles').select('*');
    if (!error && data) {
      for (const row of data as CalendarProfileRow[]) {
        result.set(row.user_id, rowToProfile(row));
      }
    }
  }

  // Fill any gaps (users not yet in calendar_profiles) from the users array blobs
  for (const user of users) {
    if (!result.has(user.id)) {
      result.set(user.id, user.calendar ?? getDefaultCalendarProfile());
    }
  }

  return result;
}
