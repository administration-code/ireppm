-- 0040: No monthly management fee for a month where every tenancy paying rent at the property is new
-- that month (first + last, less the leasing fee, goes to the landlord). The exception is the first month
-- IRep manages the property (agreement_start), when the management fee is taken from the new tenants too.
create or replace view public.owner_statements as
with hst as (
  select coalesce((select amount from public.service_rates where key = 'hst'), 13::numeric) as pct
), pay as (
  select u.property_id, p.amount, p.kind, p.method,
         case when p.kind = 'rent'
              then greatest(coalesce(p.period, date_trunc('month', p.received_on)::date), date_trunc('month', p.received_on)::date)
              else greatest(date_trunc('month', p.received_on)::date, date_trunc('month', t.start_date)::date)
         end as month
    from public.payments p
    join public.tenancies t on t.id = p.tenancy_id
    join public.units u on u.id = t.unit_id
   where p.status = 'matched'
), exp as (
  select u.property_id,
         date_trunc('month', coalesce(m.completed_at, m.updated_at) at time zone 'America/Toronto')::date as month,
         m.actual_cost as amount
    from public.maintenance_requests m
    join public.units u on u.id = m.unit_id
   where m.status = 'completed' and m.charge_to = 'owner' and coalesce(m.actual_cost, 0) > 0
), months as (
  select u.property_id, c.period as month
    from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id join public.units u on u.id = t.unit_id
   where c.kind = 'rent'
  union select property_id, period from public.statement_items
  union select property_id, period from public.owner_payouts
  union select property_id, month from pay
  union select property_id, month from exp
)
select pr.id as property_id,
       mo.month as period,
       coalesce((select sum(c.amount) from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                   join public.units u on u.id = t.unit_id
                  where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent'), 0) as rent_expected,
       coalesce((select sum(rc.paid_by_7th) from public.rent_collection rc
                  where rc.property_id = pr.id and rc.period = mo.month), 0) as paid_by_7th,
       coalesce((select sum(greatest(rc.outstanding, 0)) from public.rent_collection rc
                  where rc.property_id = pr.id and rc.period = mo.month), 0) as rent_outstanding,
       coalesce((select sum(x.amount) from pay x
                  where x.property_id = pr.id and x.month = mo.month and x.kind = 'rent'
                    and x.method <> all (array['last_month_applied', 'paid_to_owner'])), 0) as rent_collected,
       coalesce((select sum(x.amount) from pay x
                  where x.property_id = pr.id and x.month = mo.month and x.kind = 'last_month_rent'), 0) as last_month_forwarded,
       fee.amount as mgmt_fee,
       round(fee.amount * (select pct from hst) / 100, 2) as mgmt_fee_hst,
       coalesce((select sum(e.amount) from exp e where e.property_id = pr.id and e.month = mo.month), 0) as work_orders,
       coalesce((select sum(i.amount) from public.statement_items i where i.property_id = pr.id and i.period = mo.month), 0) as items_total,
       coalesce((select sum(o.amount) from public.owner_payouts o where o.property_id = pr.id and o.period = mo.month), 0) as paid_out,
       pr.fee_billed_separately
  from public.properties pr
  join (select distinct property_id, month from months) mo on mo.property_id = pr.id
  cross join lateral (
    select case
             when pr.fee_billed_separately then 0::numeric
             -- no rent due this month
             when not exists (select 1 from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                                join public.units u on u.id = t.unit_id
                               where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent') then 0::numeric
             -- every tenancy paying rent this month is new this month, and it isn't IRep's first month managing
             when not exists (select 1 from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                                join public.units u on u.id = t.unit_id
                               where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent'
                                 and date_trunc('month', t.start_date)::date <> mo.month)
                  and date_trunc('month', coalesce(pr.agreement_start,
                        (select min(c.period) from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                           join public.units u on u.id = t.unit_id where u.property_id = pr.id and c.kind = 'rent')))::date <> mo.month
                  then 0::numeric
             else public.property_fee_for_month(pr.id, mo.month)
           end as amount
  ) fee;
