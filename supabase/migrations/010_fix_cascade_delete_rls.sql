-- Migration 010: Fix cascade delete RLS blocking project/phase/task deletion
--
-- Bug: deleting a project silently fails when it has timelogs from other users
-- or alerts, because:
--   - timelogs member delete policy only allows deleting own rows
--   - alerts has no member delete policy at all
-- PostgreSQL checks RLS on cascade-deleted rows, so the whole delete is blocked.
--
-- Fix: allow members to delete any timelog or alert (they already have full
-- access to projects/phases/tasks, so cascade cleanup must be unrestricted).

-- timelogs: replace scoped delete with full delete access for members
drop policy if exists "timelogs: member delete own" on public.timelogs;

create policy "timelogs: member delete all"
  on public.timelogs for delete
  to authenticated
  using (get_my_role() = 'member');

-- alerts: add member delete policy (previously had none, blocking cascade)
create policy "alerts: member delete all"
  on public.alerts for delete
  to authenticated
  using (get_my_role() = 'member');
