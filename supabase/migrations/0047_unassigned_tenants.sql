-- 0047: a tenant can be unassigned from a tenancy and kept on file (Manage Tenants), then assigned
-- to another tenancy later. Payments and leases belong to the tenancy, so nothing else moves with them.
alter table public.tenancy_tenants alter column tenancy_id drop not null;
