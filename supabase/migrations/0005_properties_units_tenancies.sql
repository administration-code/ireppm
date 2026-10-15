-- IRep Property Management: properties, units and tenancies (back office, step 1).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Properties: one row per building/address IRep manages.
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  city text not null default 'Windsor',
  postal_code text,
  owner_name text,
  owner_email text,
  owner_phone text,
  management_package text
    check (management_package in ('leasing_only', 'standard', 'maintenance', 'protection', 'commercial')),
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Units: each rentable unit or room in a property.
-- ---------------------------------------------------------------------------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null,                       -- e.g. 'Upper', 'Room 4', 'Rear unit', 'Whole house'
  unit_type text not null default 'Apartment'
    check (unit_type in ('Apartment', 'House', 'Townhouse', 'Room')),
  beds numeric(3, 1),
  baths numeric(3, 1),
  market_rent integer,                       -- asking rent when vacant
  status text not null default 'vacant'
    check (status in ('occupied', 'vacant', 'turnover', 'offline')),
  listing_id uuid references public.listings (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, label)
);
create index if not exists units_property_idx on public.units (property_id);

-- ---------------------------------------------------------------------------
-- Tenancies: a lease on a unit. One unit has at most one active/notice tenancy.
-- ---------------------------------------------------------------------------
create table if not exists public.tenancies (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  status text not null default 'active'
    check (status in ('upcoming', 'active', 'notice', 'ended')),
  start_date date not null,
  end_date date,                             -- empty = month-to-month
  move_out_date date,                        -- set when notice is given
  rent integer not null,
  rent_due_day smallint not null default 1 check (rent_due_day between 1 and 28),
  last_month_deposit integer,
  key_deposit integer,
  payprop_reference text,
  application_id uuid references public.applications (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenancies_unit_idx on public.tenancies (unit_id);
create unique index if not exists tenancies_one_current_per_unit
  on public.tenancies (unit_id) where status in ('active', 'notice');

-- People on a tenancy. profile_id links to their website account when they have one.
create table if not exists public.tenancy_tenants (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tenancy_tenants_tenancy_idx on public.tenancy_tenants (tenancy_id);
create index if not exists tenancy_tenants_profile_idx on public.tenancy_tenants (profile_id);

-- Keep updated_at current.
drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties
  for each row execute function public.touch_updated_at();
drop trigger if exists units_touch on public.units;
create trigger units_touch before update on public.units
  for each row execute function public.touch_updated_at();
drop trigger if exists tenancies_touch on public.tenancies;
create trigger tenancies_touch before update on public.tenancies
  for each row execute function public.touch_updated_at();

-- A unit's status follows its tenancy: active/notice -> occupied; ended -> turnover.
create or replace function public.sync_unit_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('active', 'notice') then
    update public.units set status = 'occupied' where id = new.unit_id and status <> 'occupied';
  elsif new.status = 'ended' and (tg_op = 'INSERT' or old.status is distinct from 'ended') then
    update public.units set status = 'turnover'
      where id = new.unit_id
        and not exists (select 1 from public.tenancies t
                        where t.unit_id = new.unit_id and t.id <> new.id and t.status in ('active', 'notice'));
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_unit_status() from public, anon, authenticated;

drop trigger if exists tenancies_sync_unit on public.tenancies;
create trigger tenancies_sync_unit after insert or update of status on public.tenancies
  for each row execute function public.sync_unit_status();

-- Is the signed-in user a tenant on this tenancy?
create or replace function public.is_tenant_of(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.tenancy_tenants
                 where tenancy_id = t_id and profile_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Access rules: staff manage everything; tenants can read their own tenancy,
-- its unit and the property's address (not owner details — see the view below).
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.tenancies enable row level security;
alter table public.tenancy_tenants enable row level security;

drop policy if exists "properties: staff all" on public.properties;
create policy "properties: staff all" on public.properties
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "units: staff all" on public.units;
create policy "units: staff all" on public.units
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "units: tenant reads own" on public.units;
create policy "units: tenant reads own" on public.units
  for select using (exists (
    select 1 from public.tenancies t
    where t.unit_id = units.id and t.status in ('upcoming', 'active', 'notice') and public.is_tenant_of(t.id)));

drop policy if exists "tenancies: staff all" on public.tenancies;
create policy "tenancies: staff all" on public.tenancies
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "tenancies: tenant reads own" on public.tenancies;
create policy "tenancies: tenant reads own" on public.tenancies
  for select using (public.is_tenant_of(id));

drop policy if exists "tenancy_tenants: staff all" on public.tenancy_tenants;
create policy "tenancy_tenants: staff all" on public.tenancy_tenants
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "tenancy_tenants: tenant reads own tenancy" on public.tenancy_tenants;
create policy "tenancy_tenants: tenant reads own tenancy" on public.tenancy_tenants
  for select using (public.is_tenant_of(tenancy_id));

-- Tenants see their home's address without the owner's private details.
create or replace view public.my_homes
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
