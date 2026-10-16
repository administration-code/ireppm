-- IRep Property Management:
--   1. Tenants give notice online (N9), signed in DocuSign.
--   2. Leasing fees and their HST kept apart; landlords' year-end rental income report (T776-style).
--   3. Leasing fee split: Rishi and Chuck share 50/50; half of each share is commission,
--      the other half repays that person's shareholder loan.
-- Run AFTER 0020. Safe to re-run.

-- ===========================================================================
-- 1. N9: tenant's notice to end the tenancy
-- ===========================================================================
alter table public.signature_requests drop constraint if exists signature_requests_kind_check;
alter table public.signature_requests add constraint signature_requests_kind_check
  check (kind in ('lease', 'pm_contract', 'N1', 'N4', 'N5', 'N9', 'certificate_of_service', 'other'));

-- Last day of the rental period that contains day d, for rent due on day `due` of the month.
create or replace function public.rental_period_end(d date, due integer)
returns date
language sql
immutable
as $$
  -- Periods run from the due day to the day before the next due day.
  select case when extract(day from d) >= due
              then (date_trunc('month', d) + interval '1 month' + make_interval(days => due - 1) - interval '1 day')::date
              else (date_trunc('month', d) + make_interval(days => due - 1) - interval '1 day')::date end
$$;

-- Earliest termination date a tenant can put on an N9 given today (Ontario RTA s. 44, 47):
-- at least 60 days' notice, on the last day of a rental period, and not before the end of
-- a fixed term. Special rule: for rent due on the 1st, notice for Feb 28/29 can be given by
-- Jan 1, and for Mar 31 by Feb 1.
create or replace function public.n9_earliest_date(p_tenancy_id uuid, p_given_on date default null)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.tenancies;
  given date := coalesce(p_given_on, (now() at time zone 'America/Toronto')::date);
  d date;
  feb date;
  mar date;
begin
  select * into t from public.tenancies where id = p_tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;
  if not (public.is_staff() or public.is_tenant_of(p_tenancy_id) or auth.uid() is null) then
    raise exception 'Not your tenancy';
  end if;
  d := public.rental_period_end(given + 60, t.rent_due_day);
  -- February / March exception (monthly rent due on the 1st).
  if t.rent_due_day = 1 then
    -- Feb 28/29 if given by Jan 1 of that year; Mar 31 if given by Feb 1 of that year.
    feb := make_date(extract(year from given)::int + case when given <= make_date(extract(year from given)::int, 1, 1) then 0 else 1 end, 3, 1) - 1;
    if feb < d then d := feb; end if;
    mar := make_date(extract(year from given)::int + case when given <= make_date(extract(year from given)::int, 2, 1) then 0 else 1 end, 3, 31);
    if mar < d then d := mar; end if;
  end if;
  -- A fixed term can't be ended early with an N9.
  if t.end_date is not null and t.end_date > d then d := t.end_date; end if;
  return d;
end;
$$;

-- What the tenant portal shows before a tenant gives notice, and the check before sending.
-- Returns {ok, earliest, error, landlord_name, address, tenants:[{full_name,email,phone,is_primary}], ...}.
create or replace function public.n9_prepare(p_tenancy_id uuid, p_termination date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.tenancies;
  earliest date;
  err text;
  info jsonb;
begin
  select * into t from public.tenancies where id = p_tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;
  if not (public.is_staff() or public.is_tenant_of(p_tenancy_id) or auth.uid() is null) then
    raise exception 'Not your tenancy';
  end if;
  earliest := public.n9_earliest_date(p_tenancy_id);

  if t.status not in ('active', 'upcoming') then
    err := case when t.status = 'notice' then 'Notice has already been given for this tenancy.' else 'This tenancy has ended.' end;
  elsif exists (select 1 from public.signature_requests
                 where tenancy_id = p_tenancy_id and kind = 'N9' and status in ('draft', 'sent', 'delivered')) then
    err := 'A notice is already waiting to be signed. Check your email from DocuSign.';
  elsif p_termination is not null and p_termination < earliest then
    err := 'The earliest move-out date you can give is ' || to_char(earliest, 'FMMonth FMDD, YYYY') || '.';
  elsif p_termination is not null and p_termination <> public.rental_period_end(p_termination, t.rent_due_day)
        and p_termination is distinct from t.end_date then
    err := 'The move-out date must be the last day of a rental period, e.g. '
           || to_char(public.rental_period_end(p_termination, t.rent_due_day), 'FMMonth FMDD, YYYY') || '.';
  end if;

  select jsonb_build_object(
           'landlord_name', coalesce(o.name, 'The landlord') || ' c/o IRep Property Management',
           'address', concat_ws(', ', concat_ws(' - ', p.address, nullif(u.label, '')), p.city, 'ON', p.postal_code),
           'unit_label', u.label, 'property_address', p.address,
           'unit_id', u.id, 'property_id', p.id, 'owner_id', o.id)
    into info
    from public.units u join public.properties p on p.id = u.property_id
    left join public.owners o on o.id = p.owner_id
   where u.id = t.unit_id;

  return info || jsonb_build_object(
    'ok', err is null,
    'error', err,
    'earliest', earliest,
    'rent_due_day', t.rent_due_day,
    'fixed_term_end', t.end_date,
    'tenants', coalesce((select jsonb_agg(jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone,
                                                             'is_primary', is_primary) order by is_primary desc, created_at)
                           from public.tenancy_tenants where tenancy_id = p_tenancy_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.n9_earliest_date(uuid, date) from public, anon;
grant execute on function public.n9_earliest_date(uuid, date) to authenticated, service_role;
revoke execute on function public.n9_prepare(uuid, date) from public, anon;
grant execute on function public.n9_prepare(uuid, date) to authenticated, service_role;

-- Tenants can see their own N9 requests (status only), staff see everything (0015 policy).
drop policy if exists "signature_requests: tenant reads own N9" on public.signature_requests;
create policy "signature_requests: tenant reads own N9" on public.signature_requests
  for select using (kind = 'N9' and tenancy_id is not null and public.is_tenant_of(tenancy_id));

-- When a signed document completes. Same as 0015, plus N9: the tenancy moves to 'notice'
-- with the move-out date (which opens a turnover), and the notice is logged.
create or replace function public.apply_signed_document(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.signature_requests;
  t jsonb;
  new_tenancy uuid;
  tenant jsonb;
  first boolean := true;
  nid uuid;
begin
  select * into r from public.signature_requests where id = p_request_id for update;
  if not found then raise exception 'Signature request not found'; end if;
  if r.status <> 'completed' then raise exception 'Not completed yet'; end if;
  if r.applied_at is not null then
    return jsonb_build_object('already_applied', true, 'tenancy_id', r.tenancy_id);
  end if;
  t := r.terms;

  if r.kind = 'lease' then
    if r.tenancy_id is null then
      insert into public.tenancies (unit_id, status, start_date, end_date, rent, rent_due_day,
                                    last_month_deposit, key_deposit, application_id, email_service_consent, notes)
      values ((coalesce(t->>'unit_id', r.unit_id::text))::uuid,
              'upcoming',
              (t->>'start_date')::date,
              nullif(t->>'end_date', '')::date,
              (t->>'rent')::numeric,
              coalesce(nullif(t->>'rent_due_day', '')::smallint, 1),
              nullif(t->>'last_month_deposit', '')::numeric,
              nullif(t->>'key_deposit', '')::numeric,
              r.application_id,
              coalesce(nullif(t->>'email_service_consent', ''),
                       'Not recorded: check the Email Service Consent page of the signed lease'),
              'Lease signed in DocuSign, envelope ' || r.envelope_id)
      returning id into new_tenancy;

      for tenant in select * from jsonb_array_elements(coalesce(t->'tenants', '[]'::jsonb)) loop
        insert into public.tenancy_tenants (tenancy_id, full_name, email, phone, is_primary)
        values (new_tenancy, tenant->>'full_name', nullif(lower(tenant->>'email'), ''), nullif(tenant->>'phone', ''),
                coalesce((tenant->>'is_primary')::boolean, first));
        first := false;
      end loop;

      update public.signature_requests set tenancy_id = new_tenancy where id = r.id;
    else
      new_tenancy := r.tenancy_id;
    end if;

  elsif r.kind = 'pm_contract' then
    update public.properties
       set agreement_start = coalesce(nullif(t->>'agreement_start', '')::date, agreement_start),
           agreement_renewal = coalesce(nullif(t->>'agreement_renewal', '')::date, agreement_renewal)
     where id = r.property_id;

  elsif r.kind = 'N9' then
    if r.tenancy_id is null then raise exception 'No tenancy on this notice'; end if;
    update public.tenancies
       set status = case when status in ('active', 'upcoming') then 'notice' else status end,
           move_out_date = (t->>'termination_date')::date
     where id = r.tenancy_id;
    if r.notice_id is null then
      insert into public.notices (tenancy_id, form, served_on, service_method, served_by, effective_date,
                                  status, notes, signature_request_id)
      values (r.tenancy_id, 'N9', coalesce((r.completed_at at time zone 'America/Toronto')::date,
                                           (now() at time zone 'America/Toronto')::date),
              'other', 'Tenant, online (DocuSign)', (t->>'termination_date')::date,
              'served', 'Given through the tenant portal and signed in DocuSign.', r.id)
      returning id into nid;
      update public.signature_requests set notice_id = nid where id = r.id;
    end if;
  end if;

  update public.signature_requests set applied_at = now() where id = r.id;
  return jsonb_build_object('applied', true, 'kind', r.kind, 'tenancy_id', coalesce(new_tenancy, r.tenancy_id));
end;
$$;
revoke execute on function public.apply_signed_document(uuid) from public, anon, authenticated;
grant execute on function public.apply_signed_document(uuid) to service_role;

-- ===========================================================================
-- 2. Leasing fees with HST apart, and the landlord year-end report
-- ===========================================================================

-- Leasing fees are statement items (amount = -(fee + HST), from the owner's side).
create or replace view public.leasing_fee_lines
with (security_invoker = true) as
  with hst as (select coalesce((select amount from public.service_rates where key = 'hst'), 13) as pct)
  select i.id as statement_item_id, i.property_id, i.period, i.description, i.tenancy_id,
         -i.amount as fee_incl_hst,
         round(-i.amount * 100 / (100 + hst.pct), 2) as fee,
         -i.amount - round(-i.amount * 100 / (100 + hst.pct), 2) as hst
    from public.statement_items i cross join hst
   where i.kind = 'leasing_fee';
revoke all on public.leasing_fee_lines from anon;

-- Income or expenses from before the system (Jan-Aug 2026 lived in the income spreadsheet),
-- or anything else staff need on a landlord's year-end report. Positive numbers.
create table if not exists public.landlord_year_entries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  category text not null check (category in (
    'rent',              -- rent collected by IRep
    'rent_direct',       -- rent the tenant paid the landlord directly
    'management_fee', 'management_hst',
    'leasing_fee', 'leasing_hst',
    'repairs',           -- maintenance and repairs paid from rent
    'other_expense',
    'paid_out')),        -- money sent to the landlord
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists landlord_year_entries_idx on public.landlord_year_entries (property_id, year);
alter table public.landlord_year_entries enable row level security;
drop policy if exists "landlord_year_entries: staff all" on public.landlord_year_entries;
create policy "landlord_year_entries: staff all" on public.landlord_year_entries
  for all using (public.is_staff()) with check (public.is_staff());

-- One landlord's rental income and expenses for a calendar year, by property and month,
-- with totals laid out like CRA form T776. Staff, or the landlord through the owner portal.
create or replace function public.landlord_year_report(p_owner_id uuid, p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  y0 date := make_date(p_year, 1, 1);
  y1 date := make_date(p_year, 12, 1);
  props jsonb;
  tot jsonb;
  o public.owners;
begin
  if not (public.is_staff() or public.is_owner_account(p_owner_id) or auth.uid() is null) then
    raise exception 'Not allowed';
  end if;
  select * into o from public.owners where id = p_owner_id;
  if not found then raise exception 'Owner not found'; end if;

  with pr as (
    select p.* from public.properties p where p.owner_id = p_owner_id
  ),
  m as (   -- monthly figures from the system
    select s.property_id, s.period,
           s.rent_collected + s.last_month_forwarded as rent,
           coalesce((select sum(pay.amount) from public.payments pay
                       join public.tenancies tn on tn.id = pay.tenancy_id join public.units u on u.id = tn.unit_id
                      where u.property_id = s.property_id and pay.method = 'paid_to_owner' and pay.status = 'matched'
                        and date_trunc('month', pay.received_on)::date = s.period), 0) as rent_direct,
           s.mgmt_fee + coalesce((select sum(-i.amount) from public.statement_items i
                                   where i.property_id = s.property_id and i.period = s.period and i.kind = 'fee_adjustment'), 0)
             as management_fee,
           s.mgmt_fee_hst as management_hst,
           coalesce((select sum(l.fee) from public.leasing_fee_lines l where l.property_id = s.property_id and l.period = s.period), 0) as leasing_fee,
           coalesce((select sum(l.hst) from public.leasing_fee_lines l where l.property_id = s.property_id and l.period = s.period), 0) as leasing_hst,
           s.work_orders as repairs,
           coalesce((select sum(-i.amount) from public.statement_items i
                      where i.property_id = s.property_id and i.period = s.period and i.kind in ('expense', 'other') and i.amount < 0), 0)
             as other_expense,
           coalesce((select sum(i.amount) from public.statement_items i
                      where i.property_id = s.property_id and i.period = s.period and i.kind = 'other' and i.amount > 0), 0)
             as other_income,
           s.paid_out
      from public.owner_statement_totals s
     where s.property_id in (select id from pr) and s.period between y0 and y1
  ),
  manual as (
    select property_id,
           sum(amount) filter (where category = 'rent') as rent,
           sum(amount) filter (where category = 'rent_direct') as rent_direct,
           sum(amount) filter (where category = 'management_fee') as management_fee,
           sum(amount) filter (where category = 'management_hst') as management_hst,
           sum(amount) filter (where category = 'leasing_fee') as leasing_fee,
           sum(amount) filter (where category = 'leasing_hst') as leasing_hst,
           sum(amount) filter (where category = 'repairs') as repairs,
           sum(amount) filter (where category = 'other_expense') as other_expense,
           sum(amount) filter (where category = 'paid_out') as paid_out,
           jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'note', note) order by created_at) as lines
      from public.landlord_year_entries
     where year = p_year and property_id in (select id from pr)
     group by property_id
  ),
  per as (
    select pr.id, pr.address, pr.city, pr.unit_count,
           coalesce((select jsonb_agg(to_jsonb(m) - 'property_id' order by m.period) from m where m.property_id = pr.id), '[]'::jsonb) as months,
           mn.lines as earlier_entries,
           coalesce((select sum(rent) from m where m.property_id = pr.id), 0) + coalesce(mn.rent, 0) as rent,
           coalesce((select sum(rent_direct) from m where m.property_id = pr.id), 0) + coalesce(mn.rent_direct, 0) as rent_direct,
           coalesce((select sum(other_income) from m where m.property_id = pr.id), 0) as other_income,
           coalesce((select sum(management_fee) from m where m.property_id = pr.id), 0) + coalesce(mn.management_fee, 0) as management_fee,
           coalesce((select sum(management_hst) from m where m.property_id = pr.id), 0) + coalesce(mn.management_hst, 0) as management_hst,
           coalesce((select sum(leasing_fee) from m where m.property_id = pr.id), 0) + coalesce(mn.leasing_fee, 0) as leasing_fee,
           coalesce((select sum(leasing_hst) from m where m.property_id = pr.id), 0) + coalesce(mn.leasing_hst, 0) as leasing_hst,
           coalesce((select sum(repairs) from m where m.property_id = pr.id), 0) + coalesce(mn.repairs, 0) as repairs,
           coalesce((select sum(other_expense) from m where m.property_id = pr.id), 0) + coalesce(mn.other_expense, 0) as other_expense,
           coalesce((select sum(paid_out) from m where m.property_id = pr.id), 0) + coalesce(mn.paid_out, 0) as paid_out,
           pr.fee_billed_separately
      from pr left join manual mn on mn.property_id = pr.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'property_id', id, 'address', address, 'city', city, 'units', unit_count,
           'fee_billed_separately', fee_billed_separately,
           'months', months, 'earlier_entries', coalesce(earlier_entries, '[]'::jsonb),
           'totals', jsonb_build_object(
             'rent', rent, 'rent_direct', rent_direct, 'other_income', other_income,
             'management_fee', management_fee, 'management_hst', management_hst,
             'leasing_fee', leasing_fee, 'leasing_hst', leasing_hst,
             'repairs', repairs, 'other_expense', other_expense, 'paid_out', paid_out,
             'net_income', rent + rent_direct + other_income - management_fee - management_hst
                           - leasing_fee - leasing_hst - repairs - other_expense)) order by address), '[]'::jsonb),
         jsonb_build_object(
           'rent', coalesce(sum(rent), 0), 'rent_direct', coalesce(sum(rent_direct), 0),
           'other_income', coalesce(sum(other_income), 0),
           'management_fee', coalesce(sum(management_fee), 0), 'management_hst', coalesce(sum(management_hst), 0),
           'leasing_fee', coalesce(sum(leasing_fee), 0), 'leasing_hst', coalesce(sum(leasing_hst), 0),
           'repairs', coalesce(sum(repairs), 0), 'other_expense', coalesce(sum(other_expense), 0),
           'paid_out', coalesce(sum(paid_out), 0))
    into props, tot
    from per;

  return jsonb_build_object(
    'year', p_year,
    'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email),
    'first_month_in_system', (select min(s.period) from public.owner_statement_totals s
                               join public.properties p on p.id = s.property_id where p.owner_id = p_owner_id),
    'properties', props,
    'totals', tot,
    -- Suggested T776 lines. HST is included in the fee lines for landlords who aren't HST registrants.
    't776', jsonb_build_array(
      jsonb_build_object('line', '8141', 'label', 'Gross rents',
                         'amount', (tot->>'rent')::numeric + (tot->>'rent_direct')::numeric),
      jsonb_build_object('line', '8230', 'label', 'Other income', 'amount', (tot->>'other_income')::numeric),
      jsonb_build_object('line', '8871', 'label', 'Management and administration fees (management + leasing, incl. HST)',
                         'amount', (tot->>'management_fee')::numeric + (tot->>'management_hst')::numeric
                                   + (tot->>'leasing_fee')::numeric + (tot->>'leasing_hst')::numeric),
      jsonb_build_object('line', '8960', 'label', 'Repairs and maintenance', 'amount', (tot->>'repairs')::numeric),
      jsonb_build_object('line', '9270', 'label', 'Other expenses', 'amount', (tot->>'other_expense')::numeric)),
    'hst_paid', (tot->>'management_hst')::numeric + (tot->>'leasing_hst')::numeric
  );
end;
$$;
revoke execute on function public.landlord_year_report(uuid, integer) from public, anon;
grant execute on function public.landlord_year_report(uuid, integer) to authenticated, service_role;

-- Staff list for the year: one line per landlord with the headline numbers.
create or replace function public.landlord_year_reports(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('owner_id', o.id, 'owner', o.name, 'email', o.email,
                                                       'totals', public.landlord_year_report(o.id, p_year)->'totals')
                                    order by o.name)
                     from public.owners o
                    where exists (select 1 from public.properties p where p.owner_id = o.id)), '[]'::jsonb);
end;
$$;
revoke execute on function public.landlord_year_reports(integer) from public, anon;
grant execute on function public.landlord_year_reports(integer) to authenticated, service_role;

-- ===========================================================================
-- 3. Leasing fee split, commissions and shareholder loans
-- ===========================================================================
create table if not exists public.shareholder_loans (
  id uuid primary key default gen_random_uuid(),
  person text not null unique check (person in ('Rishi', 'Chuck')),
  label text not null,                    -- e.g. "Chuck Truck"
  advanced numeric(12, 2) not null check (advanced >= 0),
  advanced_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.shareholder_loans (id) on delete cascade,
  paid_on date not null,
  period date check (period is null or extract(day from period) = 1),   -- the leasing month it came from
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists loan_repayments_loan_idx on public.loan_repayments (loan_id, paid_on);

create table if not exists public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  person text not null check (person in ('Rishi', 'Chuck')),
  paid_on date not null,
  period date check (period is null or extract(day from period) = 1),
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'etransfer' check (method in ('etransfer', 'cheque', 'cash', 'other')),
  reference text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists commission_payments_idx on public.commission_payments (person, paid_on);

alter table public.shareholder_loans enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.commission_payments enable row level security;
do $$
declare tb text;
begin
  foreach tb in array array['shareholder_loans', 'loan_repayments', 'commission_payments'] loop
    execute format('drop policy if exists "%1$s: staff all" on public.%1$s', tb);
    execute format('create policy "%1$s: staff all" on public.%1$s for all using (public.is_staff()) with check (public.is_staff())', tb);
  end loop;
end $$;

-- Each leasing fee (before HST) split four ways. HST is never split: it's owed to CRA.
create or replace view public.leasing_fee_splits
with (security_invoker = true) as
  select l.*, p.address,
         round(l.fee / 4, 2) as rishi_commission,
         round(l.fee / 4, 2) as chuck_commission,
         round(l.fee / 4, 2) as rishi_loan,
         l.fee - 3 * round(l.fee / 4, 2) as chuck_loan
    from public.leasing_fee_lines l join public.properties p on p.id = l.property_id;
revoke all on public.leasing_fee_splits from anon;

-- Month by month: what each person earned (commission + loan share), what's been paid or
-- repaid, and the loan balances.
create or replace function public.leasing_commissions_summary(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  y0 date := make_date(p_year, 1, 1);
  y1 date := make_date(p_year, 12, 31);
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'year', p_year,
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'period', mo,
        'fees', coalesce((select sum(fee) from public.leasing_fee_splits where period = mo), 0),
        'hst', coalesce((select sum(hst) from public.leasing_fee_splits where period = mo), 0),
        'rishi_commission', coalesce((select sum(rishi_commission) from public.leasing_fee_splits where period = mo), 0),
        'chuck_commission', coalesce((select sum(chuck_commission) from public.leasing_fee_splits where period = mo), 0),
        'rishi_loan', coalesce((select sum(rishi_loan) from public.leasing_fee_splits where period = mo), 0),
        'chuck_loan', coalesce((select sum(chuck_loan) from public.leasing_fee_splits where period = mo), 0),
        'rishi_commission_paid', coalesce((select sum(amount) from public.commission_payments where person = 'Rishi' and period = mo), 0),
        'chuck_commission_paid', coalesce((select sum(amount) from public.commission_payments where person = 'Chuck' and period = mo), 0),
        'rishi_loan_repaid', coalesce((select sum(r.amount) from public.loan_repayments r join public.shareholder_loans l on l.id = r.loan_id
                                        where l.person = 'Rishi' and r.period = mo), 0),
        'chuck_loan_repaid', coalesce((select sum(r.amount) from public.loan_repayments r join public.shareholder_loans l on l.id = r.loan_id
                                        where l.person = 'Chuck' and r.period = mo), 0)) order by mo)
      from generate_series(y0, make_date(p_year, 12, 1), interval '1 month') g0(m0), lateral (select m0::date as mo) g), '[]'::jsonb),
    'splits', coalesce((select jsonb_agg(to_jsonb(s) order by s.period, s.address) from public.leasing_fee_splits s
                         where s.period between y0 and y1), '[]'::jsonb),
    'loans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'person', l.person, 'label', l.label, 'advanced', l.advanced, 'advanced_on', l.advanced_on,
        'repaid', coalesce((select sum(amount) from public.loan_repayments where loan_id = l.id), 0),
        'remaining', l.advanced - coalesce((select sum(amount) from public.loan_repayments where loan_id = l.id), 0),
        'repayments', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'paid_on', r.paid_on, 'period', r.period,
                                                                   'amount', r.amount, 'note', r.note) order by r.paid_on)
                                  from public.loan_repayments r where r.loan_id = l.id), '[]'::jsonb),
        -- Earned from leasing fees but not yet recorded as repaid / paid.
        'loan_share_not_recorded', coalesce((select sum(case when l.person = 'Rishi' then rishi_loan else chuck_loan end)
                                               from public.leasing_fee_splits), 0)
                                   - coalesce((select sum(amount) from public.loan_repayments where loan_id = l.id and period is not null), 0),
        'commission_owed', coalesce((select sum(case when l.person = 'Rishi' then rishi_commission else chuck_commission end)
                                       from public.leasing_fee_splits), 0)
                           - coalesce((select sum(amount) from public.commission_payments c where c.person = l.person and c.period is not null), 0))
        order by l.person) from public.shareholder_loans l), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.leasing_commissions_summary(integer) from public, anon;
grant execute on function public.leasing_commissions_summary(integer) to authenticated, service_role;

-- Record one month's split as paid: commission to each person and the loan share against
-- each loan, all dated p_paid_on. Amounts default to what that month's fees earned.
create or replace function public.pay_leasing_split(p_period date, p_paid_on date, p_method text default 'etransfer',
                                                    p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rc numeric; cc numeric; rl numeric; cl numeric;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  if exists (select 1 from public.commission_payments where period = p_period)
     or exists (select 1 from public.loan_repayments where period = p_period) then
    raise exception '% has already been paid out. Delete those lines first to redo it.', to_char(p_period, 'FMMonth YYYY');
  end if;
  select coalesce(sum(rishi_commission), 0), coalesce(sum(chuck_commission), 0),
         coalesce(sum(rishi_loan), 0), coalesce(sum(chuck_loan), 0)
    into rc, cc, rl, cl
    from public.leasing_fee_splits where period = p_period;
  if rc + cc + rl + cl = 0 then raise exception 'No leasing fees in %.', to_char(p_period, 'FMMonth YYYY'); end if;

  if rc > 0 then insert into public.commission_payments (person, paid_on, period, amount, method, note)
                 values ('Rishi', p_paid_on, p_period, rc, p_method, p_note); end if;
  if cc > 0 then insert into public.commission_payments (person, paid_on, period, amount, method, note)
                 values ('Chuck', p_paid_on, p_period, cc, p_method, p_note); end if;
  if rl > 0 then insert into public.loan_repayments (loan_id, paid_on, period, amount, note)
                 select id, p_paid_on, p_period, rl, coalesce(p_note, 'Leasing fees ' || to_char(p_period, 'FMMonth YYYY'))
                   from public.shareholder_loans where person = 'Rishi'; end if;
  if cl > 0 then insert into public.loan_repayments (loan_id, paid_on, period, amount, note)
                 select id, p_paid_on, p_period, cl, coalesce(p_note, 'Leasing fees ' || to_char(p_period, 'FMMonth YYYY'))
                   from public.shareholder_loans where person = 'Chuck'; end if;
  return jsonb_build_object('rishi_commission', rc, 'chuck_commission', cc, 'rishi_loan', rl, 'chuck_loan', cl);
end;
$$;
revoke execute on function public.pay_leasing_split(date, date, text, text) from public, anon;
grant execute on function public.pay_leasing_split(date, date, text, text) to authenticated, service_role;

-- The loans and repayments so far, from the "Shareholder Loans" sheet (Oct 16, 2026).
insert into public.shareholder_loans (person, label, advanced, notes) values
  ('Chuck', 'Chuck Truck', 21000, 'From the Shareholder Loans sheet'),
  ('Rishi', 'Rishi Loan', 20000, 'From the Shareholder Loans sheet')
on conflict (person) do nothing;
insert into public.loan_repayments (loan_id, paid_on, amount, note)
select l.id, v.paid_on, v.amount, v.note
  from public.shareholder_loans l
  cross join (values (date '2026-09-08', 450.00, 'From the Shareholder Loans sheet'),
                     (date '2026-10-07', 268.37, 'From the Shareholder Loans sheet (sheet shows $268.38; $1,073.50 of fees incl. HST / 4)'))
              v(paid_on, amount, note)
 where not exists (select 1 from public.loan_repayments r where r.loan_id = l.id and r.paid_on = v.paid_on and r.period is null);

-- ===========================================================================
-- 4. Year-end package: leasing fees and leasing HST as separate numbers,
--    plus commissions and loan repayments.
-- ===========================================================================
create or replace function public.fiscal_year_summary(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  y0 date := make_date(p_year, 1, 1);
  y1 date := make_date(p_year, 12, 31);
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'year', p_year,
    'closed', exists (select 1 from public.fiscal_year_closes where year = p_year),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'kind', a.kind,
        'months', (select jsonb_agg(jsonb_build_object('period', mo, 'status',
                     coalesce((select status from public.reconciliations r where r.account_id = a.id and r.period = mo), 'open'))
                     order by mo)
                     from generate_series(y0, make_date(p_year, 12, 1), interval '1 month') g(mo)),
        'opening', a.opening_balance + coalesce((select sum(amount) from public.bank_transactions
                     where account_id = a.id and posted_on >= a.opening_date and posted_on < y0), 0),
        'money_in', coalesce((select sum(amount) from public.bank_transactions where account_id = a.id
                     and posted_on between y0 and y1 and amount > 0), 0),
        'money_out', coalesce((select -sum(amount) from public.bank_transactions where account_id = a.id
                     and posted_on between y0 and y1 and amount < 0), 0),
        'closing', a.opening_balance + coalesce((select sum(amount) from public.bank_transactions
                     where account_id = a.id and posted_on >= a.opening_date and posted_on <= y1), 0),
        'by_category', coalesce((select jsonb_object_agg(k, v) from (
                     select coalesce(category, case when status = 'matched' and amount > 0 then 'rent_received'
                                                     when status = 'matched' then 'owner_payouts' else status end) k,
                            round(sum(amount), 2) v
                       from public.bank_transactions where account_id = a.id and posted_on between y0 and y1
                      group by 1) x), '{}'::jsonb))
      order by a.name) from public.bank_accounts a where a.active), '[]'::jsonb),
    'irep_income', coalesce((select jsonb_agg(jsonb_build_object(
        'period', mo,
        'management_fees', coalesce((select sum(mgmt_fee) from public.owner_statement_totals where period = mo), 0),
        'management_hst', coalesce((select sum(mgmt_fee_hst) from public.owner_statement_totals where period = mo), 0),
        'leasing_fees', coalesce((select sum(fee) from public.leasing_fee_lines where period = mo), 0),
        'leasing_hst', coalesce((select sum(hst) from public.leasing_fee_lines where period = mo), 0),
        'leasing_fees_incl_hst', coalesce((select sum(fee_incl_hst) from public.leasing_fee_lines where period = mo), 0),
        'commissions_paid', coalesce((select sum(amount) from public.commission_payments where paid_on >= mo and paid_on < mo + interval '1 month'), 0),
        'loan_repaid', coalesce((select sum(amount) from public.loan_repayments where paid_on >= mo and paid_on < mo + interval '1 month'), 0))
        order by mo)
      from generate_series(y0, make_date(p_year, 12, 1), interval '1 month') g0(m0), lateral (select m0::date as mo) g), '[]'::jsonb),
    'hst_collected', jsonb_build_object(
        'management', coalesce((select sum(mgmt_fee_hst) from public.owner_statement_totals where period between y0 and y1), 0),
        'leasing', coalesce((select sum(hst) from public.leasing_fee_lines where period between y0 and y1), 0)),
    'owners', coalesce((select jsonb_agg(x order by x->>'owner') from (
        select jsonb_build_object(
          'owner', o.name,
          'rent_collected', coalesce(sum(s.rent_collected + s.last_month_forwarded), 0),
          'management_fees', coalesce(sum(s.mgmt_fee + s.mgmt_fee_hst), 0),
          'work_orders', coalesce(sum(s.work_orders), 0),
          'other_items', coalesce(sum(s.items_total), 0),
          'paid_out', coalesce(sum(s.paid_out), 0),
          'balance_dec31', coalesce((select sum(t.to_pay) from public.owner_statement_totals t
                                       join public.properties p2 on p2.id = t.property_id
                                      where p2.owner_id = o.id and t.period <= make_date(p_year, 12, 1)), 0)) x
          from public.owners o
          left join public.properties p on p.owner_id = o.id
          left join public.owner_statement_totals s on s.property_id = p.id and s.period between y0 and make_date(p_year, 12, 1)
         group by o.id, o.name) q), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.fiscal_year_summary(integer) from public, anon;
grant execute on function public.fiscal_year_summary(integer) to authenticated, service_role;
