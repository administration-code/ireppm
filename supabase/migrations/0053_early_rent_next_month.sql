-- IRep Property Management: rent paid early goes to the next month when this month is already paid.
--   Before: a rent payment counted toward the month it arrived in, unless it came on the 25th or
--   later (then next month). A tenant paying November rent on Oct 23 after already paying October
--   got it counted as a second October payment.
--   Now: matching to a tenancy happens first, then if the month the date rule picks is already
--   fully paid for that tenancy, the payment moves to the next unpaid month (up to 3 months ahead).
--   Staff can still choose the month by hand when they match or record a payment.
-- Run AFTER 0052. Safe to re-run.

create or replace function public.rent_month_paid(p_tenancy_id uuid, p_month date, p_exclude uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(p.amount) from public.payments p
                    where p.tenancy_id = p_tenancy_id and p.kind = 'rent' and p.status = 'matched'
                      and p.period = p_month and p.id is distinct from p_exclude), 0)
         >= coalesce((select c.amount from public.rent_charges c
                       where c.tenancy_id = p_tenancy_id and c.period = p_month and c.kind = 'rent'),
                     (select t.rent from public.tenancies t where t.id = p_tenancy_id), 0)
     and coalesce((select t.rent from public.tenancies t where t.id = p_tenancy_id), 0) > 0
$$;
revoke execute on function public.rent_month_paid(uuid, date, uuid) from public, anon;

create or replace function public.payments_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  auto_period boolean := false;
  i integer := 0;
begin
  if tg_op = 'INSERT' and new.tenancy_id is null and new.status = 'unmatched' and new.payer_name is not null then
    select * into m from public.match_payer(new.payer_name);
    new.tenancy_id := m.match_id;
    new.suggested_tenancy_id := coalesce(new.suggested_tenancy_id, m.suggest_id);
  end if;

  -- The rent month: payments from the 25th on count toward next month (paying early).
  if new.period is null and new.kind = 'rent' then
    auto_period := true;
    new.period := case when extract(day from new.received_on) >= 25
                       then (date_trunc('month', new.received_on) + interval '1 month')::date
                       else date_trunc('month', new.received_on)::date end;
  end if;

  -- If that month is already paid in full, it's rent for the next month.
  if auto_period and new.tenancy_id is not null and new.method not in ('last_month_applied', 'paid_to_owner') then
    while i < 3 and public.rent_month_paid(new.tenancy_id, new.period, new.id) loop
      new.period := (new.period + interval '1 month')::date;
      i := i + 1;
    end loop;
  end if;

  if new.status in ('split', 'ignored') then
    null;
  elsif new.tenancy_id is not null then
    new.status := 'matched';
  else
    new.status := 'unmatched';
  end if;
  return new;
end;
$$;
revoke execute on function public.payments_rules() from public, anon, authenticated;
