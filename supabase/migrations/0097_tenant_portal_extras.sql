-- 0097: tenant portal extras.
--   maintenance_requests: the tenant's answer after a job is marked done ("Yes, Fixed" or "Still a Problem").
--   tenancy_tenants: best time to reach each tenant, and when a tenant last updated details in the portal.
-- Run AFTER 0096. Safe to re-run.

alter table public.maintenance_requests add column if not exists tenant_confirmed text check (tenant_confirmed in ('fixed', 'not_fixed'));
alter table public.maintenance_requests add column if not exists tenant_confirmed_at timestamptz;
alter table public.maintenance_requests add column if not exists tenant_confirm_note text;

alter table public.tenancy_tenants add column if not exists contact_time text;
alter table public.tenancy_tenants add column if not exists details_updated_at timestamptz;
