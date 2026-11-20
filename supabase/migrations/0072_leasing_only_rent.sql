-- 0072: leasing-only units (IRep found the tenant; rent is paid to the landlord directly) get no
-- rent charges, so they never show as unpaid or in arrears on the rent board, N4 lists or the
-- owner portal. Same as 0008's generate_rent_charges otherwise.

create or replace function public.generate_rent_charges(p_month date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Staff only';
  end if;
  insert into public.rent_charges (tenancy_id, period, kind, amount, description)
  select t.id, m, 'rent', t.rent, to_char(m, 'FMMonth YYYY') || ' rent'
    from public.tenancies t
    join public.units u on u.id = t.unit_id
   where t.status in ('active', 'notice', 'upcoming', 'ended')
     and u.management_type = 'managed'
     and t.start_date <= m_end
     and (t.move_out_date is null or t.move_out_date >= m)
     and not (t.status = 'ended' and t.move_out_date is null)
     and (t.prepaid_through is null or t.prepaid_through < m)
  on conflict (tenancy_id, period) where kind = 'rent' do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
