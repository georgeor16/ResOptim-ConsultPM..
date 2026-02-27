import type { AppData } from './types';

const STORAGE_KEY = 'consulting_pm_data';

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // corrupted, will re-seed
    }
  }
  return { users: [], projects: [], allocations: [], phases: [], tasks: [], subtasks: [], timelogs: [], alerts: [] };
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function isSeeded(): boolean {
  const data = loadData();
  return data.users.length > 0;
}

// Generic CRUD helpers
export function addItem<T extends { id: string }>(key: keyof AppData, item: T): void {
  const data = loadData();
  (data[key] as unknown as T[]).push(item);
  saveData(data);
}

export function updateItem<T extends { id: string }>(key: keyof AppData, item: T): void {
  const data = loadData();
  const arr = data[key] as unknown as T[];
  const idx = arr.findIndex(i => i.id === item.id);
  if (idx !== -1) arr[idx] = item;
  saveData(data);
}

export function deleteItem(key: keyof AppData, id: string): void {
  const data = loadData();
  const arr = data[key] as unknown as { id: string }[];
  const filtered = arr.filter(i => i.id !== id);
  (data[key] as unknown as { id: string }[]).length = 0;
  (data[key] as unknown as { id: string }[]).push(...filtered);
  saveData(data);
}

export function genId(): string {
  return crypto.randomUUID();
}
