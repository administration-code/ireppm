-- 0064: landlords see who is behind on rent, and the N4s issued, on their statement and in their portal.
-- 1. N-forms signed through DocuSign are logged as notices automatically (and the ones already signed are added now).
-- 2. The monthly statement's Arrears section lists every tenant on the lease and the latest N4 for that tenancy.
-- 3. owner_arrears(): the live list for the landlord portal.

alter table public.notices add column if not exists signature_request_id uuid references public.signature_requests (id) on delete set null;
create unique index if not exists notices_signature_request_once on public.notices (signature_request_id) where signature_request_id is not null;

create or replace function public.log_signed_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.tenancy_id is not null
     and new.kind in ('N1', 'N2', 'N4', 'N5', 'N6', 'N7', 'N8', 'N12', 'N13') then
    insert into public.notices (tenancy_id, form, served_on, effective_date, amount, status, notes, signature_request_id)
    values (new.tenancy_id, new.kind,
            coalesce((new.completed_at at time zone 'America/Toronto')::date, (now() at time zone 'America/Toronto')::date),
            nullif(new.terms->>'effective_date', '')::date,
            nullif(new.terms->>'amount', '')::numeric,
            'served', 'Signed through DocuSign', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.log_signed_notice() from public, anon, authenticated;
drop trigger if exists signature_requests_log_notice on public.signature_requests;
create trigger signature_requests_log_notice after update of status on public.signature_requests
  for each row execute function public.log_signed_notice();

-- The ones already signed.
insert into public.notices (tenancy_id, form, served_on, effective_date, amount, status, notes, signature_request_id)
select s.tenancy_id, s.kind,
       coalesce((s.completed_at at time zone 'America/Toronto')::date, (s.sent_at at time zone 'America/Toronto')::date),
       nullif(s.terms->>'effective_date', '')::date, nullif(s.terms->>'amount', '')::numeric,
       'served', 'Signed through DocuSign', s.id
  from public.signature_requests s
 where s.status = 'completed' and s.tenancy_id is not null
   and s.kind in ('N1', 'N2', 'N4', 'N5', 'N6', 'N7', 'N8', 'N12', 'N13')
   and not exists (select 1 from public.notices n where n.signature_request_id = s.id)
on conflict do nothing;

-- Latest N4 on a tenancy that's still in play (not void, withdrawn or resolved).
create or replace function public.latest_n4(p_tenancy_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('served_on', n.served_on, 'effective_date', n.effective_date, 'amount', n.amount, 'status', n.status)
    from public.notices n
   where n.tenancy_id = p_tenancy_id and n.form = 'N4' and n.status not in ('void', 'withdrawn', 'resolved')
   order by n.served_on desc, n.created_at desc
   limit 1
$$;
revoke execute on function public.latest_n4(uuid) from public, anon, authenticated;

-- 3. Live arrears for the signed-in landlord.
create or replace function public.owner_arrears()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row->>'address', row->>'unit'), '[]'::jsonb) from (
    select jsonb_build_object(
      'address', pr.address,
      'unit', u.label,
      'tenants', (select jsonb_agg(tt.full_name order by tt.is_primary desc, tt.created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id),
      'moved_out', t.status = 'ended',
      'balance', greatest(b.balance, 0),
      'last_paid_on', b.last_paid_on,
      'months', (select jsonb_agg(jsonb_build_object('period', rc.period, 'owing', rc.outstanding) order by rc.period)
                   from public.rent_collection rc
                  where rc.tenancy_id = t.id and rc.outstanding > 0
                    and rc.period <= (now() at time zone 'America/Toronto')::date),
      'n4s', (select jsonb_agg(jsonb_build_object('served_on', n.served_on, 'effective_date', n.effective_date, 'amount', n.amount, 'status', n.status)
                                order by n.served_on desc)
                from public.notices n where n.tenancy_id = t.id and n.form = 'N4' and n.status not in ('void', 'withdrawn'))
    ) as row
    from public.owners o
    join public.properties pr on pr.owner_id = o.id and not pr.archived
    join public.units u on u.property_id = pr.id
    join public.tenancies t on t.unit_id = u.id
    join public.tenancy_balances b on b.tenancy_id = t.id
    where public.is_owner_account(o.id)
      and (b.balance > 0
           or exists (select 1 from public.notices n where n.tenancy_id = t.id and n.form = 'N4'
                       and n.status in ('served', 'filed_ltb', 'order_issued')))
  ) x
$$;
revoke execute on function public.owner_arrears() from public, anon;
grant execute on function public.owner_arrears() to authenticated;

-- 2. Statement data: arrears rows list every tenant on the lease and the latest N4.
create or replace function public.owner_letter_data(p_owner_id uuid, p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
    'properties', coalesce((select jsonb_agg(prop order by prop->>'address') from (
      select jsonb_build_object(
        'property_id', pr.id, 'address', pr.address, 'city', pr.city, 'postal_code', pr.postal_code,
        'statement', (select to_jsonb(s) - 'property_id' from public.owner_statement_totals s where s.property_id = pr.id and s.period = m),
        'rent', coalesce((select jsonb_agg(jsonb_build_object('unit', l.unit_label,
              'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = l.tenancy_id order by is_primary desc, created_at limit 1),
              'received_on', l.received_on, 'rent_period', l.rent_period, 'amount', l.amount, 'kind', l.kind, 'method', l.method, 'counts', l.counts_toward_statement)
            order by l.unit_label, l.received_on)
          from public.owner_statement_payments l where l.property_id = pr.id and l.period = m), '[]'::jsonb),
        'items', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'description', i.description, 'amount', i.amount) order by i.created_at)
          from public.statement_items i where i.property_id = pr.id and i.period = m), '[]'::jsonb),
        'payouts', coalesce((select jsonb_agg(jsonb_build_object('paid_on', po.paid_on, 'amount', po.amount, 'method', po.method) order by po.paid_on)
          from public.owner_payouts po where po.property_id = pr.id and po.period = m), '[]'::jsonb),
        'arrears', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label,
              'tenant', (select string_agg(full_name, ', ' order by is_primary desc, created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id),
              'balance', b.balance,
              'n4', public.latest_n4(t.id)) order by b.balance desc)
          from public.tenancies t join public.units u on u.id = t.unit_id
          cross join lateral (select public.tenancy_balance_at(t.id, m) as balance) b
          where u.property_id = pr.id and b.balance > 0), '[]'::jsonb),
        'notices', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label,
              'tenant', (select string_agg(full_name, ', ' order by is_primary desc, created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id),
              'form', n.form, 'title', n.title, 'served_on', n.served_on, 'effective_date', n.effective_date, 'amount', n.amount, 'status', n.status)
            order by n.served_on)
          from public.notices n join public.tenancies t on t.id = n.tenancy_id join public.units u on u.id = t.unit_id
          where u.property_id = pr.id and n.served_on between m and m_end and n.status <> 'void'), '[]'::jsonb),
        'new_tenancies', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label, 'start_date', t.start_date, 'end_date', t.end_date, 'rent', t.rent,
              'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id))
            order by t.start_date)
          from public.tenancies t join public.units u on u.id = t.unit_id
          where u.property_id = pr.id and t.start_date between m and m_end and not t.start_date_estimated), '[]'::jsonb),
        'ended_tenancies', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label, 'move_out_date', coalesce(t.move_out_date, t.end_date),
              'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id))
            order by coalesce(t.move_out_date, t.end_date))
          from public.tenancies t join public.units u on u.id = t.unit_id
          where u.property_id = pr.id and t.status in ('notice', 'ended') and coalesce(t.move_out_date, t.end_date) between m and m_end), '[]'::jsonb),
        'upcoming_move_outs', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label, 'move_out_date', t.move_out_date) order by t.move_out_date)
          from public.tenancies t join public.units u on u.id = t.unit_id
          where u.property_id = pr.id and t.status = 'notice' and t.move_out_date > m_end), '[]'::jsonb),
        'work_orders', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label, 'title', mr.title, 'category', mr.category, 'status', mr.status,
              'reported_on', (mr.created_at at time zone 'America/Toronto')::date,
              'completed_on', (mr.completed_at at time zone 'America/Toronto')::date,
              'cost', case when mr.charge_to = 'owner' then mr.actual_cost end, 'charge_to', mr.charge_to, 'id', mr.id)
            order by mr.created_at)
          from public.maintenance_requests mr join public.units u on u.id = mr.unit_id
          where u.property_id = pr.id and mr.status <> 'cancelled'
            and ((mr.created_at at time zone 'America/Toronto')::date between m and m_end
              or (mr.completed_at at time zone 'America/Toronto')::date between m and m_end
              or (mr.status not in ('completed', 'cancelled') and (mr.created_at at time zone 'America/Toronto')::date <= m_end))), '[]'::jsonb),
        'vacant_units', coalesce((select jsonb_agg(u.label order by u.label) from public.units u
          where u.property_id = pr.id and u.status in ('vacant', 'turnover') and u.management_type = 'managed'), '[]'::jsonb)
      ) as prop
      from public.properties pr where pr.owner_id = o.id and not pr.archived) x), '[]'::jsonb)
  ) into result
  from public.owners o where o.id = p_owner_id;
  return result;
end;
$function$;
