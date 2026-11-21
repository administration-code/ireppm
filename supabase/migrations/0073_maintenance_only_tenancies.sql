-- 0073: maintenance-only tenancies. IRep handles repairs but the landlord collects the rent
-- (e.g. 1525 Hallmark Ave, Upper). The tenant is in the portal and can report repairs, and work
-- orders still go on the landlord's statement as usual, but IRep keeps no rent ledger for them:
--   * tenancies.collects_rent = false: no rent charges, so nothing on the rent board, arrears,
--     N4 lists, PayProp or the owner statement's rent lines. Rent may be 0.
--   * tenancies.rent_from: when a maintenance-only tenancy is switched to rent collection,
--     the first month IRep charges rent (earlier months are never charged).
--   * Repairs charged to such a tenant aren't added to a ledger (bill them by invoice instead).
-- Run AFTER 0072. Safe to re-run.

alter table public.tenancies add column if not exists collects_rent boolean not null default true;
alter table public.tenancies add column if not exists rent_from date
  check (rent_from is null or extract(day from rent_from) = 1);
alter table public.tenancies drop constraint if exists tenancies_rent_when_collected;
alter table public.tenancies add constraint tenancies_rent_when_collected
  check (rent >= 0 and (not collects_rent or rent > 0));

-- Monthly rent charges: managed units, rent-collecting tenancies, from rent_from on.
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
     and t.collects_rent
     and (t.rent_from is null or t.rent_from <= m)
     and t.start_date <= m_end
     and (t.move_out_date is null or t.move_out_date >= m)
     and not (t.status = 'ended' and t.move_out_date is null)
     and (t.prepaid_through is null or t.prepaid_through < m)
  on conflict (tenancy_id, period) where kind = 'rent' do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Repairs charged to the tenant go on their rent ledger, but only where IRep keeps one.
create or replace function public.maintenance_chargeback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and new.charge_to = 'tenant' and new.tenancy_id is not null
     and coalesce(new.actual_cost, 0) > 0
     and coalesce((select t.collects_rent from public.tenancies t where t.id = new.tenancy_id), true) then
    insert into public.rent_charges (tenancy_id, period, kind, amount, description, maintenance_request_id)
    values (new.tenancy_id,
            date_trunc('month', coalesce(new.completed_at, now()) at time zone 'America/Toronto')::date,
            'chargeback', new.actual_cost, 'Repair charged to tenant: ' || new.title, new.id)
    on conflict (maintenance_request_id) where maintenance_request_id is not null
    do update set amount = excluded.amount, description = excluded.description;
  end if;
  return new;
end;
$$;

-- The tenant portal needs to know whether to show rent and payment details.
create or replace view public.my_homes as
 select t.id as tenancy_id,
    t.status,
    t.start_date,
    t.end_date,
    t.rent,
    t.rent_due_day,
    u.id as unit_id,
    u.label as unit_label,
    p.address,
    p.city,
    p.postal_code,
    t.insurance_due,
    t.renewal_choice,
    t.renewal_choice_at,
    t.collects_rent
   from tenancies t
     join units u on u.id = t.unit_id
     join properties p on p.id = u.property_id
  where t.status = any (array['upcoming'::text, 'active'::text, 'notice'::text])
    and exists (select 1 from tenancy_tenants tt where tt.tenancy_id = t.id and tt.profile_id = auth.uid());

-- Rent increase reminders (staff dashboard) and the landlord letter's new-tenancy list.
do $patch$
declare
  d text;
begin
  d := pg_get_functiondef('public.staff_dashboard'::regproc);
  if position('t.collects_rent' in d) = 0 then
    d := replace(d, 'where t.status = ''active'' and u.management_type = ''managed''',
                    'where t.status = ''active'' and u.management_type = ''managed'' and t.collects_rent');
    if position('t.collects_rent' in d) = 0 then raise exception 'staff_dashboard: patch point not found'; end if;
    execute d;
  end if;

  d := pg_get_functiondef('public.owner_letter_data'::regproc);
  if position('''collects_rent''' in d) = 0 then
    d := replace(d, '''rent'', t.rent,', '''rent'', t.rent, ''collects_rent'', t.collects_rent,');
    if position('''collects_rent''' in d) = 0 then raise exception 'owner_letter_data: patch point not found'; end if;
    execute d;
  end if;
end;
$patch$;
