import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActiveFlags } from '@/lib/planningInsights';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Building2, AlertTriangle, CheckCircle } from 'lucide-react';

export type OrgHealthLevel = 'healthy' | 'attention' | 'critical';

export function getOrgHealthLevel(flags: { type: string }[]): OrgHealthLevel {
  const planningCount = flags.filter(f => f.type === 'planning_problem').length;
  const systemicCount = flags.filter(f => f.type === 'systemic').length;
  if (systemicCount >= 1 || planningCount >= 3) return 'critical';
  if (planningCount > 0) return 'attention';
  return 'healthy';
}

interface HealthAndAlertsSummaryPanelProps {
  orgId: string;
  orgName: string;
  currentUser: User;
  /** Manager and above can see Insights link. */
  canAccessInsights: boolean;
  /** Admin sees full summary; manager sees full; member sees only their slice. */
  role: 'admin' | 'manager' | 'member';
}

export function HealthAndAlertsSummaryPanel({
  orgId,
  orgName,
  currentUser,
  canAccessInsights,
  role,
}: HealthAndAlertsSummaryPanelProps) {
  const navigate = useNavigate();
  const flags = useMemo(() => getActiveFlags(currentUser.id), [currentUser.id]);
  const level = useMemo(() => getOrgHealthLevel(flags), [flags]);
  const criticalCount = flags.filter(f => f.type === 'systemic').length;
  const planningCount = flags.filter(f => f.type === 'planning_problem').length;
  const attentionCount = planningCount;
  const showCriticalBadge = level === 'critical' && (criticalCount > 0 || planningCount >= 3);

  const levelLabel = level === 'healthy' ? 'Healthy' : level === 'attention' ? 'Needs Attention' : 'Critical';
  const levelIcon = level === 'healthy' ? CheckCircle : level === 'attention' ? AlertTriangle : AlertTriangle;
  const levelColor = level === 'healthy' ? 'text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10' : level === 'attention' ? 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/10';

  if (role === 'member') {
    return (
      <Card className="bg-card/50 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Organisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Organisation is currently at <span className={cn('font-medium', levelColor)}>{levelLabel}</span>.
          </p>
          {currentUser.primaryRole && (
            <p className="text-[11px] text-muted-foreground/90">
              Your role is considered in org-wide capacity planning.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Health & alerts summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', levelColor)}>
            {levelIcon === CheckCircle && <CheckCircle className="h-3.5 w-3.5" />}
            {levelIcon === AlertTriangle && <AlertTriangle className="h-3.5 w-3.5" />}
            {levelLabel}
          </span>
          {level !== 'healthy' && (
            <>
              {showCriticalBadge && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
                  {criticalCount > 0 ? `${criticalCount} Critical` : 'Critical'}
                </span>
              )}
              {attentionCount > 0 && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  {attentionCount} Attention
                </span>
              )}
            </>
          )}
        </div>
        {level !== 'healthy' && flags.length > 0 && (
          <p className="text-[11px] text-muted-foreground/90">
            {flags.length} active planning flag{flags.length !== 1 ? 's' : ''} — review Insights for details.
          </p>
        )}
        {canAccessInsights && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => navigate('/insights')}
          >
            View in Insights
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
