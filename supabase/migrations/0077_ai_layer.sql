-- 0077: a small AI layer (Project 5). Server-side only; staff only.
--   ai_settings: one row: on/off, monthly spend cap, price per million tokens (to estimate cost).
--   ai_usage: every model call (tokens, estimated $). ai_actions: every tool the assistant used.
--   ai_cache: reused answers (e.g. the day's Today summary) so the same work isn't paid for twice.
--   inbound_emails: administration@ emails sent in by the mailbox script, with the category and a short summary.
-- Run AFTER 0076. Safe to re-run.

create table if not exists public.ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  monthly_cap_usd numeric(8, 2) not null default 20,
  haiku_in numeric(8, 4) not null default 1,
  haiku_out numeric(8, 4) not null default 5,
  sonnet_in numeric(8, 4) not null default 3,
  sonnet_out numeric(8, 4) not null default 15,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (true) on conflict do nothing;

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  ok boolean not null default true,
  error text
);
create index if not exists ai_usage_at_idx on public.ai_usage (at desc);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid,
  tool text not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  conversation text
);
create index if not exists ai_actions_at_idx on public.ai_actions (at desc);

create table if not exists public.ai_cache (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  from_name text,
  from_email text,
  subject text,
  snippet text,
  received_at timestamptz not null default now(),
  category text check (category is null or category in ('rent', 'tenant_issue', 'landlord', 'maintenance', 'payprop', 'other')),
  summary text,
  classified_at timestamptz,
  status text not null default 'new' check (status in ('new', 'handled', 'ignored')),
  created_at timestamptz not null default now()
);
create index if not exists inbound_emails_recent_idx on public.inbound_emails (received_at desc);

do $rls$
declare
  t text;
begin
  foreach t in array array['ai_settings', 'ai_usage', 'ai_actions', 'ai_cache', 'inbound_emails'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: staff read" on public.%I', t, t);
    execute format('create policy "%s: staff read" on public.%I for select using (public.is_staff())', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$rls$;
-- Staff change the settings and mark emails handled; everything else is written by the server.
drop policy if exists "ai_settings: staff update" on public.ai_settings;
create policy "ai_settings: staff update" on public.ai_settings for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "inbound_emails: staff update" on public.inbound_emails;
create policy "inbound_emails: staff update" on public.inbound_emails for update using (public.is_staff()) with check (public.is_staff());
