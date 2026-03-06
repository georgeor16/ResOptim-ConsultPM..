import { useAuth } from '@/contexts/AuthContext';
import { loadData, deleteProject } from '@/lib/store';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppData } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, UserCog } from 'lucide-react';
import ProjectTeamEditor from '@/components/ProjectTeamEditor';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Project, ProjectCategory } from '@/lib/types';

const PROJECT_CATEGORIES: ProjectCategory[] = ['Scouting', 'Event', 'Full Report', 'Light Report', 'Other'];

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

export default function Projects() {
  const { isManagerOrAbove, currentUser } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<AppData | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData().then(setData);
  }, [refreshKey]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editTeamProjectId, setEditTeamProjectId] = useState<string | null>(null);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-foreground" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1 text-foreground" />;
  };

  if (!data) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  const allProjects = isManagerOrAbove
    ? data.projects
    : data.projects.filter(p =>
        data.allocations.some(a => a.projectId === p.id && a.userId === currentUser?.id) ||
        data.tasks.some(t => t.projectId === p.id && (t.assigneeIds || []).includes(currentUser?.id || ''))
      );

  const filtered = allProjects.filter(p => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const statusOrder: Record<string, number> = { Active: 0, 'On Hold': 1, Completed: 2 };

  const getProgress = (project: Project) => {
    const tasks = data.tasks.filter(t => t.projectId === project.id);
    const done = tasks.filter(t => t.status === 'Done').length;
    return tasks.length > 0 ? (done / tasks.length) * 100 : 0;
  };

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name': return dir * a.name.localeCompare(b.name);
      case 'client': return dir * a.client.localeCompare(b.client);
      case 'status': return dir * ((statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
      case 'priority': return dir * ((priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
      case 'category': return dir * a.category.localeCompare(b.category);
      case 'progress': return dir * (getProgress(a) - getProgress(b));
      case 'timeline': return dir * (new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      default: return 0;
    }
  });

  const categories = PROJECT_CATEGORIES;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {allProjects.length} projects</p>
        </div>
        {isManagerOrAbove && (
          <Button onClick={() => navigate('/projects/new')} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects or clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {PROJECT_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  <span className="flex items-center">Project<SortIcon column="name" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('client')}>
                  <span className="flex items-center">Client<SortIcon column="client" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
                  <span className="flex items-center">Status<SortIcon column="status" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('priority')}>
                  <span className="flex items-center">Priority<SortIcon column="priority" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('category')}>
                  <span className="flex items-center">Category<SortIcon column="category" /></span>
                </TableHead>
                <TableHead>Team</TableHead>
                {isManagerOrAbove && <TableHead className="w-[100px]">Actions</TableHead>}
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('progress')}>
                  <span className="flex items-center">Progress<SortIcon column="progress" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('timeline')}>
                  <span className="flex items-center justify-end">Timeline<SortIcon column="timeline" /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(project => {
                const projectAllocations = data.allocations.filter(a => a.projectId === project.id);
                const assignedUsers = projectAllocations.map(a => data.users.find(u => u.id === a.userId)).filter(Boolean);
                const projectTasks = data.tasks.filter(t => t.projectId === project.id);
                const doneTasks = projectTasks.filter(t => t.status === 'Done').length;
                const progress = projectTasks.length > 0 ? (doneTasks / projectTasks.length) * 100 : 0;

                return (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="text-muted-foreground">{project.client}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(project.status)}>{project.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityColor(project.priority)}>{project.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{project.category}{project.category === 'Other' && project.categoryOtherSpec ? ` (${project.categoryOtherSpec})` : ''}</TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {assignedUsers.slice(0, 3).map(user => user && (
                          <div
                            key={user.id}
                            className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-card"
                            style={{ backgroundColor: user.avatarColor, color: 'white' }}
                            title={user.name}
                          >
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        ))}
                        {assignedUsers.length > 3 && (
                          <span className="text-xs text-muted-foreground ml-1.5 self-center">+{assignedUsers.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    {isManagerOrAbove && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Edit team"
                            onClick={() => setEditTeamProjectId(project.id)}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setProjectToDelete(project)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{progress.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      {' – '}
                      {new Date(project.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isManagerOrAbove ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    No projects match your filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editTeamProjectId && (
        <ProjectTeamEditor
          projectId={editTeamProjectId}
          open={!!editTeamProjectId}
          onOpenChange={open => !open && setEditTeamProjectId(null)}
          onUpdated={() => setRefreshKey(k => k + 1)}
          initialData={data}
          onNavigateToProject={(projectId) => {
            setEditTeamProjectId(null);
            navigate(`/projects/${projectId}`);
          }}
        />
      )}

      <AlertDialog open={!!projectToDelete} onOpenChange={open => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{projectToDelete?.name}&quot;? This will remove the project, its phases, tasks, allocations, and related data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (projectToDelete) {
                  await deleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                  setRefreshKey(k => k + 1);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
