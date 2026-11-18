-- 0066: landlords see who has paid rent for a month (defaults to this month), tenant by tenant.
create or replace function public.owner_rent_month(p_period date default null)
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
      'due', rc.due,
      'paid', rc.paid,
      'paid_by_7th', rc.paid_by_7th,
      'outstanding', rc.outstanding,
      'last_paid_on', (select max(p.received_on) from public.payments p
                        where p.tenancy_id = t.id and p.period = rc.period and p.status = 'matched' and p.kind = 'rent')
    ) as row
    from public.owners o
    join public.properties pr on pr.owner_id = o.id and not pr.archived
    join public.units u on u.property_id = pr.id
    join public.tenancies t on t.unit_id = u.id
    join public.rent_collection rc on rc.tenancy_id = t.id
    where public.is_owner_account(o.id)
      and rc.period = date_trunc('month', coalesce(p_period, (now() at time zone 'America/Toronto')::date))::date
  ) x
$$;
revoke execute on function public.owner_rent_month(date) from public, anon;
grant execute on function public.owner_rent_month(date) to authenticated;
