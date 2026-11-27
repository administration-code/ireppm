-- 0102: DocuSign usage. One row per envelope the portal sends through the DocuSign API (the plan
-- allows 100 a license year; the year renews Oct 28). Shown on the Today page with warnings at 80 and 95.
-- The count starts from DocuSign's own figure: 42 used as of Nov 26, 2026.
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

-- Starting point for this license year, from DocuSign's own count: 42 of 100 used as of Nov 26, 2026.
-- The Today page shows this plus every envelope the portal sends after it.
create table if not exists public.docusign_usage_baseline (
  license_year date primary key,
  as_of timestamptz not null,
  used int not null
);
alter table public.docusign_usage_baseline enable row level security;
revoke all on public.docusign_usage_baseline from anon;
insert into public.docusign_usage_baseline (license_year, as_of, used)
values ('2026-10-28', '2026-11-27 02:30:00+00', 42)
on conflict (license_year) do update set as_of = excluded.as_of, used = excluded.used;

-- Which warnings have gone out this license year (80 and 95), so each is sent once.
create table if not exists public.docusign_usage_alerts (
  license_year date not null,
  threshold int not null,
  sent_at timestamptz not null default now(),
  primary key (license_year, threshold)
);
alter table public.docusign_usage_alerts enable row level security;
revoke all on public.docusign_usage_alerts from anon;
