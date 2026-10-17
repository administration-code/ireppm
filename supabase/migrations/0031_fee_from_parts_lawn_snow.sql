-- IRep Property Management: the management fee is built from its parts, as landlords are billed:
--   base fee (property + first unit) + additional units + add-ons (lawn/snow, surveillance, ...)
--   - any discount, + HST.
--   * properties.fee_discount holds the agreed discount (a negative number is a surcharge).
--     Existing fees don't change: each property's discount is set to list price - current fee.
--   * Adding or removing an add-on now changes the fee. Ticking "custom fee" and typing a fee
--     still works: the discount is worked out from it.
--   * Lawn/snow inside the fee is IRep income passed on to the contractor (Chuck), so the Year End
--     page shows it apart from the management fee, with the contractor cost alongside.
--   * Bank lines for the truck (plates etc.) group as a vehicle cost.
-- Run AFTER 0030. Safe to re-run.

alter table public.properties add column if not exists fee_discount numeric(10, 2) not null default 0;

-- Monthly add-ons for a property (property price, else the standard rate).
create or replace function public.property_addons_monthly(p_property_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(a.monthly_price, r.amount)), 0)
    from public.property_addons a join public.service_rates r on r.key = a.addon_key
   where a.property_id = p_property_id and r.unit = 'per_month'
$$;
grant execute on function public.property_addons_monthly(uuid) to authenticated, service_role;

create or replace function public.property_lawn_snow(p_property_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select coalesce(a.monthly_price, r.amount)
                     from public.property_addons a join public.service_rates r on r.key = a.addon_key
                    where a.property_id = p_property_id and a.addon_key = 'snow_lawn'), 0)
$$;
grant execute on function public.property_lawn_snow(uuid) to authenticated, service_role;

-- The fee, line by line, for the property page and statements.
create or replace function public.property_fee_breakdown(p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  base numeric;
  per_unit numeric := coalesce((select amount from public.service_rates where key = 'additional_unit'), 25);
  hst numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
begin
  if not (public.is_staff() or auth.uid() is null
          or exists (select 1 from public.properties x where x.id = p_property_id and public.is_owner_account(x.owner_id))) then
    raise exception 'Not allowed';
  end if;
  select * into p from public.properties where id = p_property_id;
  if not found then return null; end if;
  base := public.standard_management_fee(p.management_package, 1);
  return jsonb_build_object(
    'has_list_price', base is not null,
    'base', base,
    'extra_units', greatest(p.unit_count - 1, 0),
    'per_unit', per_unit,
    'extra_units_amount', per_unit * greatest(p.unit_count - 1, 0),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('key', a.addon_key, 'name', r.name,
                                         'amount', coalesce(a.monthly_price, r.amount)) order by r.sort_order)
                          from public.property_addons a join public.service_rates r on r.key = a.addon_key
                         where a.property_id = p.id and r.unit = 'per_month'), '[]'::jsonb),
    'addons_amount', public.property_addons_monthly(p.id),
    'discount', p.fee_discount,
    'fee', p.monthly_fee,
    'hst', round(coalesce(p.monthly_fee, 0) * hst / 100, 2),
    'lawn_snow', public.property_lawn_snow(p.id));
end;
$$;
grant execute on function public.property_fee_breakdown(uuid) to authenticated, service_role;

-- fee = base + extra units + add-ons - discount. A custom fee typed by staff sets the discount.
create or replace function public.properties_fee_rules()
returns trigger language plpgsql as $$
declare
  std numeric;
  list numeric;
begin
  std := public.standard_management_fee(new.management_package, new.unit_count);
  if std is null then
    new.custom_fee := true;          -- e.g. commercial: no list price, keep what staff entered
    return new;
  end if;
  list := std + public.property_addons_monthly(new.id);
  if new.custom_fee and new.monthly_fee is not null then
    new.fee_discount := list - new.monthly_fee;
    new.custom_fee := false;         -- from now on the fee follows its parts
  else
    new.monthly_fee := greatest(list - coalesce(new.fee_discount, 0), 0);
  end if;
  return new;
end;
$$;
drop trigger if exists properties_fee_rules on public.properties;
create trigger properties_fee_rules before insert or update of unit_count, management_package, custom_fee, monthly_fee, fee_discount
  on public.properties for each row execute function public.properties_fee_rules();

-- Changing a property's add-ons re-works its fee.
create or replace function public.property_addons_refee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.properties set fee_discount = fee_discount
   where id = coalesce(new.property_id, old.property_id);
  return null;
end;
$$;
drop trigger if exists property_addons_refee on public.property_addons;
create trigger property_addons_refee after insert or update or delete on public.property_addons
  for each row execute function public.property_addons_refee();

-- Backfill: keep every fee exactly as it is; record the difference from list price as the discount.
update public.properties p
   set custom_fee = true
 where public.standard_management_fee(p.management_package, p.unit_count) is not null
   and p.monthly_fee is not null;

-- Vehicle costs for IRep's own expenses.
alter table public.irep_year_entries drop constraint if exists irep_year_entries_category_check;
alter table public.irep_year_entries add constraint irep_year_entries_category_check check (category in (
  'management_fee', 'leasing_fee', 'lawn_snow', 'other_income', 'agent_payouts',
  'lawn_snow_payouts', 'cleaning', 'office_supplies', 'payprop', 'banking', 'docusign',
  'accounting', 'insurance', 'phone', 'software', 'office', 'vehicle', 'miscellaneous', 'other_expense'));

-- IRep income/cost lines: workbook entries, bank lines marked IRep expense, and the lawn/snow
-- share of each month's management fee (moved out of management fees, with the contractor cost).
drop view if exists public.irep_cost_lines;
create view public.irep_cost_lines
with (security_invoker = true) as
  select period, category, amount, hst, 'workbook'::text as source, note
    from public.irep_year_entries
  union all
  select date_trunc('month', posted_on)::date,
         case when note ilike 'phone%' then 'phone'
              when note ilike 'payprop%' then 'payprop'
              when note ilike 'petty cash%' then 'miscellaneous'
              when note ~* '(truck|vehicle|plates)' then 'vehicle'
              when note ~* '(docusign)' then 'docusign'
              when note ~* '(frontlobby|wix|vercel|anthropic|software|google|microsoft)' then 'software'
              when note ~* '(execucentre|office)' then 'office'
              when note ~* '(accountant|accounting)' then 'accounting'
              when note ~* 'insurance' then 'insurance'
              else 'other_expense' end,
         -amount, 0, 'bank', note
    from public.bank_transactions
   where category = 'irep_expense' and amount < 0
  union all
  select s.period, x.category, x.sign * l.amt, case when x.category = 'lawn_snow_payouts' then 0 else x.sign * l.tax end,
         'website', 'Lawn/snow part of the management fee'
    from public.owner_statement_totals s
    cross join lateral (select public.property_lawn_snow(s.property_id) as amt) l0
    cross join lateral (select l0.amt as amt,
                               round(l0.amt * coalesce((select amount from public.service_rates where key = 'hst'), 13) / 100, 2) as tax) l
    cross join (values ('management_fee', -1), ('lawn_snow', 1), ('lawn_snow_payouts', 1)) x(category, sign)
   where l.amt > 0 and (s.mgmt_fee > 0 or (s.fee_billed_separately and s.rent_expected > 0));

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
                         + coalesce((select sum(p.monthly_fee) from public.owner_statement_totals s join public.properties p on p.id = s.property_id
                                      where s.period = mo and s.fee_billed_separately and s.rent_expected > 0), 0)
                         + e.management_fee,
        'management_hst', coalesce((select sum(mgmt_fee_hst) from public.owner_statement_totals where period = mo), 0)
                         + coalesce((select sum(round(p.monthly_fee * hst_pct / 100, 2)) from public.owner_statement_totals s join public.properties p on p.id = s.property_id
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
