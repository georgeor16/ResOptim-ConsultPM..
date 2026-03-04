import { getBandwidthStatus, type BandwidthStatus } from '@/lib/fte';
import { cn } from '@/lib/utils';

const pillClass: Record<BandwidthStatus, string> = {
  available: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-700 dark:text-emerald-300',
  approaching: 'bg-amber-500/20 border-amber-400/30 text-amber-700 dark:text-amber-300',
  full: 'bg-orange-500/20 border-orange-400/30 text-orange-700 dark:text-orange-300',
  overallocated: 'bg-red-500/20 border-red-400/30 text-red-700 dark:text-red-300',
};

interface LoadPillProps {
  ftePercent: number;
  className?: string;
  showValue?: boolean;
}

export function LoadPill({ ftePercent, className, showValue = true }: LoadPillProps) {
  const status = getBandwidthStatus(ftePercent);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur-sm',
        pillClass[status],
        className
      )}
    >
      {showValue && <span className="mr-1">{Math.round(ftePercent)}%</span>}
      <span
        className={cn(
          'h-1.5 min-w-[2rem] w-8 rounded-full overflow-hidden bg-black/10',
          status === 'available' && 'bg-emerald-500/50',
          status === 'approaching' && 'bg-amber-500/50',
          status === 'full' && 'bg-orange-500/50',
          status === 'overallocated' && 'bg-red-500/60'
        )}
      >
        <span
          className="block h-full rounded-full bg-current opacity-80"
          style={{ width: `${Math.min(100, ftePercent)}%` }}
        />
      </span>
    </span>
  );
}
