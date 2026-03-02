-- Enable RLS and add permissive policies so the app (anon key) can read/write.
-- Run this in Supabase SQL Editor after 001_initial_schema.sql.
-- You can tighten policies later when you add Supabase Auth.

-- users
alter table public.users enable row level security;
create policy "Allow all for anon"
  on public.users for all to anon
  using (true) with check (true);

-- projects
alter table public.projects enable row level security;
create policy "Allow all for anon"
  on public.projects for all to anon
  using (true) with check (true);

-- allocations
alter table public.allocations enable row level security;
create policy "Allow all for anon"
  on public.allocations for all to anon
  using (true) with check (true);

-- phases
alter table public.phases enable row level security;
create policy "Allow all for anon"
  on public.phases for all to anon
  using (true) with check (true);

-- tasks
alter table public.tasks enable row level security;
create policy "Allow all for anon"
  on public.tasks for all to anon
  using (true) with check (true);

-- subtasks
alter table public.subtasks enable row level security;
create policy "Allow all for anon"
  on public.subtasks for all to anon
  using (true) with check (true);

-- timelogs
alter table public.timelogs enable row level security;
create policy "Allow all for anon"
  on public.timelogs for all to anon
  using (true) with check (true);

-- alerts
alter table public.alerts enable row level security;
create policy "Allow all for anon"
  on public.alerts for all to anon
  using (true) with check (true);
