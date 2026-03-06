import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getActiveFlags,
  getResolvedFlags,
  dismissFlag,
  getRetirementRecommendations,
  type PlanningFlag,
  type PlanningProblemFlag,
  type SystemicCapacityFlag,
  type FlagDismissalReason,
} from '@/lib/planningInsights';
import {
  getRecentAppliedRuns,
  recordReversal,
  getTemplateHealthDetails,
  archiveTemplate,
} from '@/lib/simulationTemplates';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, RotateCcw, ChevronDown, ChevronRight, ArchiveRestore } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISSAL_REASONS: { value: FlagDismissalReason; label: string }[] = [
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'already_resolved', label: 'Already resolved' },
  { value: 'pattern_intentional', label: 'Pattern is intentional' },
  { value: 'will_address_later', label: 'Will address later' },
];

export function PlanningInsightsPanel() {
  const { currentUser } = useAuth();
  const [dismissingFlagId, setDismissingFlagId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeFlags = useMemo(
    () => (currentUser ? getActiveFlags(currentUser.id) : []),
    [currentUser?.id, refreshKey]
  );
  const resolvedFlags = useMemo(() => getResolvedFlags(), [refreshKey]);
  const recentApplied = useMemo(() => getRecentAppliedRuns(15), [refreshKey]);
  const retirementRecs = useMemo(
    () => (currentUser ? getRetirementRecommendations(currentUser.id) : []),
    [currentUser?.id, refreshKey]
  );

  const handleDismiss = (flagId: string, reason: FlagDismissalReason, scenarioLabel: string, type: 'planning_problem' | 'systemic') => {
    dismissFlag(flagId, reason, scenarioLabel, type);
    setDismissingFlagId(null);
    setRefreshKey((k) => k + 1);
  };

  const handleMarkReversed = (runId: string) => {
    recordReversal(runId);
    setRefreshKey((k) => k + 1);
  };

  const systemicFlags = activeFlags.filter((f): f is SystemicCapacityFlag => f.type === 'systemic');
  const problemFlags = activeFlags.filter((f): f is PlanningProblemFlag => f.type === 'planning_problem');

  return (
    <div className="space-y-6">
      {/* Recently applied — Mark as reversed */}
      {recentApplied.filter((r) => !r.reversedAt).length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Recently applied
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Undid these changes? Mark as reversed so the system can learn.
          </p>
          <ul className="space-y-2">
            {recentApplied.filter((r) => !r.reversedAt).slice(0, 10).map((r) => {
              const label = Array.isArray(r.stepsSummary) ? (r.stepsSummary as { label?: string }[])[0]?.label : null;
              return (
                <li
                  key={r.id}
                  className="rounded-lg bg-background/60 backdrop-blur border border-white/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground truncate flex-1">
                    {label ?? `Applied ${formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}`}
                  </span>
                  <span className="text-muted-foreground shrink-0">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    onClick={() => handleMarkReversed(r.id)}
                  >
                    Mark as reversed
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Active Flags */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Active flags
        </h3>
        {activeFlags.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">No active planning problem or systemic flags.</p>
        ) : (
          <ul className="space-y-3">
            {systemicFlags.map((f) => (
              <FlagCard
                key={f.id}
                flag={f}
                onDismiss={(reason) => handleDismiss(f.id, reason, f.periodLabel, 'systemic')}
                isDismissing={dismissingFlagId === f.id}
                onStartDismiss={() => setDismissingFlagId(f.id)}
                onCancelDismiss={() => setDismissingFlagId(null)}
              />
            ))}
            {problemFlags.map((f) => (
              <FlagCard
                key={f.id}
                flag={f}
                onDismiss={(reason) => handleDismiss(f.id, reason, f.scenarioLabel, 'planning_problem')}
                isDismissing={dismissingFlagId === f.id}
                onStartDismiss={() => setDismissingFlagId(f.id)}
                onCancelDismiss={() => setDismissingFlagId(null)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Retirement recommendations */}
      {retirementRecs.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ArchiveRestore className="h-3.5 w-3.5" />
            Template retirement review
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            These templates may no longer reflect your team&apos;s planning patterns.
          </p>
          <ul className="space-y-2">
            {retirementRecs.map(({ template, reason, suggestedReplacementId }) => (
              <li
                key={template.id}
                className="rounded-lg bg-background/60 backdrop-blur border border-amber-500/20 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-foreground/90 font-medium">{template.name}</span>
                <p className="w-full text-muted-foreground mt-0.5">{reason}</p>
                <div className="flex gap-1.5 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7"
                    onClick={() => { archiveTemplate(template.id); setRefreshKey((k) => k + 1); }}
                  >
                    Archive
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => setRefreshKey((k) => k + 1)}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Resolved */}
      {resolvedFlags.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolved
          </h3>
          <ul className="space-y-1.5">
            {resolvedFlags.slice(0, 15).map((r) => (
              <li
                key={r.id}
                className="rounded-lg bg-muted/20 border border-white/5 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {r.scenarioLabel} — resolved {formatDistanceToNow(new Date(r.resolvedAt), { addSuffix: true })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FlagCard({
  flag,
  onDismiss,
  isDismissing,
  onStartDismiss,
  onCancelDismiss,
}: {
  flag: PlanningFlag;
  onDismiss: (reason: FlagDismissalReason) => void;
  isDismissing: boolean;
  onStartDismiss: () => void;
  onCancelDismiss: () => void;
}) {
  const isSystemic = flag.type === 'systemic';
  const label = isSystemic ? (flag as SystemicCapacityFlag).periodLabel : (flag as PlanningProblemFlag).scenarioLabel;
  const description = isSystemic ? (flag as SystemicCapacityFlag).description : (flag as PlanningProblemFlag).bottleneckDescription;
  const interventions = isSystemic ? (flag as SystemicCapacityFlag).suggestedInterventions : (flag as PlanningProblemFlag).suggestedInterventions;
  const attemptInfo = !isSystemic ? `Attempted ${(flag as PlanningProblemFlag).attemptCount} times · Discarded each time` : null;
  const severityClass = flag.status === 'active' ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5';

  return (
    <Card className={cn('rounded-xl border backdrop-blur', severityClass)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground/95">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            {attemptInfo && (
              <p className="text-[11px] text-muted-foreground mt-1">{attemptInfo}</p>
            )}
          </div>
          {!isDismissing ? (
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={onStartDismiss}>
              Dismiss
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={onCancelDismiss}>
              Cancel
            </Button>
          )}
        </div>
        {interventions.length > 0 && (
          <div className="pt-1 border-t border-white/10">
            <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Suggested interventions</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {interventions.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {isDismissing && (
          <div className="pt-2 flex flex-wrap gap-1.5">
            {DISMISSAL_REASONS.map((r) => (
              <Button
                key={r.value}
                variant="outline"
                size="sm"
                className="text-xs rounded-full border-white/20"
                onClick={() => onDismiss(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Expandable health detail for a template (used in template card). */
export function TemplateHealthDetail({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const details = useMemo(() => getTemplateHealthDetails(templateId), [templateId]);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Health details
      </button>
      {open && (
        <div className="mt-1.5 pl-3 border-l border-white/10 space-y-1 text-[10px] text-muted-foreground">
          <p>Apply: {details.applyCount} · Discard: {details.discardCount}</p>
          <p>Reversals: {details.reversalCount}{details.avgTimeToReversalHours != null ? ` · Avg time to reversal: ${Math.round(details.avgTimeToReversalHours)}h` : ''}</p>
          <p>Frustrated discards: {details.frustratedDiscardCount} · Exploratory: {details.exploratoryDiscardCount}</p>
        </div>
      )}
    </div>
  );
}
