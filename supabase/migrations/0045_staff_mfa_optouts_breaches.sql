-- 0045: staff two-step sign-in, email unsubscribes (CASL) and the privacy breach record (PIPEDA).

-- 1. Staff two-step sign-in. Once a staff member has set up an authenticator app, staff access
--    only works in a session where they've entered its code (aal2). Before they set one up,
--    nothing changes, so nobody is locked out mid-way.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin'))
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
    );
$$;

-- 2. People who've unsubscribed from promotional email (portal invitations, review requests).
--    Service emails about a tenancy, application or payment still go out.
create table if not exists public.email_optouts (
  email text primary key check (email = lower(email)),
  source text,
  created_at timestamptz not null default now()
);
alter table public.email_optouts enable row level security;

drop policy if exists "optouts read" on public.email_optouts;
create policy "optouts read" on public.email_optouts
  for select using (public.is_staff() or email = lower(auth.jwt() ->> 'email'));
drop policy if exists "optouts add own" on public.email_optouts;
create policy "optouts add own" on public.email_optouts
  for insert with check (email = lower(auth.jwt() ->> 'email') or public.is_staff());
drop policy if exists "optouts remove own" on public.email_optouts;
create policy "optouts remove own" on public.email_optouts
  for delete using (email = lower(auth.jwt() ->> 'email') or public.is_staff());

-- 3. Declined applications: when the applicant was told, and what the decision relied on
--    (Ontario Consumer Reporting Act s. 10: say so when a credit report or other outside information played a part).
alter table public.applications
  add column if not exists decline_notice_sent_at timestamptz,
  add column if not exists decline_reasons text[];

-- 4. Record of every privacy breach (PIPEDA requires keeping these for 24 months, even small ones).
create table if not exists public.privacy_breaches (
  id uuid primary key default gen_random_uuid(),
  discovered_on date not null default current_date,
  happened_on date,
  description text not null,
  info_involved text,
  people_affected text,
  real_risk boolean,
  risk_reason text,
  contained_steps text,
  reported_opc_on date,
  notified_people_on date,
  notified_others text,
  closed_on date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.privacy_breaches enable row level security;

drop policy if exists "breaches staff" on public.privacy_breaches;
create policy "breaches staff" on public.privacy_breaches
  for all using (public.is_staff()) with check (public.is_staff());

-- Breach records are kept, not deleted (the 24-month rule).
revoke delete on public.privacy_breaches from authenticated, anon;
