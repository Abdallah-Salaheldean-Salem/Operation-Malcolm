-- Schema for the shared workspace backend.
-- Already applied to the shared Supabase project as migrations
-- (create_projects_table, fix_set_updated_at_search_path, create_app_state_table).
-- Run this in the Supabase SQL Editor only when setting up a NEW project.

create table if not exists public.projects (
  id text primary key,
  name text not null,
  description text not null default '',
  columns jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  ideas jsonb not null default '[]'::jsonb,
  teams jsonb not null default '[]'::jsonb,
  members jsonb not null default '[]'::jsonb,
  color text,
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared key/value state (e.g. the Daily Logs feed under key 'daily_logs').
create table if not exists public.app_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_app_state_updated_at on public.app_state;
create trigger set_app_state_updated_at
  before update on public.app_state
  for each row
  execute function public.set_updated_at();

-- RLS: the app ships without auth, so the anon key gets full access.
-- Anyone with the (public) anon key can read and write all workspace data —
-- add Supabase Auth and per-user policies before storing sensitive data.
alter table public.projects enable row level security;
alter table public.app_state enable row level security;

create policy "Public full access" on public.projects
  for all to anon using (true) with check (true);

create policy "Public full access" on public.app_state
  for all to anon using (true) with check (true);
