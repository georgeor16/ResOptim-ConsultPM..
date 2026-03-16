-- Migration 011: Link public.users to Supabase Auth
--
-- Adds auth_id column so get_my_role() can resolve the authenticated
-- user's role from their Supabase Auth UID instead of the app-managed id.
-- Keeps existing public.users PKs intact — no re-keying required.
--
-- After applying:
--   1. Create Supabase Auth accounts for each user (Dashboard → Authentication)
--   2. Run the link SQL below, substituting each Auth UID:
--        update public.users set auth_id = '<auth-uid>' where email = '<email>';

alter table public.users
  add column if not exists auth_id uuid references auth.users(id);

create unique index if not exists users_auth_id_unique on public.users(auth_id)
  where auth_id is not null;

-- Update get_my_role() to resolve role via auth_id instead of id
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where auth_id = auth.uid()
$$;
