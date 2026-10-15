-- IRep Property Management: owners, management fees, add-ons and import fields.
-- Run AFTER 0005. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Owners (landlords). One owner can have several properties.
-- ---------------------------------------------------------------------------
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                     -- tracker Landlord ID, e.g. LL06
  name text not null,
  entity_type text not null default 'individual' check (entity_type in ('individual', 'corporation')),
  email text,
  phone text,
  mailing_address text,
  payout_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists owners_touch on public.owners;
create trigger owners_touch before update on public.owners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Properties: owner link, contract and fee details.
-- (owner_name/owner_email/owner_phone stay for now; the owner record is the source of truth.)
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists owner_id uuid references public.owners (id) on delete set null;
alter table public.properties add column if not exists legacy_id text unique;        -- tracker Property ID, e.g. 150Curry
alter table public.properties add column if not exists monthly_fee numeric(10, 2);   -- billed management fee before HST
alter table public.properties add column if not exists agreement_start date;
alter table public.properties add column if not exists agreement_renewal date;
alter table public.properties add column if not exists renewal_notice_sent_on date;
alter table public.properties add column if not exists lot_size_sqft integer;
create index if not exists properties_owner_idx on public.properties (owner_id);

-- ---------------------------------------------------------------------------
-- Rates: the price list (base fee, per-unit fee, add-ons, leasing fees, HST).
-- ---------------------------------------------------------------------------
create table if not exists public.service_rates (
  key text primary key,
  name text not null,
  category text not null check (category in ('management', 'addon', 'leasing', 'tax', 'rent_control')),
  amount numeric(10, 4) not null,
  unit text not null check (unit in ('per_month', 'one_time', 'months_of_rent', 'percent', 'days', 'months')),
  notes text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
drop trigger if exists service_rates_touch on public.service_rates;
create trigger service_rates_touch before update on public.service_rates
  for each row execute function public.touch_updated_at();

insert into public.service_rates (key, name, category, amount, unit, notes, sort_order) values
  ('base_fee', 'Base fee (property + first unit)', 'management', 175, 'per_month', 'Covers the property and its first unit', 10),
  ('additional_unit', 'Each additional unit', 'management', 25, 'per_month', 'Per rentable unit, occupied or not. A whole-home lease is one unit.', 20),
  ('snow_lawn', 'Snow/Lawn', 'addon', 50, 'per_month', 'Standard lots up to 4,500 sq ft; larger lots are quoted', 30),
  ('cleaning', 'Cleaning', 'addon', 150, 'per_month', null, 40),
  ('plumbing', 'Plumbing', 'addon', 35, 'per_month', null, 50),
  ('surveillance', 'Surveillance', 'addon', 15, 'per_month', 'Plus a $100 one-time install', 60),
  ('surveillance_install', 'Surveillance install', 'addon', 100, 'one_time', null, 61),
  ('appliance', 'Appliance', 'addon', 65, 'per_month', null, 70),
  ('leasing_standard', 'Standard leasing fee', 'leasing', 0.5, 'months_of_rent', 'Half a month of rent, plus HST', 80),
  ('leasing_mls', 'MLS leasing fee', 'leasing', 1, 'months_of_rent', 'One full month of rent, plus HST', 90),
  ('hst', 'HST', 'tax', 13, 'percent', 'Applied to billed management and leasing fees', 100),
  ('rent_guideline_2026', '2026 Ontario rent increase guideline', 'rent_control', 2.1, 'percent', 'Units first occupied on or before Nov 15, 2018', 110),
  ('rent_increase_notice', 'Rent increase notice (N1)', 'rent_control', 90, 'days', 'Minimum notice before an increase takes effect', 120),
  ('rent_increase_interval', 'Minimum time between increases', 'rent_control', 12, 'months', 'Per tenant', 130)
on conflict (key) do nothing;

-- Add-ons a property is signed up for (price can be overridden per property, e.g. large lots).
create table if not exists public.property_addons (
  property_id uuid not null references public.properties (id) on delete cascade,
  addon_key text not null references public.service_rates (key),
  monthly_price numeric(10, 2),              -- empty = use the standard rate
  notes text,
  created_at timestamptz not null default now(),
  primary key (property_id, addon_key)
);

-- ---------------------------------------------------------------------------
-- Units: fully managed vs leasing-only (we only find tenants, at the leasing fee).
-- ---------------------------------------------------------------------------
alter table public.units add column if not exists management_type text not null default 'managed';
do $$ begin
  alter table public.units add constraint units_management_type_check check (management_type in ('managed', 'leasing_only'));
exception when duplicate_object then null; end $$;
alter table public.units add column if not exists legacy_key text;

-- ---------------------------------------------------------------------------
-- Tenancies / tenants: fields carried over from the tracker.
-- ---------------------------------------------------------------------------
-- Rents need cents (room shares like $533.33), so money columns become numeric.
drop view if exists public.my_homes;
alter table public.tenancies alter column rent type numeric(10, 2);
alter table public.tenancies alter column last_month_deposit type numeric(10, 2);
alter table public.tenancies alter column key_deposit type numeric(10, 2);
alter table public.units alter column market_rent type numeric(10, 2);
create view public.my_homes
with (security_invoker = false) as
  select t.id as tenancy_id, t.status, t.start_date, t.end_date, t.rent, t.rent_due_day,
         u.id as unit_id, u.label as unit_label, p.address, p.city, p.postal_code
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  join public.properties p on p.id = u.property_id
  where t.status in ('upcoming', 'active', 'notice')
    and exists (select 1 from public.tenancy_tenants tt
                where tt.tenancy_id = t.id and tt.profile_id = auth.uid());
revoke all on public.my_homes from anon;
grant select on public.my_homes to authenticated;

alter table public.tenancies add column if not exists start_date_estimated boolean not null default false;
alter table public.tenancies add column if not exists email_service_consent text;   -- RTA s.3 consent to email notices
alter table public.tenancies add column if not exists legacy_lease_id text unique;
alter table public.tenancy_tenants add column if not exists legacy_tenant_id text unique;
alter table public.tenancy_tenants add column if not exists allocated_share numeric(10, 2);

-- ---------------------------------------------------------------------------
-- Access: staff only.
-- ---------------------------------------------------------------------------
alter table public.owners enable row level security;
alter table public.service_rates enable row level security;
alter table public.property_addons enable row level security;

drop policy if exists "owners: staff all" on public.owners;
create policy "owners: staff all" on public.owners
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "service_rates: staff all" on public.service_rates;
create policy "service_rates: staff all" on public.service_rates
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "property_addons: staff all" on public.property_addons;
create policy "property_addons: staff all" on public.property_addons
  for all using (public.is_staff()) with check (public.is_staff());
