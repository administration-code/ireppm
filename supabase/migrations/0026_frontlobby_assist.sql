-- IRep Property Management: make the FrontLobby credit check quicker.
-- FrontLobby asks for name, date of birth and previous address. Renters can give their date of
-- birth on their profile (optional, staff-only, never shown to landlords); staff mark when they
-- start a check; the daily job reminds staff when a started check has no report after 2 days.
-- Run AFTER 0025. Safe to re-run.

alter table public.profiles add column if not exists date_of_birth date;
alter table public.applications add column if not exists applicant_dob date;
alter table public.applications add column if not exists credit_check_started_at timestamptz;
alter table public.applications add column if not exists credit_reminder_sent_at timestamptz;

alter table public.profiles drop constraint if exists profiles_date_of_birth_check;
alter table public.profiles add constraint profiles_date_of_birth_check
  check (date_of_birth is null or date_of_birth > date '1900-01-01');

-- Started more than p_days ago, still no report, application still open, not reminded yet.
create or replace function public.credit_checks_overdue(p_days integer default 2)
returns table (application_id uuid, applicant_name text, place text, started_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.applicant_name, concat_ws(', ', l.address, l.unit), a.credit_check_started_at
    from public.applications a join public.listings l on l.id = a.listing_id
   where a.credit_check_started_at < now() - make_interval(days => p_days)
     and a.credit_report_path is null
     and a.credit_reminder_sent_at is null
     and a.status in ('submitted', 'reviewing')
$$;
revoke execute on function public.credit_checks_overdue(integer) from public, anon, authenticated;
grant execute on function public.credit_checks_overdue(integer) to service_role;
