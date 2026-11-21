-- 0078: maintenance requests from emails to administration@ (the mailbox script sends them in).
-- A known tenant's maintenance email becomes one request per issue on their unit (photos attached,
-- original email kept, duplicates linked instead). Anything uncertain waits in "Review email intake".
-- Also: helper_uploads, files the staff helper attached through the helper API.
-- Run AFTER 0077. Safe to re-run.

alter table public.inbound_emails add column if not exists body text;
alter table public.inbound_emails add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.inbound_emails add column if not exists intake_status text not null default 'none';
alter table public.inbound_emails drop constraint if exists inbound_emails_intake_status_check;
alter table public.inbound_emails add constraint inbound_emails_intake_status_check
  check (intake_status in ('none', 'waiting_files', 'auto', 'review', 'approved', 'dismissed'));
alter table public.inbound_emails add column if not exists intake jsonb not null default '{}'::jsonb;
alter table public.inbound_emails add column if not exists tenancy_id uuid references public.tenancies (id) on delete set null;
alter table public.inbound_emails add column if not exists unit_id uuid references public.units (id) on delete set null;
alter table public.inbound_emails add column if not exists maintenance_request_ids uuid[] not null default '{}';
create index if not exists inbound_emails_review_idx on public.inbound_emails (received_at desc) where intake_status = 'review';

alter table public.maintenance_requests add column if not exists inbound_email_id uuid references public.inbound_emails (id) on delete set null;

create table if not exists public.helper_uploads (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  target text not null,
  target_id uuid not null,
  file_name text not null,
  path text not null,
  bytes integer,
  note text
);
alter table public.helper_uploads enable row level security;
drop policy if exists "helper_uploads: staff read" on public.helper_uploads;
create policy "helper_uploads: staff read" on public.helper_uploads for select using (public.is_staff());
revoke all on public.helper_uploads from anon;
