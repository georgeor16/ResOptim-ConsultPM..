-- Replace duplicate anon + authenticated policies with one policy per table (role: public).
-- Run in Supabase SQL Editor. This removes duplication and keeps RLS enabled.

-- Drop existing policies (from 002 and 003)
drop policy if exists "Allow all for anon" on public.users;
drop policy if exists "Allow all for authenticated" on public.users;
drop policy if exists "Allow all for anon" on public.projects;
drop policy if exists "Allow all for authenticated" on public.projects;
drop policy if exists "Allow all for anon" on public.allocations;
drop policy if exists "Allow all for authenticated" on public.allocations;
drop policy if exists "Allow all for anon" on public.phases;
drop policy if exists "Allow all for authenticated" on public.phases;
drop policy if exists "Allow all for anon" on public.tasks;
drop policy if exists "Allow all for authenticated" on public.tasks;
drop policy if exists "Allow all for anon" on public.subtasks;
drop policy if exists "Allow all for authenticated" on public.subtasks;
drop policy if exists "Allow all for anon" on public.timelogs;
drop policy if exists "Allow all for authenticated" on public.timelogs;
drop policy if exists "Allow all for anon" on public.alerts;
drop policy if exists "Allow all for authenticated" on public.alerts;

-- One policy per table for role public (covers anon and authenticated)
create policy "Allow all"
  on public.users for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.projects for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.allocations for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.phases for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.tasks for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.subtasks for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.timelogs for all to public
  using (true) with check (true);

create policy "Allow all"
  on public.alerts for all to public
  using (true) with check (true);
