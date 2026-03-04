import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  loadGanttExportConfig,
  saveGanttExportConfig,
  getPeriodBoundsFromConfig,
  applyExportFilters,
  TIME_PRESET_LABELS,
  type GanttExportConfig,
  type ExportFormat,
  type TimePreset,
} from '@/lib/ganttExport';
import type { AppData } from '@/lib/types';
import { FileDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GanttExportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AppData;
  exportTitle: string;
  isCumulative: boolean;
  singleProjectId?: string;
  chartRef: React.RefObject<HTMLElement | null>;
  onExportPdf: (blob: Blob, filename: string) => void;
  onExportPng: (blob: Blob, filename: string) => void;
}

export function GanttExportPanel({
  open,
  onOpenChange,
  data,
  exportTitle,
  isCumulative,
  singleProjectId,
  chartRef,
  onExportPdf,
  onExportPng,
}: GanttExportPanelProps) {
  const [config, setConfig] = useState<GanttExportConfig>(loadGanttExportConfig);
  const [exporting, setExporting] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    if (open) setConfig(loadGanttExportConfig());
  }, [open]);

  useEffect(() => {
    saveGanttExportConfig(config);
  }, [config]);

  const activeProjects = data.projects.filter(p => p.status === 'Active');
  const clients = Array.from(new Set(activeProjects.map(p => p.client))).sort();
  const period = getPeriodBoundsFromConfig(config);
  const { projectIds } = applyExportFilters(data, config, singleProjectId);

  const projectIdsDefault = config.projectIds.length === 0
    ? activeProjects.map(p => p.id)
    : config.projectIds;
  const memberIdsDefault = config.memberIds.length === 0 ? data.users.map(u => u.id) : config.memberIds;
  const clientNamesDefault = config.clientNames.length === 0 ? clients : config.clientNames;

  const toggleProject = (id: string) => {
    const next = projectIdsDefault.includes(id) ? projectIdsDefault.filter(x => x !== id) : [...projectIdsDefault, id];
    setConfig(c => ({ ...c, projectIds: next }));
  };
  const toggleMember = (id: string) => {
    const next = memberIdsDefault.includes(id) ? memberIdsDefault.filter(x => x !== id) : [...memberIdsDefault, id];
    setConfig(c => ({ ...c, memberIds: next }));
  };
  const toggleClient = (name: string) => {
    const next = clientNamesDefault.includes(name) ? clientNamesDefault.filter(x => x !== name) : [...clientNamesDefault, name];
    setConfig(c => ({ ...c, clientNames: next }));
  };
  const selectAllProjects = () => setConfig(c => ({ ...c, projectIds: activeProjects.map(p => p.id) }));
  const selectAllMembers = () => setConfig(c => ({ ...c, memberIds: data.users.map(u => u.id) }));
  const selectAllClients = () => setConfig(c => ({ ...c, clientNames: [...clients] }));

  const handleExport = async () => {
    if (config.format === 'pdf' || config.format === 'png') {
      setExporting(true);
      try {
        const { exportGanttToPdf, exportGanttToPng } = await import('@/lib/ganttExportRun');
        const periodLabel = config.timePreset === 'custom' ? `${period.start} – ${period.end}` : TIME_PRESET_LABELS[config.timePreset];
        const title = `${exportTitle} · ${periodLabel}`;
        if (chartRef.current) {
          if (config.format === 'pdf') {
            const blob = await exportGanttToPdf(chartRef.current, title, periodLabel);
            const filename = `${exportTitle.replace(/\s+/g, '_')}_Gantt_${period.start}_${period.end}.pdf`;
            onExportPdf(blob, filename);
          } else {
            const blob = await exportGanttToPng(chartRef.current, title, periodLabel);
            const filename = `${exportTitle.replace(/\s+/g, '_')}_Gantt_${period.start}_${period.end}.png`;
            onExportPng(blob, filename);
          }
        }
        onOpenChange(false);
      } finally {
        setExporting(false);
      }
    } else {
      // Google Slides / Docs: show stub message
      alert('Google Slides and Google Docs export requires OAuth setup. Configure your Google Cloud project and add the integration in Settings.');
    }
  };

  const formatPills: { value: ExportFormat; label: string }[] = [
    { value: 'pdf', label: 'PDF' },
    { value: 'png', label: 'PNG / Image' },
    { value: 'google_slides', label: 'Google Slides' },
    { value: 'google_docs', label: 'Google Docs' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-lg bg-background/80 backdrop-blur-xl border-white/10 overflow-hidden flex flex-col p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-white/10">
          <SheetTitle className="text-base font-semibold text-foreground/95">Export Gantt</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {/* Format */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Format</Label>
              <div className="flex flex-wrap gap-1.5">
                {formatPills.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setConfig(c => ({ ...c, format: value }))}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                      config.format === value
                        ? 'bg-accent/20 border-accent/40 text-accent-foreground'
                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time period */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Time period</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(['this_week', 'this_month', 'this_quarter', 'this_half_year', 'this_year', 'custom'] as TimePreset[]).map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setConfig(c => ({ ...c, timePreset: preset }))}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                      config.timePreset === preset
                        ? 'bg-accent/20 border-accent/40 text-accent-foreground'
                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {TIME_PRESET_LABELS[preset]}
                  </button>
                ))}
              </div>
              {config.timePreset === 'custom' && (
                <div className="flex gap-2 mt-2">
                  <Input
                    type="date"
                    value={config.customStart}
                    onChange={e => setConfig(c => ({ ...c, customStart: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="date"
                    value={config.customEnd}
                    onChange={e => setConfig(c => ({ ...c, customEnd: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Projects */}
            {!singleProjectId && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</Label>
                  <button type="button" onClick={selectAllProjects} className="text-[10px] text-accent hover:underline">All</button>
                </div>
                <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-muted/20 p-2 space-y-1">
                  {activeProjects.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox
                        checked={projectIdsDefault.includes(p.id)}
                        onCheckedChange={() => toggleProject(p.id)}
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Team members */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team members</Label>
                <button type="button" onClick={selectAllMembers} className="text-[10px] text-accent hover:underline">All</button>
              </div>
              <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-muted/20 p-2 space-y-1">
                {data.users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={memberIdsDefault.includes(u.id)}
                      onCheckedChange={() => toggleMember(u.id)}
                    />
                    <span className="truncate">{u.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Clients */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Clients</Label>
                <button type="button" onClick={selectAllClients} className="text-[10px] text-accent hover:underline">All</button>
              </div>
              <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-muted/20 p-2 space-y-1">
                {clients.map(name => (
                  <label key={name} className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={clientNamesDefault.includes(name)}
                      onCheckedChange={() => toggleClient(name)}
                    />
                    <span className="truncate">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Content options */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">Content options</Label>
              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Include FTE % data</span>
                  <Switch checked={config.includeFte} onCheckedChange={v => setConfig(c => ({ ...c, includeFte: v }))} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Include member names</span>
                  <Switch checked={config.includeMemberNames} onCheckedChange={v => setConfig(c => ({ ...c, includeMemberNames: v }))} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Include financial/margin data</span>
                  <Switch checked={config.includeFinancial} onCheckedChange={v => setConfig(c => ({ ...c, includeFinancial: v }))} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Include bandwidth load overlay</span>
                  <Switch checked={config.includeBandwidthOverlay} onCheckedChange={v => setConfig(c => ({ ...c, includeBandwidthOverlay: v }))} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Include unscheduled tasks</span>
                  <Switch checked={config.includeUnscheduled} onCheckedChange={v => setConfig(c => ({ ...c, includeUnscheduled: v }))} />
                </label>
              </div>
            </div>

            {/* Google options (when format is Slides or Docs) */}
            {(config.format === 'google_slides' || config.format === 'google_docs') && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                  {config.format === 'google_slides' ? 'Google Slides' : 'Google Docs'}
                </Label>
                {!googleConnected ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setGoogleConnected(true)}>
                    Connect Google Account
                  </Button>
                ) : (
                  <>
                    <label className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Create new</span>
                      <Switch
                        checked={config.googleCreateNew}
                        onCheckedChange={v => setConfig(c => ({ ...c, googleCreateNew: v }))}
                      />
                    </label>
                    {!config.googleCreateNew && (
                      <Input
                        placeholder="Search or paste document ID"
                        value={config.googleExistingId}
                        onChange={e => setConfig(c => ({ ...c, googleExistingId: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Preview thumbnail */}
            <div className="rounded-lg border border-white/10 bg-muted/20 p-4 min-h-[80px] flex items-center justify-center">
              <p className="text-xs text-muted-foreground text-center">
                {projectIds.length} project(s) · {period.start} – {period.end}
                <br />
                <span className="text-[10px] opacity-80">Preview updates with filters</span>
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="p-5 border-t border-white/10">
          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
