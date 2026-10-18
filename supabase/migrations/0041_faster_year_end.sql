-- 0041: year end loads in about a second: read the landlord statement view once instead of dozens of times.
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
  return (with ost as materialized (select * from public.owner_statement_totals), base as (select jsonb_build_object(
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
        'management_fees', coalesce((select sum(mgmt_fee) from ost where period = mo), 0)
                         + coalesce((select sum(public.property_fee_for_month(p.id, s.period)) from ost s join public.properties p on p.id = s.property_id
                                      where s.period = mo and s.fee_billed_separately and s.rent_expected > 0), 0)
                         + e.management_fee,
        'management_hst', coalesce((select sum(mgmt_fee_hst) from ost where period = mo), 0)
                         + coalesce((select sum(round(public.property_fee_for_month(p.id, s.period) * hst_pct / 100, 2)) from ost s join public.properties p on p.id = s.property_id
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
          'balance_dec31', coalesce((select sum(t.to_pay) from ost t
                                       join public.properties p2 on p2.id = t.property_id
                                      where p2.owner_id = o.id and t.period <= make_date(p_year, 12, 1)), 0)) x
          from public.owners o
          left join public.properties p on p.owner_id = o.id
          left join ost s on s.property_id = p.id and s.period between y0 and make_date(p_year, 12, 1)
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
