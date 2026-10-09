-- Schema for the shared workspace backend.
-- Already applied to the shared Supabase project as migrations
-- (create_projects_table, fix_set_updated_at_search_path, create_app_state_table,
-- create_notifications).
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
  favorite boolean not null default false,
  "parentId" text,
  modules jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
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

-- Shared notifications (Phase 2): change events addressed to a member by name.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,          -- lower-cased, trimmed member name
  project_id text not null,
  task_id text,
  task_title text not null default '',
  kind text not null,               -- assigned | completed | comment | due-changed
  message text not null,
  actor text,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient, created_at desc);

-- Read state for date reminders (due soon / overdue / ...), so it syncs across devices.
create table if not exists public.notification_reads (
  recipient text not null,
  alert_key text not null,
  read_at timestamptz not null default now(),
  primary key (recipient, alert_key)
);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
create policy "Public full access" on public.notifications
  for all to anon using (true) with check (true);
create policy "Public full access" on public.notification_reads
  for all to anon using (true) with check (true);

-- Live delivery to open apps.
alter publication supabase_realtime add table public.notifications;

-- Phase 3 (Web Push): see supabase/push-setup.sql (project-specific URLs)
-- and the `push` edge function in supabase/functions/push.
