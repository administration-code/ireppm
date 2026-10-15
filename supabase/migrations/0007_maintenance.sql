-- IRep Property Management: maintenance requests and partners (back office, step 2).
-- Run AFTER 0006. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Tenant privacy fix: tenants no longer read the units / tenancies /
--    tenancy_tenants tables directly (those rows hold staff notes, arrears and
--    co-tenant details). They use the my_homes view and the views below.
-- ---------------------------------------------------------------------------
drop policy if exists "units: tenant reads own" on public.units;
drop policy if exists "tenancies: tenant reads own" on public.tenancies;
drop policy if exists "tenancy_tenants: tenant reads own tenancy" on public.tenancy_tenants;

-- ---------------------------------------------------------------------------
-- 2. Link tenants to their website account by email.
--    Sign-in is by magic link or Google, so the email is verified.
-- ---------------------------------------------------------------------------
create or replace function public.link_tenant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    update public.tenancy_tenants
       set profile_id = new.id
     where profile_id is null
       and email is not null
       and lower(trim(email)) = lower(trim(new.email));
  end if;
  return new;
end;
$$;
revoke execute on function public.link_tenant_profile() from public, anon, authenticated;

drop trigger if exists profiles_link_tenant on public.profiles;
create trigger profiles_link_tenant after insert or update of email on public.profiles
  for each row execute function public.link_tenant_profile();

-- When staff add a tenant whose email already has an account, link it straight away.
create or replace function public.link_tenant_on_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is null and new.email is not null then
    select id into new.profile_id from public.profiles
     where email is not null and lower(trim(email)) = lower(trim(new.email))
     limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.link_tenant_on_add() from public, anon, authenticated;

drop trigger if exists tenancy_tenants_link on public.tenancy_tenants;
create trigger tenancy_tenants_link before insert or update of email on public.tenancy_tenants
  for each row execute function public.link_tenant_on_add();

-- Link everyone who already has an account.
update public.tenancy_tenants tt
   set profile_id = p.id
  from public.profiles p
 where tt.profile_id is null and tt.email is not null and p.email is not null
   and lower(trim(tt.email)) = lower(trim(p.email));

-- ---------------------------------------------------------------------------
-- 3. Rates: owner-approval threshold for repairs.
-- ---------------------------------------------------------------------------
alter table public.service_rates drop constraint if exists service_rates_category_check;
alter table public.service_rates add constraint service_rates_category_check
  check (category in ('management', 'addon', 'leasing', 'tax', 'rent_control', 'maintenance'));
alter table public.service_rates drop constraint if exists service_rates_unit_check;
alter table public.service_rates add constraint service_rates_unit_check
  check (unit in ('per_month', 'one_time', 'months_of_rent', 'percent', 'days', 'months', 'per_job'));

insert into public.service_rates (key, name, category, amount, unit, notes, sort_order) values
  ('owner_approval_threshold', 'Owner approval needed above', 'maintenance', 250, 'per_job',
   'Non-emergency repairs estimated above this amount need the owner''s OK before booking', 140)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Partners: trades and contractors we send jobs to.
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- contact person
  company text,
  trades text[] not null default '{}',      -- e.g. {plumbing, hvac}
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Maintenance requests.
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete restrict,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  submitted_by uuid references public.profiles (id) on delete set null,   -- tenant account, if they used the site
  reporter_name text,
  reporter_phone text,
  reporter_email text,
  source text not null default 'tenant_portal'
    check (source in ('tenant_portal', 'phone', 'text', 'email', 'inspection', 'staff')),
  category text not null default 'other'
    check (category in ('plumbing', 'electrical', 'heating_cooling', 'appliance', 'pests',
                        'doors_locks_windows', 'roof_structure', 'lawn_snow', 'other')),
  title text not null,
  description text not null,
  urgency text not null default 'routine' check (urgency in ('emergency', 'urgent', 'routine')),
  permission_to_enter boolean not null default false,   -- tenant OK for entry without 24h written notice
  access_notes text,                                     -- best times, entry instructions
  photos jsonb not null default '[]'::jsonb,             -- [{ path, name }] in the maintenance-photos bucket
  status text not null default 'new'
    check (status in ('new', 'triaged', 'awaiting_owner', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  partner_id uuid references public.partners (id) on delete set null,
  scheduled_for timestamptz,
  entry_notice_served_at timestamptz,                    -- written notice of entry (RTA s.27) when needed
  estimated_cost numeric(10, 2),
  actual_cost numeric(10, 2),
  owner_approval text not null default 'not_needed'
    check (owner_approval in ('not_needed', 'pending', 'approved', 'declined')),
  owner_decision_at timestamptz,
  charge_to text check (charge_to in ('owner', 'tenant', 'irep')),
  tenant_update text,                                    -- the message the tenant sees
  staff_notes text,                                      -- internal only
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maintenance_unit_idx on public.maintenance_requests (unit_id);
create index if not exists maintenance_status_idx on public.maintenance_requests (status);
create index if not exists maintenance_submitted_idx on public.maintenance_requests (submitted_by);

drop trigger if exists maintenance_touch on public.maintenance_requests;
create trigger maintenance_touch before update on public.maintenance_requests
  for each row execute function public.touch_updated_at();

-- Keep tenant submissions clean, set completed_at, and flag owner approval.
create or replace function public.maintenance_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold numeric;
begin
  -- A tenant (not staff) can only create a fresh request for their own current home.
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_staff() then
    if new.tenancy_id is null or not public.is_tenant_of(new.tenancy_id)
       or not exists (select 1 from public.tenancies t
                      where t.id = new.tenancy_id and t.unit_id = new.unit_id
                        and t.status in ('upcoming', 'active', 'notice')) then
      raise exception 'You can only report maintenance for your own home.';
    end if;
    new.submitted_by := auth.uid();
    new.source := 'tenant_portal';
    new.status := 'new';
    new.partner_id := null;
    new.scheduled_for := null;
    new.entry_notice_served_at := null;
    new.estimated_cost := null;
    new.actual_cost := null;
    new.owner_approval := 'not_needed';
    new.owner_decision_at := null;
    new.charge_to := null;
    new.tenant_update := null;
    new.staff_notes := null;
    new.completed_at := null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  if new.owner_approval in ('approved', 'declined')
     and (tg_op = 'INSERT' or old.owner_approval is distinct from new.owner_approval) then
    new.owner_decision_at := coalesce(new.owner_decision_at, now());
  end if;

  -- Non-emergency jobs estimated above the threshold need the owner's OK.
  select amount into threshold from public.service_rates where key = 'owner_approval_threshold';
  if new.owner_approval = 'not_needed' and new.urgency <> 'emergency'
     and threshold is not null and coalesce(new.estimated_cost, 0) > threshold then
    new.owner_approval := 'pending';
  end if;

  return new;
end;
$$;
revoke execute on function public.maintenance_rules() from public, anon, authenticated;

drop trigger if exists maintenance_rules on public.maintenance_requests;
create trigger maintenance_rules before insert or update on public.maintenance_requests
  for each row execute function public.maintenance_rules();

-- Email staff about new requests (same webhook as showings and applications).
drop trigger if exists notify_staff_maintenance on public.maintenance_requests;
create trigger notify_staff_maintenance after insert on public.maintenance_requests
  for each row execute function public.notify_staff_webhook();

-- ---------------------------------------------------------------------------
-- 6. Access rules.
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.maintenance_requests enable row level security;

drop policy if exists "partners: staff all" on public.partners;
create policy "partners: staff all" on public.partners
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "maintenance: staff all" on public.maintenance_requests;
create policy "maintenance: staff all" on public.maintenance_requests
  for all using (public.is_staff()) with check (public.is_staff());
-- Tenants can create requests (the trigger above checks it's their home).
-- They read them through the my_maintenance view, never the table, so staff
-- notes, costs and partner details stay private. Insert without .select().
drop policy if exists "maintenance: tenant creates own" on public.maintenance_requests;
create policy "maintenance: tenant creates own" on public.maintenance_requests
  for insert to authenticated with check (tenancy_id is not null and public.is_tenant_of(tenancy_id));

create or replace view public.my_maintenance
with (security_invoker = false) as
  select m.id, m.tenancy_id, m.unit_id, m.category, m.title, m.description, m.urgency,
         m.permission_to_enter, m.access_notes, m.photos, m.status, m.scheduled_for,
         m.tenant_update, m.completed_at, m.created_at, m.updated_at
  from public.maintenance_requests m
  where m.tenancy_id is not null
    and exists (select 1 from public.tenancy_tenants tt
                where tt.tenancy_id = m.tenancy_id and tt.profile_id = auth.uid());
revoke all on public.my_maintenance from anon;
grant select on public.my_maintenance to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Photos: PRIVATE bucket. Tenants upload under <user id>/..., staff see all.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maintenance-photos', 'maintenance-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false;

drop policy if exists "maintenance-photos: own folder or staff read" on storage.objects;
create policy "maintenance-photos: own folder or staff read" on storage.objects
  for select using (
    bucket_id = 'maintenance-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists "maintenance-photos: own folder or staff upload" on storage.objects;
create policy "maintenance-photos: own folder or staff upload" on storage.objects
  for insert with check (
    bucket_id = 'maintenance-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists "maintenance-photos: staff delete" on storage.objects;
create policy "maintenance-photos: staff delete" on storage.objects
  for delete using (bucket_id = 'maintenance-photos' and public.is_staff());
