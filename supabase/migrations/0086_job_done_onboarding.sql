-- 0086: "Job done" from the Agent Portal, and tracking Chuck's onboarding.
--   * maintenance_requests.vendor_*: what the partner reported when they marked the job done (date, what they
--     did, their price before HST, whether HST goes on top). Staff review it and complete the job; the after
--     photos are added to the request's photos (marked "after").
--   * partner_onboarding_checks: the onboarding checklist items Rishi ticks off with Chuck.
--   * partner_feedback: notes from each review meeting: how Chuck is using each part, and his feedback.
-- Run AFTER 0085. Safe to re-run.

alter table public.maintenance_requests add column if not exists vendor_done_at timestamptz;
alter table public.maintenance_requests add column if not exists vendor_done_on date;
alter table public.maintenance_requests add column if not exists vendor_notes text;
alter table public.maintenance_requests add column if not exists vendor_price numeric(12, 2) check (vendor_price is null or vendor_price >= 0);
alter table public.maintenance_requests add column if not exists vendor_hst boolean;
create index if not exists maintenance_vendor_done_idx on public.maintenance_requests (vendor_done_at) where vendor_done_at is not null and status <> 'completed';

create table if not exists public.partner_onboarding_checks (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  item_key text not null,
  done_at timestamptz not null default now(),
  done_by uuid default auth.uid(),
  note text,
  unique (partner_id, item_key)
);

create table if not exists public.partner_feedback (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  meeting_on date not null default current_date,
  ratings jsonb not null default '{}'::jsonb,
  notes text,
  partner_feedback text,
  follow_ups text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.partner_onboarding_checks enable row level security;
alter table public.partner_feedback enable row level security;
drop policy if exists "partner_onboarding_checks: staff all" on public.partner_onboarding_checks;
create policy "partner_onboarding_checks: staff all" on public.partner_onboarding_checks for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "partner_feedback: staff all" on public.partner_feedback;
create policy "partner_feedback: staff all" on public.partner_feedback for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.partner_onboarding_checks from anon;
revoke all on public.partner_feedback from anon;
