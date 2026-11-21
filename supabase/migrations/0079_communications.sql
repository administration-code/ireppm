-- 0079: Communications timeline. Every email in and out of administration@ (not Interac notices),
-- matched to the tenant, landlord, applicant or partner, and to their unit and property.
-- Unmatched senders wait in "Unmatched Emails"; once staff assign an address, it's remembered.
-- Run AFTER 0078. Safe to re-run.

alter table public.inbound_emails add column if not exists direction text not null default 'in';
alter table public.inbound_emails drop constraint if exists inbound_emails_direction_check;
alter table public.inbound_emails add constraint inbound_emails_direction_check check (direction in ('in', 'out'));
alter table public.inbound_emails add column if not exists thread_id text;
alter table public.inbound_emails add column if not exists to_emails text[] not null default '{}';
alter table public.inbound_emails add column if not exists party_email text;           -- the other side's address
alter table public.inbound_emails add column if not exists party_kind text not null default 'unmatched';
alter table public.inbound_emails drop constraint if exists inbound_emails_party_kind_check;
alter table public.inbound_emails add constraint inbound_emails_party_kind_check
  check (party_kind in ('tenant', 'landlord', 'applicant', 'partner', 'ignored', 'unmatched'));
alter table public.inbound_emails add column if not exists party_name text;
alter table public.inbound_emails add column if not exists owner_id uuid references public.owners (id) on delete set null;
alter table public.inbound_emails add column if not exists property_id uuid references public.properties (id) on delete set null;
alter table public.inbound_emails add column if not exists application_id uuid references public.applications (id) on delete set null;
alter table public.inbound_emails add column if not exists partner_id uuid references public.partners (id) on delete set null;
alter table public.inbound_emails add column if not exists label_source text;
alter table public.inbound_emails drop constraint if exists inbound_emails_label_source_check;
alter table public.inbound_emails add constraint inbound_emails_label_source_check
  check (label_source is null or label_source in ('rule', 'ai', 'staff'));
alter table public.inbound_emails add column if not exists answered_at timestamptz;
alter table public.inbound_emails add column if not exists draft_id uuid references public.email_drafts (id) on delete set null;
alter table public.inbound_emails add column if not exists hidden_attachments integer not null default 0;

create index if not exists inbound_emails_thread_idx on public.inbound_emails (thread_id, received_at);
create index if not exists inbound_emails_tenancy_idx on public.inbound_emails (tenancy_id, received_at desc) where tenancy_id is not null;
create index if not exists inbound_emails_owner_idx on public.inbound_emails (owner_id, received_at desc) where owner_id is not null;
create index if not exists inbound_emails_unit_idx on public.inbound_emails (unit_id, received_at desc) where unit_id is not null;
create index if not exists inbound_emails_property_idx on public.inbound_emails (property_id, received_at desc) where property_id is not null;
create index if not exists inbound_emails_party_email_idx on public.inbound_emails (party_email);
create index if not exists inbound_emails_unmatched_idx on public.inbound_emails (received_at desc) where party_kind = 'unmatched';

-- Addresses staff have assigned (like Sender Rules): checked before anything else.
create table if not exists public.email_address_rules (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  party_kind text not null check (party_kind in ('tenant', 'landlord', 'applicant', 'partner', 'ignored')),
  tenancy_id uuid references public.tenancies (id) on delete cascade,
  owner_id uuid references public.owners (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint email_address_rules_target check (
    (party_kind = 'tenant' and tenancy_id is not null) or (party_kind = 'landlord' and owner_id is not null)
    or (party_kind = 'applicant' and application_id is not null) or (party_kind = 'partner' and partner_id is not null)
    or party_kind = 'ignored')
);
alter table public.email_address_rules enable row level security;
drop policy if exists "email_address_rules: staff all" on public.email_address_rules;
create policy "email_address_rules: staff all" on public.email_address_rules for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.email_address_rules from anon;

-- A reply from administration@ (in the thread, or any later email to the same person) answers the earlier emails.
create or replace function public.inbound_emails_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'out' and (new.thread_id is not null or new.party_email is not null) then
    update public.inbound_emails
       set answered_at = new.received_at
     where direction = 'in' and answered_at is null and received_at <= new.received_at
       and ((new.thread_id is not null and thread_id = new.thread_id) or (new.party_email is not null and party_email = new.party_email));
  end if;
  return new;
end;
$$;
drop trigger if exists inbound_emails_answered on public.inbound_emails;
create trigger inbound_emails_answered after insert or update of thread_id on public.inbound_emails
  for each row execute function public.inbound_emails_answered();

-- Staff may also assign and relabel (already allowed by the 0077 staff update policy).
drop policy if exists "inbound_emails: staff insert" on public.inbound_emails;
create policy "inbound_emails: staff insert" on public.inbound_emails for insert with check (public.is_staff());

-- Chuck is told again when a maintenance request is raised to urgent or emergency after it was logged.
create or replace function public.notify_maintenance_escalated()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
begin
  if new.urgency in ('urgent', 'emergency') and new.urgency is distinct from old.urgency
     and (old.urgency = 'routine' or new.urgency = 'emergency') and new.status not in ('completed', 'cancelled') then
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
    perform net.http_post(
      url := 'https://ireppm.ca/api/notify',
      body := jsonb_build_object('type', 'ESCALATED', 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', to_jsonb(new)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
      timeout_milliseconds := 5000
    );
  end if;
  return new;
exception when others then
  raise warning 'notify_maintenance_escalated failed: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists notify_maintenance_escalated on public.maintenance_requests;
create trigger notify_maintenance_escalated after update of urgency on public.maintenance_requests
  for each row execute function public.notify_maintenance_escalated();
