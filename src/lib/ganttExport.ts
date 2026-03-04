/**
 * Gantt export config, period presets, and session persistence.
 */

import type { AppData } from './types';

export type ExportFormat = 'pdf' | 'png' | 'google_slides' | 'google_docs';

export type TimePreset = 'this_week' | 'this_month' | 'this_quarter' | 'this_half_year' | 'this_year' | 'custom';

export interface GanttExportConfig {
  format: ExportFormat;
  timePreset: TimePreset;
  customStart: string;
  customEnd: string;
  projectIds: string[];
  memberIds: string[];
  clientNames: string[];
  includeFte: boolean;
  includeMemberNames: boolean;
  includeFinancial: boolean;
  includeBandwidthOverlay: boolean;
  includeUnscheduled: boolean;
  /** Google: create new vs append (id of existing if append) */
  googleCreateNew: boolean;
  googleExistingId: string;
}

const SESSION_KEY = 'gantt_export_config';

const defaultConfig: GanttExportConfig = {
  format: 'pdf',
  timePreset: 'this_month',
  customStart: '',
  customEnd: '',
  projectIds: [],
  memberIds: [],
  clientNames: [],
  includeFte: true,
  includeMemberNames: true,
  includeFinancial: false,
  includeBandwidthOverlay: true,
  includeUnscheduled: false,
  googleCreateNew: true,
  googleExistingId: '',
};

export function getDefaultGanttExportConfig(): GanttExportConfig {
  return { ...defaultConfig };
}

export function loadGanttExportConfig(): GanttExportConfig {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GanttExportConfig>;
      return { ...defaultConfig, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...defaultConfig };
}

export function saveGanttExportConfig(config: GanttExportConfig): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function getPeriodBoundsFromConfig(config: GanttExportConfig): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (config.timePreset === 'custom' && config.customStart && config.customEnd) {
    return { start: config.customStart, end: config.customEnd };
  }

  switch (config.timePreset) {
    case 'this_week': {
      const d = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        start: `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`,
        end: `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`,
      };
    }
    case 'this_month':
      return {
        start: `${y}-${pad(m + 1)}-01`,
        end: `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`,
      };
    case 'this_quarter': {
      const q = Math.floor(m / 3) + 1;
      const qStart = (q - 1) * 3;
      const qEnd = q * 3 - 1;
      return {
        start: `${y}-${pad(qStart + 1)}-01`,
        end: `${y}-${pad(qEnd + 1)}-${new Date(y, qEnd + 1, 0).getDate()}`,
      };
    }
    case 'this_half_year': {
      const h = m < 6 ? 0 : 1;
      const hStart = h * 6;
      const hEnd = hStart + 5;
      return {
        start: `${y}-${pad(hStart + 1)}-01`,
        end: `${y}-${pad(hEnd + 1)}-${new Date(y, hEnd + 1, 0).getDate()}`,
      };
    }
    case 'this_year':
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    default:
      return {
        start: `${y}-${pad(m + 1)}-01`,
        end: `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`,
      };
  }
}

/** Filter projects/tasks by export config (period, projects, members, clients). */
export function applyExportFilters(
  data: AppData,
  config: GanttExportConfig,
  singleProjectId?: string
): { projectIds: string[]; taskIds: string[] } {
  const period = getPeriodBoundsFromConfig(config);
  const periodStart = new Date(period.start).getTime();
  const periodEnd = new Date(period.end + 'T23:59:59').getTime();

  let projects = data.projects.filter(p => p.status === 'Active');
  if (singleProjectId) projects = projects.filter(p => p.id === singleProjectId);
  else if (config.projectIds.length > 0) projects = projects.filter(p => config.projectIds.includes(p.id));
  if (config.clientNames.length > 0) projects = projects.filter(p => config.clientNames.includes(p.client));

  const projectIdSet = new Set(projects.map(p => p.id));
  let tasks = (data.tasks ?? []).filter(t => projectIdSet.has(t.projectId));

  if (config.memberIds.length > 0) {
    tasks = tasks.filter(t => (t.assigneeIds ?? []).some(id => config.memberIds.includes(id)));
  }

  tasks = tasks.filter(t => {
    const start = new Date(t.startDate).getTime();
    const end = new Date(t.dueDate).getTime();
    const inPeriod = end >= periodStart && start <= periodEnd;
    if (!config.includeUnscheduled && (!t.startDate || !t.dueDate)) return false;
    return inPeriod;
  });

  return {
    projectIds: projects.map(p => p.id),
    taskIds: tasks.map(t => t.id),
  };
}

export const TIME_PRESET_LABELS: Record<TimePreset, string> = {
  this_week: 'This Week',
  this_month: 'This Month',
  this_quarter: 'This Quarter',
  this_half_year: 'This Half Year',
  this_year: 'This Year',
  custom: 'Custom Range',
};
