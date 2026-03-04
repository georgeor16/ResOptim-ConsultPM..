import type { ActivityEvent } from '@/lib/notifications';
import { formatRelativeTime } from '@/lib/notifications';

interface ActivityFeedProps {
  events: ActivityEvent[];
  compact?: boolean;
}

export function ActivityFeed({ events, compact = false }: ActivityFeedProps) {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground/70">No activity yet.</p>;
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {events.map(ev => (
        <div key={ev.id} className="relative pl-4">
          <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-accent/60" />
          <div className="text-[11px] text-muted-foreground/70">{formatRelativeTime(ev.createdAt)}</div>
          <div className="text-xs text-foreground/90">{ev.message}</div>
        </div>
      ))}
    </div>
  );
}

