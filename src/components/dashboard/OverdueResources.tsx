import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock } from 'lucide-react';
import type { AppData } from '@/lib/types';

interface Props {
  data: AppData;
}

export default function OverdueResources({ data }: Props) {
  const navigate = useNavigate();
  const overdueItems = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const results: { type: 'task'; projectId: string; projectName: string; title: string; dueDate: string; assignees: string[] }[] = [];

    for (const task of data.tasks) {
      if (task.status === 'Done') continue;
      if (task.dueDate && task.dueDate < today) {
        const project = data.projects.find(p => p.id === task.projectId);
        if (project?.status === 'Completed') continue;
        const assigneeNames = (task.assigneeIds || [])
          .map(id => data.users.find(u => u.id === id)?.name)
          .filter(Boolean) as string[];
        results.push({
          type: 'task',
          projectId: project?.id || '',
          projectName: project?.name || 'Unknown',
          title: task.title,
          dueDate: task.dueDate,
          assignees: assigneeNames,
        });
      }
    }

    for (const subtask of data.subtasks) {
      if (subtask.status === 'Done') continue;
      if (subtask.dueDate && subtask.dueDate < today) {
        const parentTask = data.tasks.find(t => t.id === subtask.taskId);
        const project = parentTask ? data.projects.find(p => p.id === parentTask.projectId) : undefined;
        if (project?.status === 'Completed') continue;
        const assigneeNames = (subtask.assigneeIds || [])
          .map(id => data.users.find(u => u.id === id)?.name)
          .filter(Boolean) as string[];
        results.push({
          type: 'task',
          projectId: project?.id || '',
          projectName: project?.name || 'Unknown',
          title: subtask.title,
          dueDate: subtask.dueDate,
          assignees: assigneeNames,
        });
      }
    }

    return results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [data]);

  const daysOverdue = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (overdueItems.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-success" />
            <h3 className="font-semibold text-foreground text-sm">Overdue Tasks</h3>
          </div>
          <p className="text-sm text-muted-foreground">No overdue tasks — everything is on track!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h3 className="font-semibold text-foreground text-sm">Overdue Tasks</h3>
          </div>
          <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20">
            {overdueItems.length}
          </Badge>
        </div>
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
          {overdueItems.map((item, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => item.projectId && navigate(`/projects/${item.projectId}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.projectName}</p>
                {item.assignees.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.assignees.join(', ')}</p>
                )}
              </div>
              <Badge variant="outline" className="bg-danger/10 text-danger border-danger/20 shrink-0 text-xs">
                {daysOverdue(item.dueDate)}d late
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
