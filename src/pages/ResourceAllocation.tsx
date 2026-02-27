import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarRange, ChevronDown, ChevronRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type ViewMode = 'week' | 'month';

interface WeekInfo { label: string; start: Date; end: Date }
interface MonthInfo { label: string; month: number; year: number; weeks: WeekInfo[] }

function getWeeks(count: number): WeekInfo[] {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  const weeks: WeekInfo[] = [];
  for (let i = 0; i < count; i++) {
    const ws = new Date(startOfWeek);
    ws.setDate(ws.getDate() + i * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    weeks.push({ label: `${ws.getDate()}/${ws.getMonth() + 1}`, start: ws, end: we });
  }
  return weeks;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonths(weeks: WeekInfo[]): MonthInfo[] {
  const monthMap = new Map<string, MonthInfo>();
  for (const w of weeks) {
    const key = `${w.start.getFullYear()}-${w.start.getMonth()}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        label: `${MONTH_NAMES[w.start.getMonth()]} ${w.start.getFullYear()}`,
        month: w.start.getMonth(),
        year: w.start.getFullYear(),
        weeks: [],
      });
    }
    monthMap.get(key)!.weeks.push(w);
  }
  return Array.from(monthMap.values());
}

function getRemainingYearMonths(existingMonths: MonthInfo[]): MonthInfo[] {
  const now = new Date();
  const year = now.getFullYear();
  const existingKeys = new Set(existingMonths.map(m => `${m.year}-${m.month}`));
  const remaining: MonthInfo[] = [];

  for (let m = now.getMonth(); m < 12; m++) {
    const key = `${year}-${m}`;
    if (existingKeys.has(key)) continue;
    // Generate weeks for this month
    const firstDay = new Date(year, m, 1);
    const startMon = new Date(firstDay);
    startMon.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7)); // Monday of first week
    const monthWeeks: WeekInfo[] = [];
    const d = new Date(startMon);
    while (d.getMonth() <= m || (d.getMonth() === 0 && m === 11)) {
      const ws = new Date(d);
      const we = new Date(d);
      we.setDate(we.getDate() + 6);
      // Only include if week overlaps with this month
      if (ws.getMonth() === m || we.getMonth() === m) {
        monthWeeks.push({ label: `${ws.getDate()}/${ws.getMonth() + 1}`, start: ws, end: we });
      }
      d.setDate(d.getDate() + 7);
      if (ws.getMonth() > m && we.getMonth() > m) break;
    }
    remaining.push({
      label: `${MONTH_NAMES[m]} ${year}`,
      month: m,
      year,
      weeks: monthWeeks,
    });
  }
  return remaining;
}

function getWorkingDaysInMonth(month: number, year: number): number {
  let count = 0;
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function ResourceAllocation() {
  const { isManagerOrAbove } = useAuth();
  const data = useMemo(() => loadData(), []);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const activeProjects = useMemo(() => data.projects.filter(p => p.status === 'Active'), [data]);
  const weeks = useMemo(() => getWeeks(16), []);
  const displayWeeks = useMemo(() => weeks.slice(0, 8), [weeks]);
  const months = useMemo(() => getMonths(weeks), [weeks]);
  const remainingMonths = useMemo(() => getRemainingYearMonths(months), [months]);

  if (!isManagerOrAbove) {
    return <div className="text-center py-12 text-muted-foreground">Access restricted</div>;
  }

  const getUserWeekFTE = (userId: string, week: WeekInfo) => {
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

  const getBreakdown = (userId: string, week: WeekInfo) => {
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

  const getUserMonthFTE = (userId: string, month: MonthInfo) => {
    if (month.weeks.length === 0) return 0;
    const total = month.weeks.reduce((sum, w) => sum + getUserWeekFTE(userId, w), 0);
    return Math.round(total / month.weeks.length);
  };

  const getUserMonthHours = (userId: string, month: MonthInfo) => {
    const avgFte = getUserMonthFTE(userId, month);
    const workingDays = getWorkingDaysInMonth(month.month, month.year);
    const availableHours = workingDays * 8;
    const committedHours = Math.round((avgFte / 100) * availableHours);
    return { committed: committedHours, available: availableHours };
  };

  const fteColor = (fte: number) => {
    if (fte > 100) return 'bg-destructive/20 text-destructive';
    if (fte > 80) return 'bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))]';
    return 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]';
  };

  const toggleCell = (key: string) => {
    setExpandedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const relevantWeeks = viewMode === 'week' ? displayWeeks : weeks;
  const hasOverallocation = data.users.some(u => relevantWeeks.some(w => getUserWeekFTE(u.id, w) > 100));

  const renderMonthGrid = (monthList: MonthInfo[], keyPrefix: string) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[160px]">Team Member</th>
          {monthList.map((m, i) => (
            <th key={i} className="text-center p-3 font-medium text-muted-foreground min-w-[120px]">
              {m.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.users.map(user => (
          <tr key={user.id} className="border-b hover:bg-secondary/30 align-top">
            <td className="p-3 sticky left-0 bg-card">
              <UserCell user={user} />
            </td>
            {monthList.map((m, mi) => {
              const avgFte = getUserMonthFTE(user.id, m);
              const hours = getUserMonthHours(user.id, m);
              const cellKey = `${keyPrefix}-${user.id}-${mi}`;
              const isExpanded = expandedCells.has(cellKey);

              return (
                <td key={mi} className="p-2 text-center">
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCell(cellKey)}>
                    <CollapsibleTrigger className="w-full">
                      <div className={`rounded-md py-1.5 px-2 text-xs font-semibold cursor-pointer ${fteColor(avgFte)} flex items-center justify-center gap-1`}>
                        {avgFte}%
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {hours.committed}h / {hours.available}h
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-1">
                        {m.weeks.map((w, wi) => {
                          const wfte = getUserWeekFTE(user.id, w);
                          return (
                            <div key={wi} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${fteColor(wfte)}`}>
                              W{w.label}: {wfte}%
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resource Allocation</h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === 'week' ? 'Weekly capacity grid — 8 week view' : 'Monthly capacity grid'}
          </p>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {viewMode === 'week' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[160px]">Team Member</th>
                  {displayWeeks.map((w, i) => (
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
                      <UserCell user={user} />
                    </td>
                    {displayWeeks.map((w, i) => {
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
          ) : (
            renderMonthGrid(months, 'near')
          )}
        </CardContent>
      </Card>

      {viewMode === 'month' && remainingMonths.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining {new Date().getFullYear()} — Extended View
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {renderMonthGrid(remainingMonths, 'rest')}
          </CardContent>
        </Card>
      )}

      {hasOverallocation && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-destructive" />
              Overallocation Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.users.filter(u => relevantWeeks.some(w => getUserWeekFTE(u.id, w) > 100)).map(user => {
              const overWeeks = relevantWeeks.filter(w => getUserWeekFTE(user.id, w) > 100);
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

function UserCell({ user }: { user: { name: string; role: string; avatarColor: string } }) {
  return (
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
  );
}
