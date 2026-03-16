-- Migration 012: Member full access on users, timelogs, alerts
--
-- Removes the last remaining member write restrictions.
-- After this migration, member === admin/manager in data access terms.
--
-- Run in Supabase SQL Editor.

-- ─── users ───────────────────────────────────────────────────────────────────
drop policy if exists "users: member select own" on public.users;
drop policy if exists "users: member update own" on public.users;

create policy "users: member full access"
  on public.users for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- ─── timelogs ────────────────────────────────────────────────────────────────
drop policy if exists "timelogs: member select all" on public.timelogs;
drop policy if exists "timelogs: member write own" on public.timelogs;
drop policy if exists "timelogs: member update own" on public.timelogs;
drop policy if exists "timelogs: member delete all" on public.timelogs;

create policy "timelogs: member full access"
  on public.timelogs for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- ─── alerts ──────────────────────────────────────────────────────────────────
drop policy if exists "alerts: member select own and org" on public.alerts;
drop policy if exists "alerts: member delete all" on public.alerts;

create policy "alerts: member full access"
  on public.alerts for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');
