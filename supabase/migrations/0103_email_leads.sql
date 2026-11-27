-- 0103: "Lead" on Unmatched Emails. An address can be assigned to a landlord lead (landlord_inquiries),
-- like a tenant or landlord, and every email from it shows on that lead.
-- Run AFTER 0102. Safe to re-run.

alter table public.email_address_rules add column if not exists lead_id uuid references public.landlord_inquiries(id) on delete set null;
alter table public.inbound_emails add column if not exists lead_id uuid references public.landlord_inquiries(id) on delete set null;
create index if not exists inbound_emails_lead on public.inbound_emails (lead_id) where lead_id is not null;

alter table public.email_address_rules drop constraint if exists email_address_rules_party_kind_check;
alter table public.email_address_rules add constraint email_address_rules_party_kind_check
  check (party_kind in ('tenant', 'landlord', 'applicant', 'partner', 'lead', 'ignored'));
alter table public.email_address_rules drop constraint if exists email_address_rules_target;
alter table public.email_address_rules add constraint email_address_rules_target check (
  (party_kind = 'tenant' and tenancy_id is not null) or (party_kind = 'landlord' and owner_id is not null)
  or (party_kind = 'applicant' and application_id is not null) or (party_kind = 'partner' and partner_id is not null)
  or (party_kind = 'lead' and lead_id is not null) or party_kind = 'ignored');

alter table public.inbound_emails drop constraint if exists inbound_emails_party_kind_check;
alter table public.inbound_emails add constraint inbound_emails_party_kind_check
  check (party_kind in ('tenant', 'landlord', 'applicant', 'partner', 'lead', 'ignored', 'unmatched'));
