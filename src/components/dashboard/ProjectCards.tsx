import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoneyWithCode, convertCurrency, type CurrencyCode } from '@/lib/currency';
import type { FxRates } from '@/lib/currency';
import type { AppData, Project } from '@/lib/types';

interface ProjectCardsProps {
  data: AppData;
  visibleProjects: Project[];
  baseCurrency: CurrencyCode;
  rates: FxRates;
}

const priorityColor = (p: string) => {
  switch (p) {
    case 'High': return 'bg-priority-high/10 text-priority-high border-priority-high/20';
    case 'Medium': return 'bg-priority-medium/10 text-priority-medium border-priority-medium/20';
    case 'Low': return 'bg-priority-low/10 text-priority-low border-priority-low/20';
    default: return '';
  }
};

const statusColor = (s: string) => {
  switch (s) {
    case 'Active': return 'bg-status-active/10 text-status-active border-status-active/20';
    case 'On Hold': return 'bg-status-onhold/10 text-status-onhold border-status-onhold/20';
    case 'Completed': return 'bg-status-completed/10 text-status-completed border-status-completed/20';
    default: return '';
  }
};

const marginColor = (m: number) => {
  if (m > 30) return 'financial-positive';
  if (m > 10) return 'financial-warning';
  return 'financial-negative';
};

export default function ProjectCards({ data, visibleProjects, baseCurrency, rates }: ProjectCardsProps) {
  const navigate = useNavigate();

  const conv = (amount: number, from: string) =>
    convertCurrency(amount, from as CurrencyCode, baseCurrency, rates);

  if (visibleProjects.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first project to get started</p>
          <Button onClick={() => navigate('/projects/new')} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" /> Create Project
            </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {visibleProjects.map(project => {
        const projectAllocations = data.allocations.filter(a => a.projectId === project.id);
        const assignedUsers = projectAllocations.map(a => data.users.find(u => u.id === a.userId)).filter(Boolean);
        const projectTasks = data.tasks.filter(t => t.projectId === project.id);
        const doneTasks = projectTasks.filter(t => t.status === 'Done').length;
        const progress = projectTasks.length > 0 ? (doneTasks / projectTasks.length) * 100 : 0;

        const projectCost = projectAllocations.reduce((c, alloc) => {
          const user = data.users.find(u => u.id === alloc.userId);
          return c + (user ? conv(user.monthlySalary * (alloc.ftePercent / 100), user.currency || 'USD') : 0);
        }, 0);
        const projectRevenue = conv(project.monthlyFee, project.currency || 'USD');
        const projectMargin = projectRevenue > 0 ? ((projectRevenue - projectCost) / projectRevenue) * 100 : 0;

        return (
          <Card
            key={project.id}
            className="cursor-pointer hover:shadow-md transition-shadow hover:border-accent/30"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
                  <p className="text-sm text-muted-foreground">{project.client}</p>
                </div>
                <Badge variant="outline" className={priorityColor(project.priority)}>
                  {project.priority}
                </Badge>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className={statusColor(project.status)}>
                  {project.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{project.category}{project.category === 'Other' && project.categoryOtherSpec ? ` (${project.categoryOtherSpec})` : ''}</span>
              </div>

              <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-muted-foreground">{formatMoneyWithCode(projectRevenue, baseCurrency)}{(project.feeType ?? 'monthly') === 'monthly' ? '/mo' : ''}</span>
                  <span className={marginColor(projectMargin)}>{projectMargin.toFixed(0)}% margin</span>
                </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{doneTasks}/{projectTasks.length} tasks</span>
                  <span>{progress.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="flex items-center">
                <div className="flex -space-x-2">
                  {assignedUsers.slice(0, 4).map((user) => user && (
                    <div
                      key={user.id}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-card"
                      style={{ backgroundColor: user.avatarColor, color: 'white' }}
                      title={user.name}
                    >
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                  ))}
                </div>
                {assignedUsers.length > 4 && (
                  <span className="text-xs text-muted-foreground ml-2">+{assignedUsers.length - 4}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
