import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBandwidthStatus, getBandwidthTooltip, type BandwidthStatus } from '@/lib/fte';
import { cn } from '@/lib/utils';

const statusStyles: Record<BandwidthStatus, string> = {
  available: '',
  approaching: 'ring-1 ring-amber-400/50 bg-amber-500/10 rounded-md',
  full: 'ring-1 ring-orange-400/60 bg-orange-500/10 rounded-md',
  overallocated: 'ring-1 ring-red-400/60 bg-red-500/10 rounded-md shadow-[0_0_12px_rgba(248,113,113,0.25)]',
};

interface BandwidthWarningProps {
  totalFtePercent: number;
  children: ReactNode;
  className?: string;
  /** If true, wrap in a subtle frosted badge for overallocated state */
  useBadge?: boolean;
}

export function BandwidthWarning({ totalFtePercent, children, className, useBadge }: BandwidthWarningProps) {
  const status = getBandwidthStatus(totalFtePercent);
  const tooltip = getBandwidthTooltip(totalFtePercent);
  const styleClass = statusStyles[status];
  const needsTooltip = status !== 'available';

  const content = (
    <span
      className={cn(
        needsTooltip && styleClass,
        useBadge && status === 'overallocated' && 'inline-flex items-center px-1.5 py-0.5 rounded-md bg-red-500/15 backdrop-blur-sm border border-red-400/30',
        className
      )}
    >
      {children}
    </span>
  );

  if (!needsTooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export { getBandwidthStatus, getBandwidthTooltip };
export type { BandwidthStatus };
