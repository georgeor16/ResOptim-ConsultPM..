-- Add RLS policies for the authenticated role (for when you use Supabase Auth).
-- Run in Supabase SQL Editor to clear "authenticated role" warnings.
-- RLS is already enabled from 002; this only adds policies.

create policy "Allow all for authenticated"
  on public.users for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.projects for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.allocations for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.phases for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.tasks for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.subtasks for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.timelogs for all to authenticated
  using (true) with check (true);

create policy "Allow all for authenticated"
  on public.alerts for all to authenticated
  using (true) with check (true);
