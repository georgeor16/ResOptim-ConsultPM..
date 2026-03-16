-- Migration 007: Role-based RLS policies
-- Replaces the permissive "Allow all" policies from 005 with granular
-- admin/manager (full access) vs. member (read-all, write-own) rules.
--
-- Run in Supabase SQL Editor after 006.
-- Covers the 8 tables that exist in migrations 001–006.
-- calendar_profiles, simulations, simulation_templates, scheduling_config
-- will get RLS policies in a later migration when their tables are created.

-- ─── Helper function ──────────────────────────────────────────────────────────
-- Returns the role of the currently authenticated user from public.users.
-- security definer so it can read the users table regardless of caller's RLS.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

-- ─── Drop existing permissive policies (from migration 005) ──────────────────

drop policy if exists "Allow all" on public.users;
drop policy if exists "Allow all" on public.projects;
drop policy if exists "Allow all" on public.allocations;
drop policy if exists "Allow all" on public.phases;
drop policy if exists "Allow all" on public.tasks;
drop policy if exists "Allow all" on public.subtasks;
drop policy if exists "Allow all" on public.timelogs;
drop policy if exists "Allow all" on public.alerts;

-- ─── users ───────────────────────────────────────────────────────────────────

-- Admin / manager: full access
create policy "users: admin full access"
  on public.users for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

-- Member: select own row only
create policy "users: member select own"
  on public.users for select
  to authenticated
  using (get_my_role() = 'member' and id = auth.uid());

-- Member: update own row only
create policy "users: member update own"
  on public.users for update
  to authenticated
  using (get_my_role() = 'member' and id = auth.uid())
  with check (get_my_role() = 'member' and id = auth.uid());

-- ─── projects ────────────────────────────────────────────────────────────────

create policy "projects: admin full access"
  on public.projects for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "projects: member select all"
  on public.projects for select
  to authenticated
  using (get_my_role() = 'member');

-- ─── allocations ─────────────────────────────────────────────────────────────

create policy "allocations: admin full access"
  on public.allocations for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "allocations: member select all"
  on public.allocations for select
  to authenticated
  using (get_my_role() = 'member');

-- ─── phases ──────────────────────────────────────────────────────────────────

create policy "phases: admin full access"
  on public.phases for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "phases: member select all"
  on public.phases for select
  to authenticated
  using (get_my_role() = 'member');

-- ─── tasks ───────────────────────────────────────────────────────────────────

create policy "tasks: admin full access"
  on public.tasks for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "tasks: member select all"
  on public.tasks for select
  to authenticated
  using (get_my_role() = 'member');

-- ─── subtasks ────────────────────────────────────────────────────────────────

create policy "subtasks: admin full access"
  on public.subtasks for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "subtasks: member select all"
  on public.subtasks for select
  to authenticated
  using (get_my_role() = 'member');

-- ─── timelogs ────────────────────────────────────────────────────────────────

create policy "timelogs: admin full access"
  on public.timelogs for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

create policy "timelogs: member select all"
  on public.timelogs for select
  to authenticated
  using (get_my_role() = 'member');

-- Member: write own timelogs only (user_id = auth.uid())
create policy "timelogs: member write own"
  on public.timelogs for insert
  to authenticated
  with check (get_my_role() = 'member' and user_id = auth.uid());

create policy "timelogs: member update own"
  on public.timelogs for update
  to authenticated
  using (get_my_role() = 'member' and user_id = auth.uid())
  with check (get_my_role() = 'member' and user_id = auth.uid());

create policy "timelogs: member delete own"
  on public.timelogs for delete
  to authenticated
  using (get_my_role() = 'member' and user_id = auth.uid());

-- ─── alerts ──────────────────────────────────────────────────────────────────

create policy "alerts: admin full access"
  on public.alerts for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

-- Member: see own alerts + org-wide alerts (user_id IS NULL)
create policy "alerts: member select own and org"
  on public.alerts for select
  to authenticated
  using (
    get_my_role() = 'member'
    and (user_id = auth.uid() or user_id is null)
  );
