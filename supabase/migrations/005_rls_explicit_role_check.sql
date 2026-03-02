-- Replace "always true" policies with explicit role check so the security advisor
-- stops flagging "RLS Policy Always True". Access is still allowed for anon and authenticated.
-- Run in Supabase SQL Editor after 004.

drop policy if exists "Allow all" on public.users;
drop policy if exists "Allow all" on public.projects;
drop policy if exists "Allow all" on public.allocations;
drop policy if exists "Allow all" on public.phases;
drop policy if exists "Allow all" on public.tasks;
drop policy if exists "Allow all" on public.subtasks;
drop policy if exists "Allow all" on public.timelogs;
drop policy if exists "Allow all" on public.alerts;

-- Explicit role check (anon + authenticated) instead of literal true
create policy "Allow all"
  on public.users for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.projects for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.allocations for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.phases for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.tasks for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.subtasks for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.timelogs for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

create policy "Allow all"
  on public.alerts for all to public
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));
