-- Add fee type and category other spec to projects (optional columns for backward compatibility)
alter table public.projects
  add column if not exists fee_type text default 'monthly',
  add column if not exists category_other_spec text;
