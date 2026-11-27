-- 0102: DocuSign usage. One row per envelope the portal sends through the DocuSign API (the plan
-- allows 100 a license year; the year renews Oct 28). Shown on the Today page with warnings at 80 and 95.
-- Envelopes already sent by the portal since this license year started (Oct 28, 2026) are counted too.
-- Run AFTER 0101. Safe to re-run.

create table if not exists public.docusign_sends (
  envelope_id text primary key,
  sent_at timestamptz not null default now(),
  source text not null default 'api',
  signature_request_id uuid references public.signature_requests(id) on delete set null,
  kind text,
  title text
);
create index if not exists docusign_sends_sent_at on public.docusign_sends (sent_at);
alter table public.docusign_sends enable row level security;
drop policy if exists "docusign_sends: staff read" on public.docusign_sends;
create policy "docusign_sends: staff read" on public.docusign_sends for select using (public.is_staff());
revoke all on public.docusign_sends from anon;

-- This license year so far (every portal envelope is created through the API).
insert into public.docusign_sends (envelope_id, sent_at, source, signature_request_id, kind, title)
select envelope_id, sent_at, 'backfill', id, kind, title
from public.signature_requests
where envelope_id is not null and sent_at is not null and sent_at >= '2026-10-28'
on conflict (envelope_id) do nothing;

-- Which warnings have gone out this license year (80 and 95), so each is sent once.
create table if not exists public.docusign_usage_alerts (
  license_year date not null,
  threshold int not null,
  sent_at timestamptz not null default now(),
  primary key (license_year, threshold)
);
alter table public.docusign_usage_alerts enable row level security;
revoke all on public.docusign_usage_alerts from anon;
