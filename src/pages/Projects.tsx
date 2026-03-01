import { useAuth } from '@/contexts/AuthContext';
import { loadData } from '@/lib/store';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useState } from 'react';

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
  const data = useMemo(() => loadData(), []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

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

  const categories = [...new Set(data.projects.map(p => p.category))];

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
            {categories.map(c => (
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
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Timeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(project => {
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
                    <TableCell className="text-muted-foreground text-sm">{project.category}</TableCell>
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
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No projects match your filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
