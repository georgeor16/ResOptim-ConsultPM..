/**
 * Google Slides and Google Docs export for the Gantt chart.
 *
 * Captures the chart as a PNG (reusing ganttExportRun), builds a structured
 * allocation table from the filtered data, then sends both to the
 * google-export Supabase Edge Function which creates/updates the file.
 */

import { exportGanttToPng } from './ganttExportRun';
import { applyExportFilters, getPeriodBoundsFromConfig, TIME_PRESET_LABELS } from './ganttExport';
import type { GanttExportConfig } from './ganttExport';
import type { AppData } from './types';
import { supabase } from './supabase';

const EXPORT_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-export`;

export interface ExportTableRow {
  member: string;
  project: string;
  fte: string;
  period: string;
}

/**
 * Builds a flat allocation table from filtered export data.
 * One row per (member × project) allocation within the selected period.
 */
export function buildExportTableData(
  data: AppData,
  config: GanttExportConfig,
  singleProjectId?: string
): ExportTableRow[] {
  const { projectIds } = applyExportFilters(data, config, singleProjectId);
  const period = getPeriodBoundsFromConfig(config);
  const periodLabel =
    config.timePreset === 'custom'
      ? `${period.start} – ${period.end}`
      : TIME_PRESET_LABELS[config.timePreset];

  const projectIdSet = new Set(projectIds);
  const rows: ExportTableRow[] = [];

  for (const allocation of data.allocations ?? []) {
    if (!projectIdSet.has(allocation.projectId)) continue;
    if (config.memberIds.length > 0 && !config.memberIds.includes(allocation.userId)) continue;

    const project = data.projects.find(p => p.id === allocation.projectId);
    const member = data.users.find(u => u.id === allocation.userId);
    if (!project || !member) continue;
    if (config.clientNames.length > 0 && !config.clientNames.includes(project.client)) continue;

    rows.push({
      member: config.includeMemberNames ? member.name : `Member ${rows.length + 1}`,
      project: project.name,
      fte: `${allocation.ftePercent}%`,
      period: periodLabel,
    });
  }

  return rows;
}

async function getAuthHeader(): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Not authenticated');
  return `Bearer ${data.session.access_token}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface GoogleExportResult {
  id: string;
  url: string;
}

/**
 * Exports the Gantt chart to a Google Slides presentation.
 * Creates a new presentation or appends a slide to an existing one.
 */
export async function exportGanttToSlides(
  chartElement: HTMLElement,
  config: GanttExportConfig,
  data: AppData,
  exportTitle: string,
  singleProjectId?: string
): Promise<GoogleExportResult> {
  const period = getPeriodBoundsFromConfig(config);
  const periodLabel =
    config.timePreset === 'custom'
      ? `${period.start} – ${period.end}`
      : TIME_PRESET_LABELS[config.timePreset];

  const [imageBlob, tableData, authHeader] = await Promise.all([
    exportGanttToPng(chartElement, `${exportTitle} · ${periodLabel}`, periodLabel),
    Promise.resolve(buildExportTableData(data, config, singleProjectId)),
    getAuthHeader(),
  ]);

  const imageBase64 = await blobToBase64(imageBlob);

  const res = await fetch(EXPORT_FN_URL, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'google_slides',
      imageBase64,
      tableData,
      title: `${exportTitle} · ${periodLabel}`,
      periodLabel,
      existingId: config.googleCreateNew ? undefined : config.googleExistingId || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Google Slides export failed');
  }

  return res.json() as Promise<GoogleExportResult>;
}

/**
 * Exports the Gantt chart to a Google Docs document.
 * Creates a new document or appends to an existing one.
 */
export async function exportGanttToDocs(
  chartElement: HTMLElement,
  config: GanttExportConfig,
  data: AppData,
  exportTitle: string,
  singleProjectId?: string
): Promise<GoogleExportResult> {
  const period = getPeriodBoundsFromConfig(config);
  const periodLabel =
    config.timePreset === 'custom'
      ? `${period.start} – ${period.end}`
      : TIME_PRESET_LABELS[config.timePreset];

  const [imageBlob, tableData, authHeader] = await Promise.all([
    exportGanttToPng(chartElement, `${exportTitle} · ${periodLabel}`, periodLabel),
    Promise.resolve(buildExportTableData(data, config, singleProjectId)),
    getAuthHeader(),
  ]);

  const imageBase64 = await blobToBase64(imageBlob);

  const res = await fetch(EXPORT_FN_URL, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'google_docs',
      imageBase64,
      tableData,
      title: `${exportTitle} · ${periodLabel}`,
      periodLabel,
      existingId: config.googleCreateNew ? undefined : config.googleExistingId || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Google Docs export failed');
  }

  return res.json() as Promise<GoogleExportResult>;
}
