import { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { AppData } from '@/lib/types';
import {
  getMemberTotalPeakFte,
  getMemberProjectFtePercent,
  getDefaultPeriodBounds,
  getCapacityConflict,
} from '@/lib/bandwidth';
import { getBandwidthStatus } from '@/lib/fte';
import { computeSimulationDelta } from '@/lib/simulation';
import {
  getSharedSimulation,
  updateReviewerStatus,
  addSharedSimulationComment,
  deltaFromSerialized,
} from '@/lib/sharedSimulations';
import { addNotification } from '@/lib/notifications';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, ArrowRight, Check, MessageSquare } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const VIEW_PERIOD = 'month' as const;

function loadBarClass(fte: number): string {
  if (fte > 100) return 'bg-red-500/90';
  if (fte >= 100) return 'bg-orange-500/80';
  if (fte >= 75) return 'bg-amber-500/70';
  return 'bg-emerald-500/60';
}

function buildMembersList(data: AppData, anonymize = false) {
  const periodBounds = getDefaultPeriodBounds(VIEW_PERIOD);
  const activeProjects = data.projects.filter((p) => p.status === 'Active');
  return data.users.map((user, idx) => {
    const totalFte = getMemberTotalPeakFte(
      data,
      user,
      VIEW_PERIOD,
      periodBounds.start,
      periodBounds.end
    );
    const remaining = Math.max(0, 100 - totalFte);
    const status = getBandwidthStatus(totalFte);
    const projectIds = Array.from(
      new Set([
        ...data.allocations.filter((a) => a.userId === user.id).map((a) => a.projectId),
        ...data.tasks
          .filter((t) => (t.assigneeIds ?? []).includes(user.id))
          .map((t) => t.projectId),
      ])
    ).filter((pid) => activeProjects.some((p) => p.id === pid));
    const projectAllocs = projectIds.map((projectId) => {
      const project = data.projects.find((p) => p.id === projectId);
      const alloc = data.allocations.find((a) => a.projectId === projectId && a.userId === user.id);
      const ftePercent = getMemberProjectFtePercent(
        data,
        user,
        projectId,
        VIEW_PERIOD,
        periodBounds.start,
        periodBounds.end
      );
      const capacity = alloc?.ftePercent ?? 0;
      const conflict = getCapacityConflict(ftePercent, capacity);
      return {
        projectId,
        projectName: project?.name ?? 'Unknown',
        ftePercent,
        capacity,
        overCapacity: conflict.status === 'exceeds',
      };
    });
    return {
      user: anonymize ? { ...user, name: `Member ${idx + 1}` } : user,
      totalFte: anonymize ? 0 : totalFte,
      remaining: anonymize ? 100 : remaining,
      status,
      projectAllocs: anonymize ? [] : projectAllocs,
      projectCount: projectAllocs.length,
    };
  });
}

function ReadOnlyBandwidthTable({
  data,
  title,
  baseData = null,
  delta,
  isSimulated = false,
  anonymize = false,
  showFte = true,
}: {
  data: AppData;
  title: string;
  baseData?: AppData | null;
  delta?: ReturnType<typeof computeSimulationDelta> | null;
  isSimulated?: boolean;
  anonymize?: boolean;
  showFte?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const members = useMemo(() => buildMembersList(data, anonymize), [data, anonymize]);
  const baseMembers = useMemo(
    () => (baseData ? buildMembersList(baseData, anonymize) : []),
    [baseData, anonymize]
  );
  const baseMap = useMemo(() => {
    const m = new Map<string, (typeof baseMembers)[0]>();
    baseMembers.forEach((row) => m.set(row.user.id, row));
    return m;
  }, [baseMembers]);
  const affectedSet = delta ? delta.affectedMemberIds : new Set<string>();

  return (
    <Card className={cn('border-white/10 bg-card/80 backdrop-blur-sm overflow-hidden', isSimulated && 'ring-1 ring-amber-500/20')}>
      <div className="px-4 py-2 border-b border-border/60 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground/90">{title}</h3>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="w-10 py-2" />
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                {showFte && (
                  <>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Total FTE %</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Remaining %</th>
                  </>
                )}
                <th className="py-2 px-3 min-w-[100px] font-medium text-muted-foreground">Load</th>
              </tr>
            </thead>
            <tbody>
              {members.map(({ user, totalFte, remaining, status, projectAllocs }) => {
                const isExpanded = expandedIds.has(user.id);
                const baseRow = baseData ? baseMap.get(user.id) : null;
                const showDelta = isSimulated && baseRow && showFte && (baseRow.totalFte !== totalFte || baseRow.remaining !== remaining);
                const isAffected = affectedSet.has(user.id);
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b border-border/40',
                      status === 'overallocated' && 'bg-red-500/5',
                      isAffected && isSimulated && 'bg-amber-500/5'
                    )}
                  >
                    <td className="py-1.5 px-2">
                      <button
                        type="button"
                        className="p-1 text-muted-foreground"
                        onClick={() => setExpandedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(user.id)) next.delete(user.id);
                          else next.add(user.id);
                          return next;
                        })}
                        disabled={projectAllocs.length === 0}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-xs font-medium">{user.name}</td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground capitalize">{user.role}</td>
                    {showFte && (
                      <>
                        <td className="py-1.5 px-3 text-right text-xs">
                          {showDelta ? (
                            <span><span className="line-through text-muted-foreground">{Math.round(baseRow!.totalFte)}%</span>
                              <ArrowRight className="inline h-3 w-3 mx-1 text-amber-500" />
                              <span className="font-medium">{Math.round(totalFte)}%</span></span>
                          ) : (
                            <span>{Math.round(totalFte)}%</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right text-xs text-muted-foreground">{Math.round(remaining)}%</td>
                      </>
                    )}
                    <td className="py-1.5 px-3 min-w-[100px]">
                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', loadBarClass(totalFte))}
                          style={{ width: `${Math.min(100, totalFte)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SimulationReview() {
  const { shareId } = useParams<{ shareId: string }>();
  const { currentUser } = useAuth();
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordAttempted, setPasswordAttempted] = useState(false);

  const snapshot = useMemo(() => (shareId ? getSharedSimulation(shareId) : null), [shareId, refreshKey]);
  const delta = useMemo(() => snapshot ? deltaFromSerialized(snapshot.delta) : null, [snapshot]);
  const daysSince = snapshot ? differenceInDays(new Date(), new Date(snapshot.createdAt)) : 0;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleApprove = () => {
    if (!currentUser || !snapshot) return;
    updateReviewerStatus(snapshot.id, currentUser.id, 'approved');
    refresh();
    addNotification({
      id: `notif-approve-${Date.now()}`,
      userId: snapshot.ownerId,
      type: 'simulation_approval',
      category: 'project',
      title: 'Simulation approved',
      message: `${currentUser.name} approved your simulation for ${snapshot.projectLabel}`,
      sharedSimulationId: snapshot.id,
      relatedUserId: currentUser.id,
      createdAt: new Date().toISOString(),
      read: false,
    });
    toast.success('Approval sent to owner');
    setRequestChangesOpen(false);
  };

  const handleRequestChanges = () => {
    if (!currentUser || !snapshot) return;
    const comment = commentText.trim() || 'Requested changes (no comment).';
    updateReviewerStatus(snapshot.id, currentUser.id, 'changes_requested', comment);
    addSharedSimulationComment(snapshot.id, currentUser.id, currentUser.name, comment);
    refresh();
    addNotification({
      id: `notif-feedback-${Date.now()}`,
      userId: snapshot.ownerId,
      type: 'simulation_feedback',
      category: 'project',
      title: 'Changes requested',
      message: `${currentUser.name} requested changes on your simulation for ${snapshot.projectLabel}: "${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}"`,
      sharedSimulationId: snapshot.id,
      relatedUserId: currentUser.id,
      createdAt: new Date().toISOString(),
      read: false,
    });
    toast.success('Feedback sent to owner');
    setCommentText('');
    setRequestChangesOpen(false);
  };

  if (!shareId || !snapshot) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/90 backdrop-blur border border-white/10 p-6 text-center">
          <p className="text-muted-foreground">This simulation is no longer available — contact the owner for an updated link.</p>
        </Card>
      </div>
    );
  }

  if (snapshot.access === 'internal' && !currentUser) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/90 backdrop-blur border border-white/10 p-6 text-center">
          <p className="text-muted-foreground">This simulation is for internal review. Please log in to view.</p>
        </Card>
      </div>
    );
  }

  if (snapshot.access === 'password' && !passwordUnlocked) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-card/90 backdrop-blur border border-white/10 p-6">
          <p className="text-sm text-muted-foreground mb-3">This simulation is protected. Enter the access code to view.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Access code"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm"
            />
            <Button
              size="sm"
              onClick={() => {
                setPasswordAttempted(true);
                if (snapshot.accessCode === passwordInput) setPasswordUnlocked(true);
              }}
            >
              View
            </Button>
          </div>
          {passwordAttempted && snapshot.accessCode !== passwordInput && (
            <p className="text-xs text-destructive mt-2">Incorrect code</p>
          )}
        </Card>
      </div>
    );
  }

  const anonymize = !!snapshot.anonymizeNames;
  const showFte = snapshot.includeFte !== false;
  const n = snapshot.steps.length;
  const m = delta?.newConflicts ?? 0;
  const k = delta?.resolvedConflicts ?? 0;
  const j = delta?.affectedMemberIds.size ?? 0;

  return (
    <div className="space-y-4 animate-fade-in p-6">
      <div className="rounded-xl bg-muted/30 border border-white/10 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Snapshot taken {format(new Date(snapshot.createdAt), 'PPp')} — reflects system state at time of sharing.
        </p>
        {daysSince > 2 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Some values may differ from current system state — {daysSince} days since snapshot.
          </p>
        )}
      </div>

      <div>
        <h1 className="text-xl font-bold text-foreground">
          {snapshot.ownerName} is proposing {n} change{n !== 1 ? 's' : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {m} new conflict{m !== 1 ? 's' : ''} introduced · {k} conflict{k !== 1 ? 's' : ''} resolved · {j} member{j !== 1 ? 's' : ''} affected
        </p>
      </div>

      {/* Step log */}
      <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Steps</p>
        <ul className="space-y-1">
          {snapshot.steps.map((step, i) => (
            <li key={step.id} className="text-xs text-foreground/90">
              Step {i + 1}: {step.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReadOnlyBandwidthTable
          data={snapshot.baseData}
          title="Current state (at snapshot)"
          anonymize={anonymize}
          showFte={showFte}
        />
        <ReadOnlyBandwidthTable
          data={snapshot.simulatedData}
          title="Simulated state"
          baseData={snapshot.baseData}
          delta={delta}
          isSimulated
          anonymize={anonymize}
          showFte={showFte}
        />
      </div>

      {/* Comments */}
      {snapshot.comments.length > 0 && (
        <Card className="border-white/10 bg-card/80 backdrop-blur">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-foreground/90 mb-2">Comments</h3>
            <div className="space-y-2">
              {snapshot.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-muted/30 border border-white/10 px-3 py-2 text-xs">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/90">{c.authorName}</span>
                    {' · '}
                    {format(new Date(c.createdAt), 'PP')}
                  </p>
                  <p className="text-foreground/90 mt-1">{c.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approve / Request changes */}
      {currentUser && currentUser.id !== snapshot.ownerId && (
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border/40">
          <Button
            size="sm"
            variant="default"
            className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApprove}
          >
            <Check className="h-4 w-4 mr-1.5" />
            Approve
          </Button>
          {!requestChangesOpen ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-amber-500/30 text-amber-600 dark:text-amber-400"
              onClick={() => setRequestChangesOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Request changes
            </Button>
          ) : (
            <div className="flex-1 min-w-[200px] flex flex-col gap-2">
              <Textarea
                placeholder="Type your feedback..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[60px] text-sm bg-background/60 border-white/10"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setRequestChangesOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleRequestChanges}>Send feedback</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
