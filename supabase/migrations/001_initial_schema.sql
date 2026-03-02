-- ResOptim initial schema (run in Supabase SQL Editor)
-- Tables match src/lib/types.ts with snake_case columns

-- Enable UUID extension if not already
create extension if not exists "uuid-ossp";

-- users
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  role text not null check (role in ('admin', 'manager', 'member')),
  email text not null,
  monthly_salary numeric not null default 0,
  billable_hourly_rate numeric not null default 0,
  avatar_color text not null default '',
  currency text not null default 'USD'
);

-- projects
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  client text not null,
  category text not null,
  priority text not null check (priority in ('High', 'Medium', 'Low')),
  status text not null check (status in ('Active', 'On Hold', 'Completed')),
  start_date date not null,
  end_date date not null,
  monthly_fee numeric not null default 0,
  currency text not null default 'USD',
  created_at date not null
);

-- allocations (project-user link)
create table if not exists public.allocations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  fte_percent numeric not null default 0,
  agreed_monthly_hours numeric not null default 0,
  billable_hourly_rate numeric not null default 0
);

-- phases
create table if not exists public.phases (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  "order" integer not null default 0,
  planned_duration_weeks numeric,
  planned_effort_hours numeric,
  planned_fte_percent numeric
);

-- tasks
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_id uuid not null references public.phases(id) on delete cascade,
  title text not null,
  description text default '',
  assignee_ids jsonb not null default '[]',
  status text not null check (status in ('To Do', 'In Progress', 'Blocked', 'Done')),
  estimated_hours numeric not null default 0,
  start_date date not null,
  due_date date not null,
  "order" integer not null default 0
);

-- subtasks
create table if not exists public.subtasks (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  description text default '',
  assignee_ids jsonb not null default '[]',
  status text not null check (status in ('To Do', 'In Progress', 'Blocked', 'Done')),
  estimated_hours numeric not null default 0,
  start_date date not null,
  due_date date not null
);

-- timelogs
create table if not exists public.timelogs (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  hours numeric not null default 0,
  date date not null,
  note text default ''
);

-- alerts
create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('overallocation', 'behind_schedule', 'overage')),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- Optional: enable RLS (Row Level Security) later when you add Supabase Auth
-- alter table public.users enable row level security;
-- alter table public.projects enable row level security;
-- etc.
