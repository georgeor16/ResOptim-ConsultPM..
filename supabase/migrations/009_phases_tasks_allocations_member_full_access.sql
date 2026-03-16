-- Migration 009: Give members full access to phases, tasks, subtasks, allocations
-- Corrects migration 007 which restricted members to SELECT-only on these tables.

-- phases
drop policy if exists "phases: member select all" on public.phases;
create policy "phases: member full access"
  on public.phases for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- tasks
drop policy if exists "tasks: member select all" on public.tasks;
create policy "tasks: member full access"
  on public.tasks for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- subtasks
drop policy if exists "subtasks: member select all" on public.subtasks;
create policy "subtasks: member full access"
  on public.subtasks for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- allocations
drop policy if exists "allocations: member select all" on public.allocations;
create policy "allocations: member full access"
  on public.allocations for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');
