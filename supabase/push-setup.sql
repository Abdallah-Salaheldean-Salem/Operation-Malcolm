-- Phase 3 (Web Push) setup for this app's Supabase project.
-- Paste into Supabase Dashboard → SQL Editor → Run. Safe to re-run.
-- Requires the `push` edge function (supabase/functions/push) deployed with
-- "Verify JWT" turned off.

-- Both tables are only reachable by the edge function (RLS on, no policies =>
-- the public anon/publishable key cannot read or write them).
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  recipient text not null,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  last_digest_date text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_recipient_idx on public.push_subscriptions (recipient);
alter table public.push_subscriptions enable row level security;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_config enable row level security;

alter table public.notifications add column if not exists pushed_at timestamptz;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Push every new notification row the moment it is inserted.
create or replace function public.push_new_notification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://uyscrptjglpmuscsaqfp.supabase.co/functions/v1/push',
      body := jsonb_build_object('action', 'event', 'id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null; -- never block saving a notification
  end;
  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_new_notification();

-- Hourly tick; each device gets its morning digest once a day at 08:00 local time.
select cron.unschedule(jobid) from cron.job where jobname = 'push-daily-digest';
select cron.schedule(
  'push-daily-digest',
  '0 * * * *',
  $$select net.http_post(
      url := 'https://uyscrptjglpmuscsaqfp.supabase.co/functions/v1/push',
      body := '{"action": "daily"}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )$$
);
