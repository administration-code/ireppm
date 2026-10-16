-- IRep Property Management: the management fee is based on a unit count entered by
-- staff for each property (not on leases, tenants or unit records).
--   standard fee = package base fee (property + first unit) + $25 × (units − 1)
-- Properties on an agreed price keep a custom fee. Run AFTER 0015. Safe to re-run.

-- Package base fees (Standard already exists as base_fee).
insert into public.service_rates (key, name, category, amount, unit, notes, sort_order) values
  ('base_fee_maintenance', 'Base fee, Maintenance package', 'management', 275, 'per_month', 'Covers the property and its first unit', 11),
  ('base_fee_protection', 'Base fee, Protection package', 'management', 325, 'per_month', 'Covers the property and its first unit', 12)
on conflict (key) do nothing;
update public.service_rates
   set notes = 'Per unit beyond the first, using the unit count entered on the property (not leases or tenants).'
 where key = 'additional_unit';

alter table public.properties add column if not exists unit_count integer;
alter table public.properties add column if not exists custom_fee boolean not null default false;

-- What the fee would be at list price. Commercial and unknown packages have no list price.
create or replace function public.standard_management_fee(p_package text, p_units integer)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(p_package, 'standard')
           when 'standard' then (select amount from public.service_rates where key = 'base_fee')
           when 'maintenance' then (select amount from public.service_rates where key = 'base_fee_maintenance')
           when 'protection' then (select amount from public.service_rates where key = 'base_fee_protection')
         end
       + (select amount from public.service_rates where key = 'additional_unit') * greatest(coalesce(p_units, 1) - 1, 0)
$$;
grant execute on function public.standard_management_fee(text, integer) to authenticated, service_role;

-- Backfill once: unit count = managed units on file (at least 1). Fees already set stay as they
-- are; any that don't match list price are marked custom so billing doesn't change.
update public.properties pr
   set unit_count = greatest(1, (select count(*) from public.units u
                                  where u.property_id = pr.id and u.management_type = 'managed'))
 where unit_count is null;
update public.properties
   set custom_fee = true
 where monthly_fee is not null
   and monthly_fee is distinct from public.standard_management_fee(management_package, unit_count);

alter table public.properties alter column unit_count set default 1;
alter table public.properties alter column unit_count set not null;
alter table public.properties drop constraint if exists properties_unit_count_check;
alter table public.properties add constraint properties_unit_count_check check (unit_count between 1 and 500);

-- Keep monthly_fee (what statements charge) in step with the unit count unless the fee is custom.
create or replace function public.properties_fee_rules()
returns trigger language plpgsql as $$
declare
  std numeric;
begin
  if new.custom_fee then
    return new;
  end if;
  std := public.standard_management_fee(new.management_package, new.unit_count);
  if std is null then
    new.custom_fee := true;          -- e.g. commercial: no list price, keep what staff entered
  else
    new.monthly_fee := std;
  end if;
  return new;
end;
$$;
drop trigger if exists properties_fee_rules on public.properties;
create trigger properties_fee_rules before insert or update of unit_count, management_package, custom_fee, monthly_fee
  on public.properties for each row execute function public.properties_fee_rules();
