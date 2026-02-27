// All data models structured for 1:1 migration to Supabase tables

export type Role = 'admin' | 'manager' | 'member';

export type ProjectCategory = 'Strategy' | 'Research' | 'Innovation Ecosystem' | 'Quantum/Deep Tech' | 'Scaleup Support' | 'Other';
export type ProjectStatus = 'Active' | 'On Hold' | 'Completed';
export type Priority = 'High' | 'Medium' | 'Low';
export type TaskStatus = 'To Do' | 'In Progress' | 'Blocked' | 'Done';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  monthlySalary: number;
  billableHourlyRate: number;
  avatarColor: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  category: ProjectCategory;
  priority: Priority;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  monthlyFee: number;
  createdAt: string;
}

export interface Allocation {
  id: string;
  projectId: string;
  userId: string;
  ftePercent: number; // 0-100
  agreedMonthlyHours: number;
  billableHourlyRate: number;
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  order: number;
}

export interface Task {
  id: string;
  projectId: string;
  phaseId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  status: TaskStatus;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
  order: number;
}

export interface SubTask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  status: TaskStatus;
  estimatedHours: number;
  startDate: string;
  dueDate: string;
}

export interface TimeLog {
  id: string;
  taskId: string;
  userId: string;
  projectId: string;
  hours: number;
  date: string;
  note: string;
}

export interface Alert {
  id: string;
  type: 'overallocation' | 'behind_schedule' | 'overage';
  projectId?: string;
  userId?: string;
  message: string;
  createdAt: string;
}

export interface AppData {
  users: User[];
  projects: Project[];
  allocations: Allocation[];
  phases: Phase[];
  tasks: Task[];
  subtasks: SubTask[];
  timelogs: TimeLog[];
  alerts: Alert[];
}
