-- Migration: 013_google_oauth_tokens
-- Stores per-user Google OAuth tokens for Slides/Docs export integration.

create table if not exists user_google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_google_tokens enable row level security;

create policy "users can manage own google tokens"
  on user_google_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at on row change
create or replace function update_google_tokens_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_google_tokens_updated_at
  before update on user_google_tokens
  for each row execute procedure update_google_tokens_updated_at();
