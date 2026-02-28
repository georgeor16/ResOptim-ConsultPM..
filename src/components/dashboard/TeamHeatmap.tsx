import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AppData } from '@/lib/types';

interface Props {
  data: AppData;
}

export default function TeamHeatmap({ data }: Props) {
  const navigate = useNavigate();
  const { users, activeProjects, matrix } = useMemo(() => {
    const activeProjects = data.projects.filter(p => p.status === 'Active');
    const users = data.users;

    // Build matrix: user → project → ftePercent
    const matrix: Record<string, Record<string, number>> = {};
    for (const u of users) {
      matrix[u.id] = {};
      for (const p of activeProjects) {
        const alloc = data.allocations.find(a => a.userId === u.id && a.projectId === p.id);
        matrix[u.id][p.id] = alloc ? alloc.ftePercent : 0;
      }
    }

    return { users, activeProjects, matrix };
  }, [data]);

  const getTotalFte = (userId: string) =>
    Object.values(matrix[userId] || {}).reduce((s, v) => s + v, 0);

  const cellColor = (fte: number) => {
    if (fte === 0) return 'bg-muted/30';
    if (fte <= 25) return 'bg-accent/20';
    if (fte <= 50) return 'bg-accent/40';
    if (fte <= 75) return 'bg-accent/60';
    return 'bg-accent/80';
  };

  const totalColor = (fte: number) => {
    if (fte > 100) return 'text-destructive font-bold';
    if (fte > 80) return 'text-warning font-semibold';
    return 'text-muted-foreground';
  };

  if (users.length === 0 || activeProjects.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">Team Utilization</h3>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-muted/30 border border-border" />0%</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-accent/20" />≤25%</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-accent/40" />≤50%</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-accent/60" />≤75%</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-accent/80" />≤100%</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-[140px]">Member</th>
                {activeProjects.map(p => (
                  <th key={p.id} className="py-2 px-1 font-medium text-muted-foreground text-center max-w-[80px] cursor-pointer hover:text-foreground transition-colors" onClick={() => navigate(`/projects/${p.id}`)}>
                    <span className="block truncate" title={p.name}>{p.name}</span>
                  </th>
                ))}
                <th className="py-2 px-2 font-medium text-muted-foreground text-center">Total</th>
              </tr>
            </thead>
            <TooltipProvider>
              <tbody>
                {users.map(user => {
                  const total = getTotalFte(user.id);
                  return (
                    <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={{ backgroundColor: user.avatarColor, color: 'white' }}
                          >
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="text-foreground truncate">{user.name}</span>
                        </div>
                      </td>
                      {activeProjects.map(p => {
                        const fte = matrix[user.id]?.[p.id] || 0;
                        return (
                          <td key={p.id} className="py-1.5 px-1 text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`mx-auto h-6 w-full max-w-[60px] rounded-sm flex items-center justify-center ${cellColor(fte)} transition-colors cursor-default`}>
                                  {fte > 0 && <span className="text-foreground/80 text-[10px]">{fte}%</span>}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">{user.name}</p>
                                <p className="text-muted-foreground">{p.name}: {fte}% FTE</p>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="py-1.5 px-2 text-center">
                        <span className={totalColor(total)}>{total}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TooltipProvider>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
