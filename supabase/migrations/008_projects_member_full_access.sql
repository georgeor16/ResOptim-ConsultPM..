-- Migration 008: Give members full access to projects
-- Corrects migration 007 which restricted members to SELECT-only on projects.
-- Members should be able to create, edit, and delete projects.

-- Drop the restrictive member SELECT-only policy
drop policy if exists "projects: member select all" on public.projects;

-- Replace with full access for members
create policy "projects: member full access"
  on public.projects for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');
