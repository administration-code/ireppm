-- 0095: scheduled inspections with tenant notice, and landlord lawn/snow requests.
--   * inspection_visits: Chuck picks a date and time for a property's inspection; tenants with an email
--     on file are emailed the notice (at least 24 hours ahead, between 8 am and 8 pm, about 1 hour,
--     common areas only). Rescheduling or cancelling emails them again.
--   * lawn_snow_requests: a landlord whose property isn't on the lawn and snow plan asks for a visit
--     from their portal; Chuck logs it done and confirms the amount charged.
--   * service_visits gains charge_amount / charge_hst (what the landlord is charged for a per-visit job)
--     and request_id (the landlord request it answered).
-- Run AFTER 0094. Safe to re-run.

create table if not exists public.inspection_visits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  notice_sent_at timestamptz,
  notice_count integer not null default 0,
  notified jsonb not null default '[]'::jsonb,
  report_id uuid references public.inspection_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspection_visits_property on public.inspection_visits (property_id, scheduled_at desc);

create table if not exists public.lawn_snow_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  kind text not null check (kind in ('lawn', 'snow')),
  note text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  visit_id uuid references public.service_visits(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists lawn_snow_requests_property on public.lawn_snow_requests (property_id, status);

alter table public.service_visits add column if not exists charge_amount numeric(10, 2);
alter table public.service_visits add column if not exists charge_hst numeric(10, 2);
alter table public.service_visits add column if not exists request_id uuid references public.lawn_snow_requests(id) on delete set null;

alter table public.inspection_visits enable row level security;
alter table public.lawn_snow_requests enable row level security;
drop policy if exists "inspection_visits: staff" on public.inspection_visits;
create policy "inspection_visits: staff" on public.inspection_visits for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "lawn_snow_requests: staff" on public.lawn_snow_requests;
create policy "lawn_snow_requests: staff" on public.lawn_snow_requests for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.inspection_visits from anon;
revoke all on public.lawn_snow_requests from anon;
