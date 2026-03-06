import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { loadData } from '@/lib/store';
import type { AppData } from '@/lib/types';
import {
  getChangeTypeLabel,
  rankProjectsForConflictResolution,
  type ExternalConflictResult,
} from '@/lib/bandwidthConflicts';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONFLICT_RESOLUTION_EVENT = 'open-conflict-resolution';

export function openConflictResolutionView(result: ExternalConflictResult): void {
  window.dispatchEvent(
    new CustomEvent(CONFLICT_RESOLUTION_EVENT, { detail: { result } })
  );
}

/** Call from onToast when checkExternalConflictsAfterChange finds conflicts. */
export function showExternalConflictToast(result: ExternalConflictResult): void {
  const cause = getChangeTypeLabel(result.changeType);
  const projectList = result.affectedProjects.map((a) => a.projectName).slice(0, 3).join(', ');
  const more = result.affectedProjects.length > 3 ? ` and ${result.affectedProjects.length - 3} more` : '';
  toast.warning(
    `${result.userName}'s available bandwidth has changed — their commitment to other projects may now be at risk. Cause: ${cause} on ${result.sourceProjectName}. Affected: ${projectList}${more}.`,
    {
      duration: 10000,
      action: {
        label: 'View conflicts',
        onClick: () => openConflictResolutionView(result),
      },
    }
  );
}

export function ConflictResolutionTrigger() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ExternalConflictResult | null>(null);
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent<{ result: ExternalConflictResult }>) => {
      setResult(e.detail.result);
      setOpen(true);
      loadData().then(setData);
    };
    window.addEventListener(CONFLICT_RESOLUTION_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(CONFLICT_RESOLUTION_EVENT, handler as EventListener);
  }, []);

  const priorityOrder =
    result && data
      ? rankProjectsForConflictResolution(
          data,
          result.userId,
          result.affectedProjects.map((a) => a.projectId)
        )
      : result?.affectedProjects.map((a) => a.projectId) ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full max-w-md bg-background/95 backdrop-blur-xl border-white/10 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            Bandwidth conflict
          </SheetTitle>
        </SheetHeader>
        {result && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {result.userName}'s available bandwidth has changed. Their commitment to other
              projects may now be at risk.
            </p>
            <div className="rounded-lg bg-muted/30 border border-white/10 p-3 text-xs">
              <p className="font-medium text-foreground/90">Cause</p>
              <p className="text-muted-foreground mt-0.5">
                {getChangeTypeLabel(result.changeType)} on {result.sourceProjectName}
              </p>
              <p className="text-muted-foreground mt-1">
                Total FTE now: <span className="font-medium text-foreground/90">{Math.round(result.newTotalFte)}%</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Resolve in this order for least disruption
              </p>
              <ol className="space-y-2">
                {priorityOrder.map((projectId, i) => {
                  const aff = result.affectedProjects.find((a) => a.projectId === projectId);
                  if (!aff) return null;
                  return (
                    <li
                      key={aff.projectId}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm',
                        i === 0 && 'ring-1 ring-amber-500/30'
                      )}
                    >
                      <span className="text-muted-foreground font-mono text-xs w-5">{i + 1}.</span>
                      <span className="flex-1 font-medium truncate">{aff.projectName}</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {Math.round(aff.taskFte)}% req · {Math.round(aff.capacity)}% cap
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="border-t border-white/10 pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Resolution options</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start border-white/10 text-xs h-8"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/projects/${result.sourceProjectId}`);
                  }}
                >
                  Reduce capacity on {result.sourceProjectName}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start border-white/10 text-xs h-8"
                  onClick={() => {
                    setOpen(false);
                    if (priorityOrder[0]) navigate(`/projects/${priorityOrder[0]}`);
                  }}
                >
                  Reduce capacity on existing project
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start border-white/10 text-xs h-8"
                  onClick={() => {
                    setOpen(false);
                    if (priorityOrder[0]) navigate(`/projects/${priorityOrder[0]}?tab=tasks`);
                  }}
                >
                  Reassign tasks to free up {result.userName}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start border-white/10 text-xs h-8"
                  onClick={() => {
                    setOpen(false);
                    navigate('/bandwidth');
                  }}
                >
                  Open Bandwidth overview
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
