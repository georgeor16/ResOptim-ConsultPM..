import { useSimulationOptional } from '@/contexts/SimulationContext';
import { cn } from '@/lib/utils';

export function SimulationBanner() {
  const sim = useSimulationOptional();
  if (!sim?.isSimulationMode) return null;

  return (
    <div
      className={cn(
        'sticky top-0 z-40 flex items-center justify-center gap-2 py-2 px-4',
        'bg-amber-500/10 backdrop-blur-md border-b border-amber-500/20'
      )}
    >
      <span
        className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
        aria-hidden
      />
      <span className="text-sm font-medium text-foreground/90">
        Simulation Mode — no changes are being saved
      </span>
    </div>
  );
}
