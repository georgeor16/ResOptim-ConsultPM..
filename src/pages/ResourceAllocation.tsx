import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarRange } from 'lucide-react';

export default function ResourceAllocation() {
  const { isManagerOrAbove } = useAuth();
  const data = useMemo(() => loadData(), []);

  if (!isManagerOrAbove) {
    return <div className="text-center py-12 text-muted-foreground">Access restricted</div>;
  }

  const activeProjects = data.projects.filter(p => p.status === 'Active');

  // Generate weeks for the next 8 weeks
  const weeks: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
  for (let i = 0; i < 8; i++) {
    const ws = new Date(startOfWeek);
    ws.setDate(ws.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    weeks.push({
      label: `${ws.getDate()}/${ws.getMonth() + 1}`,
      start: ws,
      end: we,
    });
  }

  // Calculate FTE% per user per week
  const getUserWeekFTE = (userId: string, week: { start: Date; end: Date }) => {
    // Sum FTE% from all active project allocations that overlap with this week
    return data.allocations
      .filter(a => a.userId === userId)
      .filter(a => {
        const project = activeProjects.find(p => p.id === a.projectId);
        if (!project) return false;
        const ps = new Date(project.startDate);
        const pe = new Date(project.endDate);
        return ps <= week.end && pe >= week.start;
      })
      .reduce((sum, a) => sum + a.ftePercent, 0);
  };

  const getBreakdown = (userId: string, week: { start: Date; end: Date }) => {
    return data.allocations
      .filter(a => a.userId === userId)
      .filter(a => {
        const project = activeProjects.find(p => p.id === a.projectId);
        if (!project) return false;
        const ps = new Date(project.startDate);
        const pe = new Date(project.endDate);
        return ps <= week.end && pe >= week.start;
      })
      .map(a => ({
        project: data.projects.find(p => p.id === a.projectId)?.name || '',
        ftePercent: a.ftePercent,
      }));
  };

  const fteColor = (fte: number) => {
    if (fte > 100) return 'bg-danger/20 text-danger';
    if (fte > 80) return 'bg-warning/20 text-warning';
    return 'bg-success/10 text-success';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Resource Allocation</h1>
        <p className="text-sm text-muted-foreground">Weekly capacity grid — 8 week view</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[160px]">Team Member</th>
                {weeks.map((w, i) => (
                  <th key={i} className="text-center p-3 font-medium text-muted-foreground min-w-[80px]">
                    <div className="text-xs">Week</div>
                    {w.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map(user => (
                <tr key={user.id} className="border-b hover:bg-secondary/30">
                  <td className="p-3 sticky left-0 bg-card">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: user.avatarColor, color: 'white' }}
                      >
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                      </div>
                    </div>
                  </td>
                  {weeks.map((w, i) => {
                    const fte = getUserWeekFTE(user.id, w);
                    const breakdown = getBreakdown(user.id, w);
                    return (
                      <td key={i} className="p-2 text-center">
                        <div
                          className={`rounded-md py-1.5 px-2 text-xs font-semibold cursor-default ${fteColor(fte)}`}
                          title={breakdown.map(b => `${b.project}: ${b.ftePercent}%`).join('\n')}
                        >
                          {fte}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Overallocation alerts */}
      {data.users.some(u => weeks.some(w => getUserWeekFTE(u.id, w) > 100)) && (
        <Card className="border-danger/30 bg-danger/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-danger" />
              Overallocation Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.users.filter(u => weeks.some(w => getUserWeekFTE(u.id, w) > 100)).map(user => {
              const overWeeks = weeks.filter(w => getUserWeekFTE(user.id, w) > 100);
              return (
                <p key={user.id} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{user.name}</span> is over 100% FTE in {overWeeks.length} week(s)
                </p>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
