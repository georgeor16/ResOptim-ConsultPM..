-- Migration 014: Dedicated calendar_profiles table
-- Replaces the ad-hoc JSON blob stored in users.calendar with a proper normalized table.
-- Backward compat: existing users.calendar data is migrated in the app layer on first read.

create table if not exists public.calendar_profiles (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  timezone             text not null default 'UTC',
  working_days         jsonb not null default '[1,2,3,4,5]',
  daily_working_hours  numeric not null default 8,
  weekly_working_hours numeric,
  blackout_dates       jsonb not null default '[]',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint calendar_profiles_user_id_unique unique (user_id)
);

alter table public.calendar_profiles enable row level security;

-- Admin / manager: full access
create policy "calendar_profiles: admin full access"
  on public.calendar_profiles for all
  to authenticated
  using (get_my_role() in ('admin', 'manager'))
  with check (get_my_role() in ('admin', 'manager'));

-- Member: full access (mirrors migration 012 pattern — all roles are equal)
create policy "calendar_profiles: member full access"
  on public.calendar_profiles for all
  to authenticated
  using (get_my_role() = 'member')
  with check (get_my_role() = 'member');

-- Auto-update updated_at on row change
create or replace function update_calendar_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_calendar_profiles_updated_at
  before update on public.calendar_profiles
  for each row execute procedure update_calendar_profiles_updated_at();
