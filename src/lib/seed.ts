import type { AppData } from './types';
import { genId } from './store';

export function createSeedData(): AppData {
  const users = [
    { id: genId(), name: 'Marie Laurent', role: 'admin' as const, email: 'marie@consulting.com', monthlySalary: 12000, billableHourlyRate: 350, avatarColor: 'hsl(170, 60%, 40%)', currency: 'USD' },
    { id: genId(), name: 'Thomas Berger', role: 'manager' as const, email: 'thomas@consulting.com', monthlySalary: 9000, billableHourlyRate: 280, avatarColor: 'hsl(222, 47%, 30%)', currency: 'USD' },
    { id: genId(), name: 'Sophie Dupont', role: 'manager' as const, email: 'sophie@consulting.com', monthlySalary: 8500, billableHourlyRate: 260, avatarColor: 'hsl(270, 50%, 45%)', currency: 'USD' },
    { id: genId(), name: 'Lucas Martin', role: 'member' as const, email: 'lucas@consulting.com', monthlySalary: 6000, billableHourlyRate: 200, avatarColor: 'hsl(38, 70%, 50%)', currency: 'AUD' },
    { id: genId(), name: 'Emma Petit', role: 'member' as const, email: 'emma@consulting.com', monthlySalary: 5000, billableHourlyRate: 180, avatarColor: 'hsl(340, 60%, 50%)', currency: 'EUR' },
    { id: genId(), name: 'Hugo Moreau', role: 'member' as const, email: 'hugo@consulting.com', monthlySalary: 4500, billableHourlyRate: 160, avatarColor: 'hsl(200, 60%, 45%)', currency: 'KRW' },
  ];

  // Create sample projects
  const project1Id = genId();
  const project2Id = genId();
  const project3Id = genId();

  const projects = [
    { id: project1Id, name: 'Quantum Computing Strategy', client: 'TechCorp Europe', category: 'Quantum/Deep Tech' as const, priority: 'High' as const, status: 'Active' as const, startDate: '2026-01-15', endDate: '2026-06-30', monthlyFee: 45000, currency: 'USD', createdAt: '2026-01-10' },
    { id: project2Id, name: 'Innovation Ecosystem Mapping', client: 'GovTech Agency', category: 'Innovation Ecosystem' as const, priority: 'Medium' as const, status: 'Active' as const, startDate: '2026-02-01', endDate: '2026-05-31', monthlyFee: 30000, currency: 'USD', createdAt: '2026-01-25' },
    { id: project3Id, name: 'Scaleup Growth Accelerator', client: 'VentureHub', category: 'Scaleup Support' as const, priority: 'Low' as const, status: 'On Hold' as const, startDate: '2026-03-01', endDate: '2026-08-31', monthlyFee: 25000, currency: 'AUD', createdAt: '2026-02-15' },
  ];

  const allocations = [
    { id: genId(), projectId: project1Id, userId: users[0].id, ftePercent: 20, agreedMonthlyHours: 32, billableHourlyRate: users[0].billableHourlyRate },
    { id: genId(), projectId: project1Id, userId: users[1].id, ftePercent: 40, agreedMonthlyHours: 64, billableHourlyRate: users[1].billableHourlyRate },
    { id: genId(), projectId: project1Id, userId: users[4].id, ftePercent: 60, agreedMonthlyHours: 96, billableHourlyRate: users[4].billableHourlyRate },
    { id: genId(), projectId: project2Id, userId: users[2].id, ftePercent: 50, agreedMonthlyHours: 80, billableHourlyRate: users[2].billableHourlyRate },
    { id: genId(), projectId: project2Id, userId: users[3].id, ftePercent: 80, agreedMonthlyHours: 128, billableHourlyRate: users[3].billableHourlyRate },
    { id: genId(), projectId: project2Id, userId: users[5].id, ftePercent: 40, agreedMonthlyHours: 64, billableHourlyRate: users[5].billableHourlyRate },
    { id: genId(), projectId: project3Id, userId: users[1].id, ftePercent: 20, agreedMonthlyHours: 32, billableHourlyRate: users[1].billableHourlyRate },
    { id: genId(), projectId: project3Id, userId: users[3].id, ftePercent: 30, agreedMonthlyHours: 48, billableHourlyRate: users[3].billableHourlyRate },
  ];

  // Phases for project 1
  const p1Phase1 = genId(), p1Phase2 = genId(), p1Phase3 = genId();
  const p2Phase1 = genId(), p2Phase2 = genId();

  const phases = [
    { id: p1Phase1, projectId: project1Id, name: 'Discovery', order: 0 },
    { id: p1Phase2, projectId: project1Id, name: 'Analysis & Delivery', order: 1 },
    { id: p1Phase3, projectId: project1Id, name: 'Final Review', order: 2 },
    { id: p2Phase1, projectId: project2Id, name: 'Research', order: 0 },
    { id: p2Phase2, projectId: project2Id, name: 'Mapping & Report', order: 1 },
  ];

  const tasks = [
    { id: genId(), projectId: project1Id, phaseId: p1Phase1, title: 'Stakeholder interviews', description: 'Interview 8 key stakeholders', assigneeId: users[1].id, status: 'Done' as const, estimatedHours: 16, startDate: '2026-01-15', dueDate: '2026-02-01', order: 0 },
    { id: genId(), projectId: project1Id, phaseId: p1Phase1, title: 'Technology landscape review', description: 'Map current quantum computing landscape', assigneeId: users[4].id, status: 'In Progress' as const, estimatedHours: 24, startDate: '2026-01-20', dueDate: '2026-02-15', order: 1 },
    { id: genId(), projectId: project1Id, phaseId: p1Phase2, title: 'Gap analysis report', description: 'Identify capability gaps', assigneeId: users[4].id, status: 'To Do' as const, estimatedHours: 32, startDate: '2026-02-15', dueDate: '2026-03-15', order: 0 },
    { id: genId(), projectId: project1Id, phaseId: p1Phase2, title: 'Strategic recommendations', description: 'Draft strategic roadmap', assigneeId: users[0].id, status: 'To Do' as const, estimatedHours: 20, startDate: '2026-03-15', dueDate: '2026-04-15', order: 1 },
    { id: genId(), projectId: project1Id, phaseId: p1Phase3, title: 'Final presentation', description: 'Prepare and deliver final presentation', assigneeId: users[1].id, status: 'To Do' as const, estimatedHours: 12, startDate: '2026-05-01', dueDate: '2026-06-15', order: 0 },
    { id: genId(), projectId: project2Id, phaseId: p2Phase1, title: 'Ecosystem actor identification', description: 'Identify all ecosystem actors', assigneeId: users[3].id, status: 'In Progress' as const, estimatedHours: 40, startDate: '2026-02-01', dueDate: '2026-03-01', order: 0 },
    { id: genId(), projectId: project2Id, phaseId: p2Phase1, title: 'Data collection', description: 'Collect quantitative data', assigneeId: users[5].id, status: 'To Do' as const, estimatedHours: 30, startDate: '2026-02-15', dueDate: '2026-03-15', order: 1 },
    { id: genId(), projectId: project2Id, phaseId: p2Phase2, title: 'Network visualization', description: 'Build interactive network map', assigneeId: users[2].id, status: 'To Do' as const, estimatedHours: 24, startDate: '2026-03-15', dueDate: '2026-04-30', order: 0 },
  ];

  // Sample time logs
  const timelogs = [
    { id: genId(), taskId: tasks[0].id, userId: users[1].id, projectId: project1Id, hours: 14, date: '2026-01-30', note: 'Completed 7 interviews' },
    { id: genId(), taskId: tasks[1].id, userId: users[4].id, projectId: project1Id, hours: 18, date: '2026-02-10', note: 'Literature review ongoing' },
    { id: genId(), taskId: tasks[5].id, userId: users[3].id, projectId: project2Id, hours: 22, date: '2026-02-20', note: 'Identified 45 actors so far' },
  ];

  return { users, projects, allocations, phases, tasks, subtasks: [], timelogs, alerts: [] };
}
