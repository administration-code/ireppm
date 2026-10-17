-- IRep Property Management: the year-end report only counts months up to the current one.
-- Statements for next month exist early, but their rent and fees aren't counted until that month
-- arrives. Run AFTER 0027. Safe to re-run.

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
                    then coalesce((select monthly_fee from public.properties where id = s.property_id), 0) else 0 end
             as management_fee,
           s.mgmt_fee_hst
             + case when s.fee_billed_separately and s.rent_expected > 0
                    then round(coalesce((select monthly_fee from public.properties where id = s.property_id), 0)
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
