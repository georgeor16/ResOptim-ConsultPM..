import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Task, User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AssigneeSplitControlProps {
  task: Task;
  assignees: User[];
  onChange: (assigneeSplit: Record<string, number>) => void;
  className?: string;
}

/** Minimal inline control: each assignee gets a 0–100 % that must sum to 100. Default equal. */
export function AssigneeSplitControl({ task, assignees, onChange, className }: AssigneeSplitControlProps) {
  if (assignees.length <= 1) return null;

  const total = 100;
  const current: Record<string, number> = {};
  let sum = 0;
  assignees.forEach((u, i) => {
    const pct = task.assigneeSplit?.[u.id] ?? 100 / assignees.length;
    current[u.id] = Math.round(pct);
    sum += current[u.id];
  });
  // Normalize to 100
  if (sum !== total && assignees.length > 0) {
    const first = assignees[0].id;
    current[first] = Math.round(total - assignees.slice(1).reduce((s, u) => s + (current[u.id] ?? 0), 0));
  }

  const handleChange = (userId: string, value: number) => {
    const v = Math.max(0, Math.min(100, value));
    const next = { ...current, [userId]: v };
    const firstId = assignees[0].id;
    const restSum = assignees.filter(u => u.id !== firstId).reduce((s, u) => s + (next[u.id] ?? 0), 0);
    next[firstId] = Math.max(0, Math.min(100, total - restSum));
    onChange(next);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {assignees.map(u => (
        <div key={u.id} className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground w-16 truncate" title={u.name}>
            {u.name.split(' ')[0]}
          </span>
          <Input
            type="number"
            min={0}
            max={100}
            value={current[u.id] ?? 0}
            onChange={e => handleChange(u.id, Number(e.target.value))}
            className="h-6 w-12 text-xs text-right px-1"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
      ))}
    </div>
  );
}
