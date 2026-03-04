import type { AppData } from './types';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'consulting_pm_data';

// ---- Helpers for Supabase (camelCase <-> snake_case) ----
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
function mapKeys<T extends Record<string, unknown>>(obj: T, fn: (k: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[fn(k)] = v;
  }
  return out;
}
function rowToApp<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  return mapKeys(row as Record<string, unknown>, toCamelCase) as T;
}
function appToRow<T extends Record<string, unknown>>(item: T): Record<string, unknown> {
  return mapKeys(item as Record<string, unknown>, toSnakeCase);
}

const TABLE_KEYS: (keyof AppData)[] = ['users', 'projects', 'allocations', 'phases', 'tasks', 'subtasks', 'timelogs', 'alerts'];

async function loadFromSupabase(): Promise<AppData> {
  if (!supabase) return loadFromLocalSync();
  const empty: AppData = { users: [], projects: [], allocations: [], phases: [], tasks: [], subtasks: [], timelogs: [], alerts: [] };
  const result = { ...empty };
  for (const key of TABLE_KEYS) {
    const table = key === 'subtasks' ? 'subtasks' : key;
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`Supabase load ${table}:`, error);
      return loadFromLocalSync();
    }
    (result[key] as unknown[]) = (data || []).map(row => rowToApp(row));
  }
  return result;
}

const EMPTY_DATA: AppData = { users: [], projects: [], allocations: [], phases: [], tasks: [], subtasks: [], timelogs: [], alerts: [] };

function loadFromLocalSync(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        allocations: Array.isArray(parsed.allocations) ? parsed.allocations : [],
        phases: Array.isArray(parsed.phases) ? parsed.phases : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
        timelogs: Array.isArray(parsed.timelogs) ? parsed.timelogs : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      };
    } catch {
      // corrupted
    }
  }
  return { ...EMPTY_DATA };
}

/** Load all app data. Uses Supabase if configured, else localStorage. */
export async function loadData(): Promise<AppData> {
  if (isSupabaseConfigured) return loadFromSupabase();
  return Promise.resolve(loadFromLocalSync());
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Save full dataset to Supabase (e.g. seed). Uses upsert by id. */
export async function saveDataToSupabase(data: AppData): Promise<void> {
  if (!supabase) {
    saveData(data);
    return;
  }
  for (const key of TABLE_KEYS) {
    const table = key === 'subtasks' ? 'subtasks' : key;
    const rows = (data[key] as Record<string, unknown>[]).map(item => appToRow(item));
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Supabase save ${table}: ${error.message}`);
  }
}

export async function isSeeded(): Promise<boolean> {
  const data = await loadData();
  return data.users.length > 0;
}

function getTable(key: keyof AppData): string {
  return key === 'subtasks' ? 'subtasks' : key;
}

/** Add one row. Uses Supabase if configured, else localStorage. */
export async function addItem<T extends { id: string }>(key: keyof AppData, item: T): Promise<void> {
  if (supabase) {
    const row = appToRow(item as unknown as Record<string, unknown>);
    const { error } = await supabase.from(getTable(key)).insert(row);
    if (!error) return;
    // Fallback to local storage when Supabase schema is missing new columns or other non-fatal issues.
    console.error(`Supabase add ${key} failed, falling back to local storage:`, error);
  }
  const data = loadFromLocalSync();
  (data[key] as unknown as T[]).push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Update one row by id. */
export async function updateItem<T extends { id: string }>(key: keyof AppData, item: T): Promise<void> {
  if (supabase) {
    const row = appToRow(item as unknown as Record<string, unknown>);
    const { error } = await supabase.from(getTable(key)).update(row).eq('id', item.id);
    if (!error) return;
    console.error(`Supabase update ${key} failed, falling back to local storage:`, error);
  }
  const data = loadFromLocalSync();
  const arr = data[key] as unknown as T[];
  const idx = arr.findIndex(i => i.id === item.id);
  if (idx !== -1) arr[idx] = item;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Delete one row by id. */
export async function deleteItem(key: keyof AppData, id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from(getTable(key)).delete().eq('id', id);
    if (!error) return;
    console.error(`Supabase delete ${key} failed, falling back to local storage:`, error);
  }
  const data = loadFromLocalSync();
  const arr = data[key] as unknown as { id: string }[];
  const filtered = arr.filter(i => i.id !== id);
  (data[key] as unknown as { id: string }[]).length = 0;
  (data[key] as unknown as { id: string }[]).push(...filtered);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Delete a project and related rows. With Supabase, project delete cascades. */
export async function deleteProject(projectId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw new Error(`Supabase deleteProject: ${error.message}`);
    return;
  }
  const data = loadFromLocalSync();
  const projectTasks = data.tasks.filter(t => t.projectId === projectId);
  const taskIds = new Set(projectTasks.map(t => t.id));
  data.subtasks = data.subtasks.filter(s => !taskIds.has(s.taskId));
  data.timelogs = data.timelogs.filter(t => t.projectId !== projectId);
  data.tasks = data.tasks.filter(t => t.projectId !== projectId);
  data.phases = data.phases.filter(p => p.projectId !== projectId);
  data.allocations = data.allocations.filter(a => a.projectId !== projectId);
  data.alerts = data.alerts.filter(a => a.projectId !== projectId);
  data.projects = data.projects.filter(p => p.id !== projectId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function genId(): string {
  return crypto.randomUUID();
}
