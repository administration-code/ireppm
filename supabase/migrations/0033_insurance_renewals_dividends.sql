-- IRep Property Management: tenant insurance, lease-end choices, renewal notices, rent reporting,
-- dividends (T5) and the promo fix for fees paid separately.
--   1. Tenant insurance: tenants upload proof within 7 days of the lease start; staff and the
--      landlord review it. Private bucket 'tenant-insurance'.
--   2. Lease-end choice: tenants on a fixed term say whether they'll stay month to month, want a
--      new lease, or are moving out (then the N9 flow).
--   3. (No renewal notices: agreements continue month to month after the first year.)
--   4. Rent reporting: a log of FrontLobby credit-bureau reports for late rent.
--   5. Dividends: a ledger for Rishi, Chuck (or their holding companies) and the T5 totals.
--   6. Fees billed separately use the month's fee (so a first-year promo is respected).
--   7. Profiles remember when the getting-started tour was dismissed.
-- Run AFTER 0032. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Tenant insurance
-- ---------------------------------------------------------------------------
alter table public.tenancies add column if not exists insurance_due date;
alter table public.tenancies add column if not exists insurance_reminded_at timestamptz;
alter table public.tenancies add column if not exists insurance_overdue_alerted_at timestamptz;

create or replace function public.tenancies_insurance_due()
returns trigger language plpgsql as $$
begin
  if new.insurance_due is null or (tg_op = 'UPDATE' and new.start_date is distinct from old.start_date
                                    and new.insurance_due is not distinct from old.insurance_due) then
    new.insurance_due := new.start_date + 7;
  end if;
  return new;
end;
$$;
drop trigger if exists tenancies_insurance_due on public.tenancies;
create trigger tenancies_insurance_due before insert or update on public.tenancies
  for each row execute function public.tenancies_insurance_due();
update public.tenancies set insurance_due = start_date + 7 where insurance_due is null;
-- Existing tenancies aren't chased by email automatically (staff still see them on the Tenant
-- insurance page and can ask); reminders start with leases beginning from now on.
update public.tenancies
   set insurance_reminded_at = coalesce(insurance_reminded_at, now()),
       insurance_overdue_alerted_at = coalesce(insurance_overdue_alerted_at, now())
 where start_date < current_date - 3;

create table if not exists public.tenant_insurance (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_path text not null,
  file_name text,
  insurer text,
  policy_number text,
  expires_on date,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_as text check (reviewed_as is null or reviewed_as in ('staff', 'landlord')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tenant_insurance_tenancy_idx on public.tenant_insurance (tenancy_id);

-- Is the signed-in person the landlord of this tenancy's property?
create or replace function public.is_owner_of_tenancy(p_tenancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.tenancies t join public.units u on u.id = t.unit_id
                   join public.properties p on p.id = u.property_id
                  where t.id = p_tenancy_id and p.owner_id is not null and public.is_owner_account(p.owner_id))
$$;
grant execute on function public.is_owner_of_tenancy(uuid) to authenticated;

alter table public.tenant_insurance enable row level security;
drop policy if exists "tenant_insurance: read" on public.tenant_insurance;
create policy "tenant_insurance: read" on public.tenant_insurance
  for select using (public.is_staff() or public.is_tenant_of(tenancy_id) or public.is_owner_of_tenancy(tenancy_id));
drop policy if exists "tenant_insurance: tenant adds" on public.tenant_insurance;
create policy "tenant_insurance: tenant adds" on public.tenant_insurance
  for insert with check (public.is_tenant_of(tenancy_id) and uploaded_by = auth.uid() and status = 'submitted');
drop policy if exists "tenant_insurance: staff all" on public.tenant_insurance;
create policy "tenant_insurance: staff all" on public.tenant_insurance
  for all using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-insurance', 'tenant-insurance', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do update set public = false;
drop policy if exists "tenant-insurance: staff all" on storage.objects;
create policy "tenant-insurance: staff all" on storage.objects
  for all using (bucket_id = 'tenant-insurance' and public.is_staff())
  with check (bucket_id = 'tenant-insurance' and public.is_staff());
drop policy if exists "tenant-insurance: tenant uploads" on storage.objects;
create policy "tenant-insurance: tenant uploads" on storage.objects
  for insert with check (bucket_id = 'tenant-insurance'
                         and public.is_tenant_of(((storage.foldername(name))[1])::uuid));

-- Staff or the landlord approve or reject a proof of insurance.
create or replace function public.review_tenant_insurance(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ins public.tenant_insurance;
  who text;
begin
  select * into ins from public.tenant_insurance where id = p_id;
  if not found then raise exception 'Not found'; end if;
  if public.is_staff() then who := 'staff';
  elsif public.is_owner_of_tenancy(ins.tenancy_id) then who := 'landlord';
  else raise exception 'Not allowed'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Choose approve or reject.'; end if;
  if p_status = 'rejected' and coalesce(trim(p_note), '') = '' then raise exception 'Say what''s missing so the tenant can fix it.'; end if;
  update public.tenant_insurance
     set status = p_status, review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_as = who, reviewed_at = now()
   where id = p_id;
end;
$$;
revoke execute on function public.review_tenant_insurance(uuid, text, text) from public, anon;
grant execute on function public.review_tenant_insurance(uuid, text, text) to authenticated;

-- Landlord view: insurance for their tenancies.
create or replace function public.owner_tenant_insurance()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'tenancy_id', i.tenancy_id, 'place', concat_ws(', ', p.address, u.label),
           'file_name', i.file_name, 'insurer', i.insurer, 'policy_number', i.policy_number, 'expires_on', i.expires_on,
           'status', i.status, 'review_note', i.review_note, 'reviewed_as', i.reviewed_as, 'created_at', i.created_at)
         order by i.created_at desc), '[]'::jsonb)
    from public.tenant_insurance i
    join public.tenancies t on t.id = i.tenancy_id
    join public.units u on u.id = t.unit_id
    join public.properties p on p.id = u.property_id
   where p.owner_id is not null and public.is_owner_account(p.owner_id)
$$;
revoke execute on function public.owner_tenant_insurance() from public, anon;
grant execute on function public.owner_tenant_insurance() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lease-end choice
-- ---------------------------------------------------------------------------
alter table public.tenancies add column if not exists renewal_choice text;
alter table public.tenancies add column if not exists renewal_choice_at timestamptz;
alter table public.tenancies add column if not exists renewal_prompted_at timestamptz;
alter table public.tenancies add column if not exists renewal_reminded_at timestamptz;
alter table public.tenancies drop constraint if exists tenancies_renewal_choice_check;
alter table public.tenancies add constraint tenancies_renewal_choice_check
  check (renewal_choice is null or renewal_choice in ('month_to_month', 'new_lease', 'moving_out'));

create or replace function public.tenant_set_renewal_choice(p_tenancy_id uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_tenant_of(p_tenancy_id) then raise exception 'Not allowed'; end if;
  if p_choice not in ('month_to_month', 'new_lease', 'moving_out') then raise exception 'Pick one of the options.'; end if;
  update public.tenancies set renewal_choice = p_choice, renewal_choice_at = now() where id = p_tenancy_id;
end;
$$;
revoke execute on function public.tenant_set_renewal_choice(uuid, text) from public, anon;
grant execute on function public.tenant_set_renewal_choice(uuid, text) to authenticated;

-- Tenants see the new fields on their home (columns added at the end).
create or replace view public.my_homes
with (security_invoker = false) as
  select t.id as tenancy_id, t.status, t.start_date, t.end_date, t.rent, t.rent_due_day,
         u.id as unit_id, u.label as unit_label, p.address, p.city, p.postal_code,
         t.insurance_due, t.renewal_choice, t.renewal_choice_at
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  join public.properties p on p.id = u.property_id
  where t.status in ('upcoming', 'active', 'notice')
    and exists (select 1 from public.tenancy_tenants tt
                where tt.tenancy_id = t.id and tt.profile_id = auth.uid());
revoke all on public.my_homes from anon;
grant select on public.my_homes to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rent reporting (FrontLobby)
-- ---------------------------------------------------------------------------
create table if not exists public.rent_reports (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  period date not null,                          -- the rent month that was late
  amount_owing numeric(12, 2),
  service text not null default 'FrontLobby',
  reported_at timestamptz not null default now(),
  reported_by uuid default auth.uid() references public.profiles (id) on delete set null,
  note text
);
create index if not exists rent_reports_tenancy_idx on public.rent_reports (tenancy_id, period);
alter table public.rent_reports enable row level security;
drop policy if exists "rent_reports: staff all" on public.rent_reports;
create policy "rent_reports: staff all" on public.rent_reports for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Dividends and T5 totals
-- ---------------------------------------------------------------------------
create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  recipient text not null,                       -- e.g. "Rishi Bakshi" or "Rishi Holdings Inc."
  recipient_type text not null default 'individual' check (recipient_type in ('individual', 'corporation')),
  share_class text,
  amount numeric(12, 2) not null check (amount > 0),
  eligible boolean not null default false,       -- IRep pays non-eligible dividends (small business rate)
  declared_on date,                              -- date of the directors' resolution
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists dividends_paid_idx on public.dividends (paid_on);
alter table public.dividends enable row level security;
drop policy if exists "dividends: staff all" on public.dividends;
create policy "dividends: staff all" on public.dividends for all using (public.is_staff()) with check (public.is_staff());

-- T5 boxes per recipient for a calendar year.
--   Non-eligible: box 10 actual, box 11 taxable (x1.15), box 12 credit (9.0301% of box 11).
--   Eligible:     box 24 actual, box 25 taxable (x1.38), box 26 credit (15.0198% of box 25).
create or replace function public.t5_summary(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(x order by x->>'recipient') from (
    select jsonb_build_object(
      'recipient', recipient, 'recipient_type', min(recipient_type),
      'payments', count(*),
      'box10', round(coalesce(sum(amount) filter (where not eligible), 0), 2),
      'box11', round(coalesce(sum(amount) filter (where not eligible), 0) * 1.15, 2),
      'box12', round(coalesce(sum(amount) filter (where not eligible), 0) * 1.15 * 0.090301, 2),
      'box24', round(coalesce(sum(amount) filter (where eligible), 0), 2),
      'box25', round(coalesce(sum(amount) filter (where eligible), 0) * 1.38, 2),
      'box26', round(coalesce(sum(amount) filter (where eligible), 0) * 1.38 * 0.150198, 2),
      'slip_needed', sum(amount) >= 50) as x
      from public.dividends where extract(year from paid_on) = p_year
     group by recipient) q), '[]'::jsonb);
end;
$$;
revoke execute on function public.t5_summary(integer) from public, anon;
grant execute on function public.t5_summary(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Getting-started tour
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists tour_dismissed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 6. Fees billed separately follow the month's fee (promo respected)
-- ---------------------------------------------------------------------------
create or replace function public.landlord_year_report(p_owner_id uuid, p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  y0 date := make_date(p_year, 1, 1);
  y1 date := least(make_date(p_year, 12, 1), date_trunc('month', current_date)::date);
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
             -- Fee the landlord pays IRep separately (e.g. by Square): not taken from rent, but still their expense.
             + case when s.fee_billed_separately and s.rent_expected > 0
                    then coalesce(public.property_fee_for_month(s.property_id, s.period), 0) else 0 end
             as management_fee,
           s.mgmt_fee_hst
             + case when s.fee_billed_separately and s.rent_expected > 0
                    then round(coalesce(public.property_fee_for_month(s.property_id, s.period), 0)
                               * coalesce((select amount from public.service_rates where key = 'hst'), 13) / 100, 2) else 0 end
             as management_hst,
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
  last_month date := least(make_date(p_year, 12, 1), date_trunc('month', current_date)::date);
  hst_pct numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
  expense_cats text[] := array['lawn_snow_payouts', 'cleaning', 'office_supplies', 'payprop', 'banking', 'docusign',
                               'accounting', 'insurance', 'phone', 'software', 'office', 'vehicle', 'miscellaneous', 'other_expense'];
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return (with base as (select jsonb_build_object(
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
    -- IRep's own income and costs by month, up to the current month. The website's figures
    -- (statements, leasing fees, commissions) plus irep_year_entries for anything it doesn't
    -- hold: months before the website, lawn/snow, and IRep's own expenses.
    'irep_income', coalesce((select jsonb_agg(jsonb_build_object(
        'period', mo,
        'management_fees', coalesce((select sum(mgmt_fee) from public.owner_statement_totals where period = mo), 0)
                         + coalesce((select sum(public.property_fee_for_month(p.id, s.period)) from public.owner_statement_totals s join public.properties p on p.id = s.property_id
                                      where s.period = mo and s.fee_billed_separately and s.rent_expected > 0), 0)
                         + e.management_fee,
        'management_hst', coalesce((select sum(mgmt_fee_hst) from public.owner_statement_totals where period = mo), 0)
                         + coalesce((select sum(round(public.property_fee_for_month(p.id, s.period) * hst_pct / 100, 2)) from public.owner_statement_totals s join public.properties p on p.id = s.property_id
                                      where s.period = mo and s.fee_billed_separately and s.rent_expected > 0), 0)
                         + e.management_hst,
        'leasing_fees', coalesce((select sum(fee) from public.leasing_fee_lines where period = mo), 0) + e.leasing_fee,
        'leasing_hst', coalesce((select sum(hst) from public.leasing_fee_lines where period = mo), 0) + e.leasing_hst,
        'leasing_fees_incl_hst', coalesce((select sum(fee_incl_hst) from public.leasing_fee_lines where period = mo), 0) + e.leasing_fee + e.leasing_hst,
        'lawn_snow', e.lawn_snow,
        'lawn_snow_hst', e.lawn_snow_hst,
        'other_income', e.other_income,
        'commissions_paid', coalesce((select sum(amount) from public.commission_payments where paid_on >= mo and paid_on < mo + interval '1 month'), 0) + e.agent_payouts,
        'expenses', e.expenses,
        'expenses_hst', e.expenses_hst,
        'loan_repaid', coalesce((select sum(amount) from public.loan_repayments where paid_on >= mo and paid_on < mo + interval '1 month'), 0))
        order by mo)
      from generate_series(y0, last_month, interval '1 month') g0(m0)
      cross join lateral (select m0::date as mo) g
      cross join lateral (
        select coalesce(sum(amount) filter (where category = 'management_fee'), 0) as management_fee,
               coalesce(sum(hst) filter (where category = 'management_fee'), 0) as management_hst,
               coalesce(sum(amount) filter (where category = 'leasing_fee'), 0) as leasing_fee,
               coalesce(sum(hst) filter (where category = 'leasing_fee'), 0) as leasing_hst,
               coalesce(sum(amount) filter (where category = 'lawn_snow'), 0) as lawn_snow,
               coalesce(sum(hst) filter (where category = 'lawn_snow'), 0) as lawn_snow_hst,
               coalesce(sum(amount) filter (where category = 'other_income'), 0) as other_income,
               coalesce(sum(amount) filter (where category = 'agent_payouts'), 0) as agent_payouts,
               coalesce(sum(amount) filter (where category = any (expense_cats)), 0) as expenses,
               coalesce(sum(hst) filter (where category = any (expense_cats)), 0) as expenses_hst
          from public.irep_cost_lines where period = g.mo) e), '[]'::jsonb),
    -- IRep's expenses for the year by category (workbook entries plus bank lines marked IRep expense).
    'irep_expenses', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amt, 'hst', h, 'from_bank', fb) order by amt desc)
       from (select category, sum(amount) amt, sum(hst) h, sum(amount) filter (where source = 'bank') fb from public.irep_cost_lines
              where period between y0 and last_month and category = any (expense_cats || array['agent_payouts'])
              group by category) x), '[]'::jsonb),
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
  ) as j)
  select j || jsonb_build_object(
    'hst_collected', jsonb_build_object(
        'management', (select coalesce(sum((m->>'management_hst')::numeric), 0) from jsonb_array_elements(j->'irep_income') m),
        'leasing', (select coalesce(sum((m->>'leasing_hst')::numeric), 0) from jsonb_array_elements(j->'irep_income') m),
        'lawn_snow', (select coalesce(sum((m->>'lawn_snow_hst')::numeric), 0) from jsonb_array_elements(j->'irep_income') m),
        'itcs', (select coalesce(sum((m->>'expenses_hst')::numeric), 0) from jsonb_array_elements(j->'irep_income') m)))
  from base);
end;
$$;
revoke execute on function public.fiscal_year_summary(integer) from public, anon;
grant execute on function public.fiscal_year_summary(integer) to authenticated, service_role;
