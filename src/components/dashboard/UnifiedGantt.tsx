import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AppData } from '@/lib/types';

interface Props {
  data: AppData;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  Active: { bg: 'bg-status-active', border: 'border-status-active', label: 'Active' },
  'On Hold': { bg: 'bg-status-onhold', border: 'border-status-onhold', label: 'On Hold' },
  Completed: { bg: 'bg-status-completed', border: 'border-status-completed', label: 'Completed' },
};

const PRIORITY_PATTERNS: Record<string, string> = {
  High: 'border-l-4 border-l-priority-high',
  Medium: 'border-l-4 border-l-priority-medium',
  Low: 'border-l-4 border-l-priority-low',
};

export default function UnifiedGantt({ data }: Props) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { months, timelineStart, totalDays, projects } = useMemo(() => {
    const now = new Date();
    // Start from earliest project or 2 months ago, whichever is earlier
    let earliest = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let latest = new Date(now.getFullYear(), 11, 31);

    for (const p of data.projects) {
      const s = new Date(p.startDate);
      const e = new Date(p.endDate);
      if (s < earliest) earliest = new Date(s.getFullYear(), s.getMonth(), 1);
      if (e > latest) latest = e;
    }

    const timelineStart = earliest;
    const timelineEnd = new Date(latest.getFullYear(), latest.getMonth() + 1, 0);
    const totalDays = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Generate months
    const months: { label: string; startDay: number; days: number }[] = [];
    let cursor = new Date(timelineStart);
    while (cursor <= timelineEnd) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const startDay = Math.max(0, Math.ceil((monthStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)));
      const endDay = Math.min(totalDays, Math.ceil((monthEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      months.push({
        label: cursor.toLocaleString('default', { month: 'short', year: '2-digit' }),
        startDay,
        days: endDay - startDay,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // Sort projects: Active first, then by start date
    const statusOrder: Record<string, number> = { Active: 0, 'On Hold': 1, Completed: 2 };
    const projects = [...data.projects].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (so !== 0) return so;
      return a.startDate.localeCompare(b.startDate);
    });

    return { months, timelineStart, totalDays, projects };
  }, [data]);

  const getBarStyle = (startDate: string, endDate: string) => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const startDay = Math.max(0, Math.ceil((s.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)));
    const endDay = Math.ceil((e.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const left = (startDay / totalDays) * 100;
    const width = Math.max(0.5, ((endDay - startDay) / totalDays) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  // Today marker
  const todayOffset = (() => {
    const diff = Math.ceil((Date.now() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
    return (diff / totalDays) * 100;
  })();

  if (projects.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">Project Timeline</h3>
          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground font-medium">Status:</span>
              {Object.entries(STATUS_COLORS).map(([key, val]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-5 rounded-sm ${val.bg}`} />
                  <span className="text-muted-foreground">{val.label}</span>
                </span>
              ))}
            </div>
            <div className="h-3 border-l border-border" />
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground font-medium">Priority:</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-sm bg-priority-high" />
                <span className="text-muted-foreground">High</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-sm bg-priority-medium" />
                <span className="text-muted-foreground">Medium</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-1 rounded-sm bg-priority-low" />
                <span className="text-muted-foreground">Low</span>
              </span>
            </div>
            <div className="h-3 border-l border-border" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="h-4 w-px bg-danger" />
              <span className="text-muted-foreground">Today</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto" ref={scrollRef}>
          <div className="min-w-[800px]">
            {/* Month headers */}
            <div className="flex border-b border-border mb-1">
              <div className="w-[180px] shrink-0" />
              <div className="flex-1 relative h-6">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 text-[10px] text-muted-foreground font-medium border-l border-border/50 pl-1"
                    style={{ left: `${(m.startDay / totalDays) * 100}%`, width: `${(m.days / totalDays) * 100}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            <TooltipProvider>
              {projects.map((project) => {
                const tasks = data.tasks.filter(t => t.projectId === project.id);
                const doneTasks = tasks.filter(t => t.status === 'Done').length;
                const progress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
                const color = STATUS_COLORS[project.status] || STATUS_COLORS.Active;
                const barStyle = getBarStyle(project.startDate, project.endDate);

                return (
                  <div key={project.id} className="flex items-center group hover:bg-muted/30 rounded-sm cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                    <div className="w-[180px] shrink-0 py-1.5 pr-3">
                      <p className="text-xs font-medium text-foreground truncate">{project.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{project.client}</p>
                    </div>
                    <div className="flex-1 relative h-8">
                      {/* Today line */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-danger/60 z-10"
                        style={{ left: `${todayOffset}%` }}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-1 h-6 rounded-sm ${color.bg} opacity-80 hover:opacity-100 transition-opacity cursor-default ${PRIORITY_PATTERNS[project.priority] || ''}`}
                            style={barStyle}
                          >
                            {/* Progress fill */}
                            <div
                              className="h-full rounded-sm bg-foreground/10"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-medium">{project.name}</p>
                          <p className="text-muted-foreground">{project.startDate} → {project.endDate}</p>
                          <p>{progress}% complete · {doneTasks}/{tasks.length} tasks</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
