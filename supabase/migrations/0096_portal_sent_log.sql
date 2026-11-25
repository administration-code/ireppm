-- 0096: a log of every email the portal sends, and a "Portal" tag on the Communications timeline.
--   portal_sent: one row per email the portal sends (or tries to send): recipients, subject, sent or failed.
--   inbound_emails.via_portal: the Gmail copy of an email the portal sent (matched by subject and recipient).
-- Run AFTER 0095. Safe to re-run.

create table if not exists public.portal_sent (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_count integer not null default 0,
  subject text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  provider text,
  inbound_email_id uuid references public.inbound_emails(id) on delete set null
);
create index if not exists portal_sent_sent_at on public.portal_sent (sent_at desc);
alter table public.portal_sent enable row level security;
drop policy if exists "portal_sent: staff read" on public.portal_sent;
create policy "portal_sent: staff read" on public.portal_sent for select using (public.is_staff());
revoke all on public.portal_sent from anon;

alter table public.inbound_emails add column if not exists via_portal boolean not null default false;
create index if not exists inbound_emails_out_received on public.inbound_emails (received_at desc) where direction = 'out';

-- Template emails the portal already put on the timeline count as portal emails.
update public.inbound_emails set via_portal = true where direction = 'out' and draft_id is not null and via_portal = false;
