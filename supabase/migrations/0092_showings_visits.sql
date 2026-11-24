-- 0092: two quick logs for Chuck.
--   * vacancy_showings: "I Showed It": a showing he set up himself (e.g. from Facebook), one tap per showing.
--   * service_visits: lawn and snow visits, with a photo as proof of service.
-- Run AFTER 0091. Safe to re-run.

create table if not exists public.vacancy_showings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  shown_on date not null default (now() at time zone 'America/Toronto')::date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists vacancy_showings_listing on public.vacancy_showings (listing_id, shown_on desc);

create table if not exists public.service_visits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  kind text not null check (kind in ('lawn', 'snow')),
  visited_on date not null default (now() at time zone 'America/Toronto')::date,
  photos jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists service_visits_property on public.service_visits (property_id, visited_on desc);

alter table public.vacancy_showings enable row level security;
alter table public.service_visits enable row level security;
drop policy if exists "vacancy_showings: staff" on public.vacancy_showings;
create policy "vacancy_showings: staff" on public.vacancy_showings for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "service_visits: staff" on public.service_visits;
create policy "service_visits: staff" on public.service_visits for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.vacancy_showings from anon;
revoke all on public.service_visits from anon;
