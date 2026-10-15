-- IRep Property Management: one call that powers the staff dashboard.
-- Returns a JSON summary of rent, arrears, payouts, occupancy, turnovers,
-- maintenance, leasing, notices, renewals and what's coming up. Staff only.
-- Run AFTER 0012. Safe to re-run.

create or replace function public.staff_dashboard(p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := coalesce(p_today, (now() at time zone 'America/Toronto')::date);
  m date := date_trunc('month', coalesce(p_today, (now() at time zone 'America/Toronto')::date))::date;
  prev date := (date_trunc('month', coalesce(p_today, (now() at time zone 'America/Toronto')::date)) - interval '1 month')::date;
  hst numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
  result jsonb;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Staff only';
  end if;

  select jsonb_build_object(
    'today', today,
    'month', m,

    -- Rent this month (charges for this month vs payments toward it).
    'rent', (select jsonb_build_object(
        'expected', coalesce(sum(due), 0),
        'collected', coalesce(sum(least(paid, due)), 0),
        'collected_by_7th', coalesce(sum(least(paid_by_7th, due)), 0),
        'outstanding', coalesce(sum(greatest(outstanding, 0)), 0),
        'tenancies_due', count(*),
        'tenancies_paid', count(*) filter (where outstanding <= 0),
        'tenancies_unpaid', count(*) filter (where paid = 0),
        'tenancies_partial', count(*) filter (where paid > 0 and outstanding > 0))
      from public.rent_collection where period = m),

    -- Rent collected by month, last 6 months (for a trend chart).
    'rent_trend', coalesce((select jsonb_agg(jsonb_build_object(
        'month', period, 'expected', expected, 'collected', collected) order by period)
      from (select period, sum(due) expected, sum(least(paid, due)) collected
              from public.rent_collection
             where period between (m - interval '5 months')::date and m
             group by period) x), '[]'::jsonb),

    -- Everyone who owes rent that's due.
    'arrears', (select jsonb_build_object(
        'total', coalesce(sum(b.balance), 0),
        'count', count(*),
        'top', coalesce((select jsonb_agg(r order by (r->>'balance')::numeric desc) from (
            select jsonb_build_object(
                'tenancy_id', b2.tenancy_id, 'unit_id', u.id, 'property_id', u.property_id,
                'address', p.address, 'unit', u.label, 'balance', b2.balance, 'last_paid_on', b2.last_paid_on,
                'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = b2.tenancy_id
                            order by is_primary desc, created_at limit 1),
                'has_n4', exists (select 1 from public.notices n where n.tenancy_id = b2.tenancy_id
                                   and n.form = 'N4' and n.status in ('served', 'filed_ltb'))) as r
              from public.tenancy_balances b2
              join public.tenancies t on t.id = b2.tenancy_id
              join public.units u on u.id = t.unit_id
              join public.properties p on p.id = u.property_id
             where b2.balance > 0
             order by b2.balance desc limit 10) y), '[]'::jsonb))
      from public.tenancy_balances b where b.balance > 0),

    -- Payments waiting to be matched to a tenant.
    'to_match', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
      from public.payments where status = 'unmatched'),

    -- Money to send landlords (this month and last month).
    'payouts', (select jsonb_build_object(
        'to_pay', coalesce(sum(greatest(to_pay, 0)), 0),
        'properties_to_pay', count(*) filter (where to_pay > 0),
        'ready_now', count(*) filter (where to_pay > 0 and (full_by_7th or period < m)))
      from public.owner_statement_totals where period in (m, prev)),

    -- IRep's own income this month, before HST: management fees + leasing fees.
    'irep_income', (select jsonb_build_object(
        'management_fees', coalesce((select sum(mgmt_fee) from public.owner_statement_totals where period = m), 0),
        'leasing_fees', coalesce((select round(sum(-amount) / (1 + hst / 100), 2) from public.statement_items
                                   where period = m and kind = 'leasing_fee'), 0))),

    -- Units (managed only).
    'occupancy', (select jsonb_build_object(
        'units', count(*),
        'occupied', count(*) filter (where status = 'occupied'),
        'vacant', count(*) filter (where status = 'vacant'),
        'turnover', count(*) filter (where status = 'turnover'),
        'offline', count(*) filter (where status = 'offline'),
        'properties', (select count(*) from public.properties where not archived),
        'monthly_rent_roll', (select coalesce(sum(rent), 0) from public.tenancies where status in ('active', 'notice')))
      from public.units where management_type = 'managed'),

    'turnovers', (select jsonb_build_object(
        'open', count(*),
        'by_status', jsonb_build_object(
            'notice', count(*) filter (where t.status = 'notice'),
            'make_ready', count(*) filter (where t.status = 'make_ready'),
            'ready', count(*) filter (where t.status = 'ready'),
            'listed', count(*) filter (where t.status = 'listed')),
        'list', coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'status', t.status, 'address', p.address, 'unit', u.label,
            'move_out_date', t.move_out_date,
            'days_vacant', case when t.status <> 'notice' then today - coalesce(t.move_out_date, t.created_at::date) end,
            'tasks_done', (select count(*) from public.turnover_tasks k where k.turnover_id = t.id and (k.done or k.not_needed)),
            'tasks_total', (select count(*) from public.turnover_tasks k where k.turnover_id = t.id))
          order by coalesce(t.move_out_date, t.created_at::date)), '[]'::jsonb))
      from public.turnovers t join public.units u on u.id = t.unit_id join public.properties p on p.id = u.property_id
     where t.status not in ('leased', 'cancelled')),

    'maintenance', (select jsonb_build_object(
        'open', count(*) filter (where status not in ('completed', 'cancelled')),
        'new', count(*) filter (where status = 'new'),
        'emergencies', count(*) filter (where urgency = 'emergency' and status not in ('completed', 'cancelled')),
        'awaiting_owner', count(*) filter (where owner_approval = 'pending' and status not in ('completed', 'cancelled')),
        'scheduled_next_7_days', count(*) filter (where status = 'scheduled'
                                   and (scheduled_for at time zone 'America/Toronto')::date between today and today + 7),
        'completed_this_month', count(*) filter (where status = 'completed'
                                   and (completed_at at time zone 'America/Toronto')::date >= m))
      from public.maintenance_requests),

    'leasing', jsonb_build_object(
        'listings_available', (select count(*) from public.listings where status = 'available'),
        'listings_draft', (select count(*) from public.listings where status = 'draft'),
        'showings_requested', (select count(*) from public.showing_requests where status = 'requested'),
        'showings_upcoming', (select count(*) from public.showing_requests where status = 'confirmed'),
        'applications_new', (select count(*) from public.applications where status in ('submitted', 'reviewing')),
        'landlord_inquiries_new', (select count(*) from public.landlord_inquiries where status = 'new')),

    -- Move-outs, lease ends and agreement renewals in the next 60 days (or overdue).
    'upcoming', jsonb_build_object(
      'move_outs', coalesce((select jsonb_agg(jsonb_build_object(
            'address', p.address, 'unit', u.label, 'date', t.move_out_date,
            'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                        order by is_primary desc, created_at limit 1)) order by t.move_out_date)
          from public.tenancies t join public.units u on u.id = t.unit_id join public.properties p on p.id = u.property_id
         where t.status = 'notice' and t.move_out_date between today - 7 and today + 60), '[]'::jsonb),
      'leases_ending', coalesce((select jsonb_agg(jsonb_build_object(
            'address', p.address, 'unit', u.label, 'date', t.end_date,
            'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                        order by is_primary desc, created_at limit 1)) order by t.end_date)
          from public.tenancies t join public.units u on u.id = t.unit_id join public.properties p on p.id = u.property_id
         where t.status = 'active' and t.end_date between today and today + 60), '[]'::jsonb),
      'agreement_renewals', coalesce((select jsonb_agg(jsonb_build_object(
            'property_id', p.id, 'address', p.address,
            'owner', (select name from public.owners o where o.id = p.owner_id),
            'renewal', p.agreement_renewal, 'notice_sent_on', p.renewal_notice_sent_on) order by p.agreement_renewal)
          from public.properties p
         where not p.archived and p.agreement_renewal is not null and p.agreement_renewal <= today + 60), '[]'::jsonb),
      -- Tenancies whose 12 months since start (or the last N1 increase) fall within 120 days:
      -- time to check whether an N1 (90 days' notice) should go out. Exempt units still need checking by hand.
      'rent_increase_review', coalesce((select jsonb_agg(jsonb_build_object(
            'tenancy_id', x.id, 'address', x.address, 'unit', x.unit, 'rent', x.rent, 'eligible_on', x.eligible_on,
            'tenant', x.tenant) order by x.eligible_on)
          from (select t.id, p.address, u.label as unit, t.rent,
                       (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                         order by is_primary desc, created_at limit 1) as tenant,
                       (coalesce((select max(n.effective_date) from public.notices n
                                   where n.tenancy_id = t.id and n.form = 'N1' and n.status <> 'void'),
                                 t.start_date) + interval '12 months')::date as eligible_on
                  from public.tenancies t join public.units u on u.id = t.unit_id join public.properties p on p.id = u.property_id
                 where t.status = 'active' and u.management_type = 'managed'
                   and not exists (select 1 from public.notices n where n.tenancy_id = t.id and n.form = 'N1'
                                    and n.status = 'served' and n.served_on > today - 365)) x
         where x.eligible_on <= today + 120), '[]'::jsonb)),

    'notices', (select jsonb_build_object(
        'open', count(*) filter (where n.status in ('served', 'filed_ltb')),
        'served_this_month', count(*) filter (where n.served_on >= m),
        'list', coalesce(jsonb_agg(jsonb_build_object(
            'id', n.id, 'form', n.form, 'status', n.status, 'served_on', n.served_on,
            'effective_date', n.effective_date, 'amount', n.amount, 'address', p.address, 'unit', u.label,
            'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = n.tenancy_id
                        order by is_primary desc, created_at limit 1)) order by n.served_on desc)
          filter (where n.status in ('served', 'filed_ltb')), '[]'::jsonb))
      from public.notices n join public.tenancies t on t.id = n.tenancy_id
      join public.units u on u.id = t.unit_id join public.properties p on p.id = u.property_id),

    'letters', (select jsonb_build_object(
        'period', prev,
        'drafts', count(*) filter (where status = 'draft'),
        'sent', count(*) filter (where status = 'sent'))
      from public.owner_letters where period = prev),

    'owners', (select jsonb_build_object(
        'total', count(*), 'portal_linked', count(*) filter (where profile_id is not null))
      from public.owners)
  ) into result;

  return result;
end;
$$;
revoke execute on function public.staff_dashboard(date) from public, anon;
grant execute on function public.staff_dashboard(date) to authenticated, service_role;
