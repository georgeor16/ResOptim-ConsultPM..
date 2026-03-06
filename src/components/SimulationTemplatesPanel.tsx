import { useMemo, useState } from 'react';
import type { AppData } from '@/lib/types';
import type { SimulationStep } from '@/lib/simulation';
import type { SimulationTemplateMeta, TemplateParams } from '@/lib/simulationTemplates';
import {
  getMergedTemplates,
  getStarterTemplateMeta,
  buildStarterSteps,
  getStarterTemplateIds,
  getTemplateStoredSteps,
  togglePinTemplate,
  isPinnedByUser,
  getEffectivenessScore,
  dismissSuggestedTemplate,
  getArchivedTemplates,
  unarchiveTemplate,
  type StarterTemplateId,
} from '@/lib/simulationTemplates';
import { TemplateHealthDetail } from '@/components/PlanningInsightsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Play, Pin, PinOff, Search, Sparkles, BookOpen, User, Star, X, ArchiveRestore } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface SimulationTemplatesPanelProps {
  data: AppData;
  onRunWithSteps: (steps: SimulationStep[], templateId?: string) => void;
  onClose?: () => void;
}

export function SimulationTemplatesPanel({ data, onRunWithSteps, onClose }: SimulationTemplatesPanelProps) {
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [paramDialogOpen, setParamDialogOpen] = useState(false);
  const [selectedStarterId, setSelectedStarterId] = useState<StarterTemplateId | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const templates = useMemo(() => (currentUser ? getMergedTemplates(currentUser.id) : []), [currentUser?.id, refreshKey]);

  const filtered = useMemo(() => {
    let list = templates;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (tagFilter) {
      list = list.filter((t) => t.tags.includes(tagFilter));
    }
    return list;
  }, [templates, search, tagFilter]);

  const frequentlyUsed = useMemo(() => filtered.filter((t) => t.usageCount >= 5), [filtered]);
  const suggested = useMemo(() => filtered.filter((t) => t.category === 'suggested'), [filtered]);
  const starter = useMemo(() => filtered.filter((t) => t.category === 'starter'), [filtered]);
  const myTemplates = useMemo(() => filtered.filter((t) => t.category === 'personal' || t.category === 'team'), [filtered]);
  const archived = useMemo(
    () => (currentUser ? getArchivedTemplates(currentUser.id) : []),
    [currentUser?.id, refreshKey]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort();
  }, [templates]);

  const handleRunStarter = (templateId: StarterTemplateId) => {
    setSelectedStarterId(templateId);
    setParamValues({});
    setParamDialogOpen(true);
  };

  const handleRunStarterSubmit = () => {
    if (!selectedStarterId) return;
    const params: TemplateParams = {};
    const meta = getStarterTemplateMeta(selectedStarterId);
    meta.paramSchema?.forEach((p) => {
      const v = paramValues[p.key];
      if (p.type === 'capacity' || p.type === 'number') params[p.key as keyof TemplateParams] = Number(v) as number;
      else if (p.type === 'projects') params.projectIds = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
      else if (v) (params as Record<string, unknown>)[p.key] = v;
    });
    const steps = buildStarterSteps(selectedStarterId, data, params);
    if (steps.length > 0) {
      onRunWithSteps(steps, selectedStarterId);
      setParamDialogOpen(false);
      setSelectedStarterId(null);
      onClose?.();
    }
  };

  const handleRunStored = (templateId: string) => {
    const steps = getTemplateStoredSteps(templateId);
    if (steps?.length) {
      onRunWithSteps(steps, templateId);
      onClose?.();
    }
  };

  const handlePin = (templateId: string) => {
    if (currentUser) togglePinTemplate(templateId, currentUser.id);
  };

  const renderCard = (t: SimulationTemplateMeta) => {
    const isStarter = t.category === 'starter';
    const hasStored = !!getTemplateStoredSteps(t.id)?.length;
    const canRunStored = hasStored && (t.category === 'personal' || t.category === 'suggested');
    const effectiveness = getEffectivenessScore(t);
    const pinned = currentUser ? isPinnedByUser(t.id, currentUser.id) : false;
    const health = t.health ?? 'green';
    const healthDotClass =
      health === 'green'
        ? 'bg-emerald-500/80'
        : health === 'amber'
          ? 'bg-amber-500/80'
          : 'bg-red-500/80';

    return (
      <div
        key={t.id}
        className="rounded-xl bg-background/60 backdrop-blur border border-white/10 p-4 flex flex-col gap-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground/95 truncate">{t.name}</h3>
              {t.category === 'suggested' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                  Generated from your patterns
                </span>
              )}
              {t.category === 'personal' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-400">
                  Mine
                </span>
              )}
              {t.category === 'suggested' && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                  onClick={() => { dismissSuggestedTemplate(t.id); setRefreshKey((k) => k + 1); }}
                  title="Dismiss suggestion"
                >
                  <X className="h-3 w-3 inline" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => handlePin(t.id)}
            title={pinned ? 'Unpin' : 'Pin'}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {t.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                tagFilter === tag
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-400'
                  : 'border-white/10 text-muted-foreground hover:border-white/20'
              )}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {t.usageCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Used {t.usageCount}× · Applied {t.appliedCount}× · Last {t.lastUsedAt ? formatDistanceToNow(new Date(t.lastUsedAt), { addSuffix: true }) : 'never'}
              {effectiveness > 0 && ` · ${effectiveness}% applied`}
            </span>
          )}
          <span
            className={cn('h-2 w-2 rounded-full shrink-0', healthDotClass)}
            title={health === 'green' ? 'Template working well' : health === 'amber' ? 'May need refinement' : 'Flagged for review'}
          />
        </div>
        {t.reversalCount != null && t.reversalCount >= 3 && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1">
            Applied and reversed {t.reversalCount}× — template defaults may not reflect how your team works. Consider reviewing or retiring.
          </p>
        )}
        {t.usageCount > 0 && <TemplateHealthDetail templateId={t.id} />}
        {t.category === 'suggested' && t.confidenceCount != null && (
          <span className="text-[10px] text-muted-foreground block -mt-0.5">
            {t.confidenceCount >= 5 ? 'Frequently used pattern' : `Early pattern — based on ${t.confidenceCount} similar simulation${t.confidenceCount !== 1 ? 's' : ''}`}
          </span>
        )}
        <Button
          size="sm"
          className="w-full mt-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 border-0"
          onClick={() => {
            if (isStarter) handleRunStarter(t.id as StarterTemplateId);
            else if (canRunStored) handleRunStored(t.id);
            else if (isStarter) handleRunStarter(t.id as StarterTemplateId);
          }}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Run
        </Button>
      </div>
    );
  };

  const starterMeta = selectedStarterId ? getStarterTemplateMeta(selectedStarterId) : null;
  const paramSchema = starterMeta?.paramSchema ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 bg-background/60 border-white/10"
          />
        </div>
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground self-center">Tags:</span>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={cn(
                'text-xs px-2 py-1 rounded-lg border transition-colors',
                tagFilter === tag ? 'bg-amber-500/20 border-amber-500/40' : 'border-white/10 hover:border-white/20'
              )}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {frequentlyUsed.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" />
            Frequently used
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">{frequentlyUsed.map(renderCard)}</div>
        </section>
      )}

      {suggested.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Suggested for your team
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">{suggested.map(renderCard)}</div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Starter templates
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">{starter.map(renderCard)}</div>
      </section>

      {myTemplates.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            My templates
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">{myTemplates.map(renderCard)}</div>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ArchiveRestore className="h-3.5 w-3.5" />
            Archived templates
          </h3>
          <p className="text-xs text-muted-foreground mb-2">Restore to bring back into the library.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {archived.map((t) => (
              <div
                key={t.id}
                className="rounded-xl bg-muted/30 backdrop-blur border border-white/10 p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-foreground/80">{t.name}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => {
                      unarchiveTemplate(t.id);
                      setRefreshKey((k) => k + 1);
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                    Restore
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && archived.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No templates match your search.</p>
      )}

      <Dialog open={paramDialogOpen} onOpenChange={setParamDialogOpen}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base">{starterMeta?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {paramSchema.map((p) => (
              <div key={p.key}>
                <Label className="text-xs text-muted-foreground">{p.label}</Label>
                {p.type === 'member' && (
                  <Select value={paramValues[p.key]} onValueChange={(v) => setParamValues((prev) => ({ ...prev, [p.key]: v }))}>
                    <SelectTrigger className="mt-1 h-9 bg-background/60 border-white/10">
                      <SelectValue placeholder={`Select ${p.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {data.users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {p.type === 'project' && (
                  <Select value={paramValues[p.key]} onValueChange={(v) => setParamValues((prev) => ({ ...prev, [p.key]: v }))}>
                    <SelectTrigger className="mt-1 h-9 bg-background/60 border-white/10">
                      <SelectValue placeholder={`Select ${p.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {data.projects.filter((pr) => pr.status === 'Active').map((pr) => (
                        <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {p.type === 'projects' && (
                  <Select
                    value={paramValues[p.key]}
                    onValueChange={(v) => setParamValues((prev) => ({ ...prev, [p.key]: v }))}
                  >
                    <SelectTrigger className="mt-1 h-9 bg-background/60 border-white/10">
                      <SelectValue placeholder="Select projects (comma IDs or multi)" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.projects.filter((pr) => pr.status === 'Active').map((pr) => (
                        <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {p.type === 'capacity' && (
                  <Select value={paramValues[p.key] ?? '100'} onValueChange={(v) => setParamValues((prev) => ({ ...prev, [p.key]: v }))}>
                    <SelectTrigger className="mt-1 h-9 bg-background/60 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[25, 50, 75, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(p.type === 'dateRange' || p.type === 'number') && (
                  <Input
                    type={p.type === 'dateRange' ? 'date' : 'number'}
                    value={paramValues[p.key] ?? ''}
                    onChange={(e) => setParamValues((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    className="mt-1 h-9 bg-background/60 border-white/10"
                    placeholder={p.label}
                  />
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setParamDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleRunStarterSubmit}>Run simulation</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

