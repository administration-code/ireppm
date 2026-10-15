-- Balances count only rent that is due (this month and earlier), so opening a
-- future month on the rent page doesn't make everyone look behind.
-- Also: per-month balances for month-end letters. Run AFTER 0010. Safe to re-run.

create or replace view public.tenancy_balances
with (security_invoker = true) as
  select t.id as tenancy_id,
         coalesce(c.total, 0) as charged,
         coalesce(p.total, 0) as paid,
         coalesce(c.total, 0) - coalesce(p.total, 0) as balance,
         p.last_paid_on
    from public.tenancies t
    left join (select tenancy_id, sum(amount) total from public.rent_charges
                where period <= (now() at time zone 'America/Toronto')::date
                group by tenancy_id) c on c.tenancy_id = t.id
    left join (select tenancy_id, sum(amount) total, max(received_on) last_paid_on
                 from public.payments
                where status = 'matched' and kind = 'rent'
                group by tenancy_id) p on p.tenancy_id = t.id;

-- What a tenancy owed at the end of a given month (rent for later months ignored).
create or replace function public.tenancy_balance_at(p_tenancy_id uuid, p_period date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(amount) from public.rent_charges
                    where tenancy_id = p_tenancy_id and period <= date_trunc('month', p_period)::date), 0)
       - coalesce((select sum(amount) from public.payments
                    where tenancy_id = p_tenancy_id and status = 'matched' and kind = 'rent'
                      and coalesce(period, date_trunc('month', received_on)::date) <= date_trunc('month', p_period)::date), 0)
$$;
revoke execute on function public.tenancy_balance_at(uuid, date) from public, anon;
grant execute on function public.tenancy_balance_at(uuid, date) to service_role;

-- Month-end letters: arrears as of the end of that month.
create or replace function public.owner_letter_data(p_owner_id uuid, p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_period)::date;
  m_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  result jsonb;
begin
  if not (public.is_staff() or public.is_owner_account(p_owner_id) or auth.uid() is null) then
    raise exception 'Not allowed';
  end if;

  select jsonb_build_object(
    'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email),
    'period', m,
    'properties', coalesce((
      select jsonb_agg(prop order by prop->>'address')
      from (
        select jsonb_build_object(
          'property_id', pr.id,
          'address', pr.address, 'city', pr.city, 'postal_code', pr.postal_code,
          'statement', (select to_jsonb(s) - 'property_id' from public.owner_statement_totals s
                         where s.property_id = pr.id and s.period = m),
          'rent', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', l.unit_label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = l.tenancy_id
                                 order by is_primary desc, created_at limit 1),
                     'received_on', l.received_on, 'rent_period', l.rent_period, 'amount', l.amount,
                     'kind', l.kind, 'method', l.method, 'counts', l.counts_toward_statement)
                   order by l.unit_label, l.received_on)
              from public.owner_statement_payments l
             where l.property_id = pr.id and l.period = m), '[]'::jsonb),
          'items', coalesce((
            select jsonb_agg(jsonb_build_object('kind', i.kind, 'description', i.description, 'amount', i.amount)
                   order by i.created_at)
              from public.statement_items i where i.property_id = pr.id and i.period = m), '[]'::jsonb),
          'payouts', coalesce((
            select jsonb_agg(jsonb_build_object('paid_on', po.paid_on, 'amount', po.amount, 'method', po.method)
                   order by po.paid_on)
              from public.owner_payouts po where po.property_id = pr.id and po.period = m), '[]'::jsonb),
          'arrears', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                                 order by is_primary desc, created_at limit 1),
                     'balance', b.balance) order by b.balance desc)
              from public.tenancies t
              join public.units u on u.id = t.unit_id
              cross join lateral (select public.tenancy_balance_at(t.id, m) as balance) b
             where u.property_id = pr.id and b.balance > 0), '[]'::jsonb),
          'notices', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                                 order by is_primary desc, created_at limit 1),
                     'form', n.form, 'title', n.title, 'served_on', n.served_on,
                     'effective_date', n.effective_date, 'amount', n.amount, 'status', n.status)
                   order by n.served_on)
              from public.notices n
              join public.tenancies t on t.id = n.tenancy_id
              join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and n.served_on between m and m_end and n.status <> 'void'), '[]'::jsonb),
          'new_tenancies', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'start_date', t.start_date, 'end_date', t.end_date, 'rent', t.rent,
                     'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at)
                                   from public.tenancy_tenants tt where tt.tenancy_id = t.id))
                   order by t.start_date)
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.start_date between m and m_end
               and not t.start_date_estimated), '[]'::jsonb),
          'ended_tenancies', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'move_out_date', coalesce(t.move_out_date, t.end_date),
                     'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at)
                                   from public.tenancy_tenants tt where tt.tenancy_id = t.id))
                   order by coalesce(t.move_out_date, t.end_date))
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.status in ('notice', 'ended')
               and coalesce(t.move_out_date, t.end_date) between m and m_end), '[]'::jsonb),
          'upcoming_move_outs', coalesce((
            select jsonb_agg(jsonb_build_object('unit', u.label, 'move_out_date', t.move_out_date) order by t.move_out_date)
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.status = 'notice' and t.move_out_date > m_end), '[]'::jsonb),
          'work_orders', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'title', mr.title, 'category', mr.category, 'status', mr.status,
                     'reported_on', (mr.created_at at time zone 'America/Toronto')::date,
                     'completed_on', (mr.completed_at at time zone 'America/Toronto')::date,
                     'cost', case when mr.charge_to = 'owner' then mr.actual_cost end,
                     'charge_to', mr.charge_to)
                   order by mr.created_at)
              from public.maintenance_requests mr join public.units u on u.id = mr.unit_id
             where u.property_id = pr.id and mr.status <> 'cancelled'
               and ((mr.created_at at time zone 'America/Toronto')::date between m and m_end
                    or (mr.completed_at at time zone 'America/Toronto')::date between m and m_end
                    or (mr.status not in ('completed', 'cancelled') and (mr.created_at at time zone 'America/Toronto')::date <= m_end))),
            '[]'::jsonb),
          'vacant_units', coalesce((
            select jsonb_agg(u.label order by u.label) from public.units u
             where u.property_id = pr.id and u.status in ('vacant', 'turnover') and u.management_type = 'managed'), '[]'::jsonb)
        ) as prop
        from public.properties pr
        where pr.owner_id = o.id and not pr.archived
      ) x), '[]'::jsonb)
  ) into result
  from public.owners o where o.id = p_owner_id;

  return result;
end;
$$;
revoke execute on function public.owner_letter_data(uuid, date) from public, anon;
grant execute on function public.owner_letter_data(uuid, date) to authenticated, service_role;
