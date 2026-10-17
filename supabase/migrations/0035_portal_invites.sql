-- Portal invitations: when each owner / tenant was invited to sign up.
alter table public.owners add column if not exists portal_invited_at timestamptz;
alter table public.tenancy_tenants add column if not exists portal_invited_at timestamptz;
