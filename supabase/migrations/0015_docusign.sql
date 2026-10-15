-- IRep Property Management: DocuSign e-signatures for leases, property management
-- contracts and N-forms (N1, N4, N5), plus the Certificate of Service.
-- The website creates envelopes from the DocuSign templates, DocuSign Connect tells
-- us when they're signed, and the signed PDFs are kept in a private bucket.
-- Run AFTER 0014. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Email service consent as a yes/no (the text field keeps the detail).
--    Ontario: N-forms may be served by email only with the tenant's written consent.
-- ---------------------------------------------------------------------------
alter table public.tenancies add column if not exists email_service_ok boolean
  generated always as (coalesce(email_service_consent ilike 'yes%', false)) stored;

-- ---------------------------------------------------------------------------
-- 2. One row per DocuSign envelope.
-- ---------------------------------------------------------------------------
create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('lease', 'pm_contract', 'N1', 'N4', 'N5', 'certificate_of_service', 'other')),
  title text not null,                               -- e.g. "Lease: 1746 Buckingham Dr, Upper"
  template_id text,                                  -- DocuSign template used
  envelope_id text unique,                           -- set once DocuSign accepts it
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'delivered', 'completed', 'declined', 'voided', 'error')),

  -- What it's about (whichever apply).
  application_id uuid references public.applications (id) on delete set null,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  owner_id uuid references public.owners (id) on delete set null,
  related_request_id uuid references public.signature_requests (id) on delete set null,  -- certificate of service -> its N-form

  -- recipients: [{role, name, email, routing_order, status, signed_at}]
  recipients jsonb not null default '[]'::jsonb,
  -- prefill: {tabLabel: value} sent to DocuSign
  prefill jsonb not null default '{}'::jsonb,
  -- terms: the structured data we act on when it's completed
  --   lease: {unit_id, start_date, end_date, rent, rent_due_day, last_month_deposit, key_deposit,
  --           email_service_consent, tenants: [{full_name, email, phone, is_primary}]}
  --   pm_contract: {agreement_start, agreement_renewal}
  --   N1/N4/N5: {effective_date, amount, notes}
  terms jsonb not null default '{}'::jsonb,

  email_subject text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz,
  completed_at timestamptz,
  status_changed_at timestamptz,
  void_reason text,
  error text,
  signed_file_path text,                             -- signed-documents bucket
  certificate_file_path text,                        -- DocuSign certificate of completion
  applied_at timestamptz,                            -- when the completed paperwork updated our records
  notice_id uuid references public.notices (id) on delete set null,   -- N-forms: set when served
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists signature_requests_status_idx on public.signature_requests (status);
create index if not exists signature_requests_tenancy_idx on public.signature_requests (tenancy_id);
create index if not exists signature_requests_property_idx on public.signature_requests (property_id);
create index if not exists signature_requests_application_idx on public.signature_requests (application_id);
drop trigger if exists signature_requests_touch on public.signature_requests;
create trigger signature_requests_touch before update on public.signature_requests
  for each row execute function public.touch_updated_at();

alter table public.signature_requests enable row level security;
drop policy if exists "signature_requests: staff all" on public.signature_requests;
create policy "signature_requests: staff all" on public.signature_requests
  for all using (public.is_staff()) with check (public.is_staff());

-- Every DocuSign Connect message we receive (for the history panel and to ignore repeats).
create table if not exists public.signature_events (
  id uuid primary key default gen_random_uuid(),
  signature_request_id uuid references public.signature_requests (id) on delete cascade,
  envelope_id text not null,
  event text not null,                               -- envelope-sent, recipient-completed, envelope-completed, ...
  recipient_email text,
  occurred_at timestamptz not null default now(),
  dedupe_key text unique,                            -- envelope_id|event|recipient|generated date
  payload jsonb,
  received_at timestamptz not null default now()
);
create index if not exists signature_events_request_idx on public.signature_events (signature_request_id, occurred_at);
alter table public.signature_events enable row level security;
drop policy if exists "signature_events: staff read" on public.signature_events;
create policy "signature_events: staff read" on public.signature_events
  for select using (public.is_staff());

-- Link served notices back to the signed form.
alter table public.notices add column if not exists signature_request_id uuid
  references public.signature_requests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Private bucket for signed documents (staff only; the server hands out
--    short-lived links). Never public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-documents', 'signed-documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "signed-documents: staff read" on storage.objects;
create policy "signed-documents: staff read" on storage.objects
  for select using (bucket_id = 'signed-documents' and public.is_staff());
drop policy if exists "signed-documents: staff write" on storage.objects;
create policy "signed-documents: staff write" on storage.objects
  for insert with check (bucket_id = 'signed-documents' and public.is_staff());
drop policy if exists "signed-documents: staff delete" on storage.objects;
create policy "signed-documents: staff delete" on storage.objects
  for delete using (bucket_id = 'signed-documents' and public.is_staff());

-- ---------------------------------------------------------------------------
-- 4. When an envelope is completed, update our records. Called by the webhook
--    (service role) after the signed PDF is saved. Safe to call twice.
--    lease       -> creates the tenancy (upcoming) and its tenants
--    pm_contract -> sets the property's agreement dates
--    N-forms     -> nothing yet: the form is ready to serve (see record_notice_service)
-- ---------------------------------------------------------------------------
create or replace function public.apply_signed_document(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.signature_requests;
  t jsonb;
  new_tenancy uuid;
  tenant jsonb;
  first boolean := true;
begin
  select * into r from public.signature_requests where id = p_request_id for update;
  if not found then raise exception 'Signature request not found'; end if;
  if r.status <> 'completed' then raise exception 'Not completed yet'; end if;
  if r.applied_at is not null then
    return jsonb_build_object('already_applied', true, 'tenancy_id', r.tenancy_id);
  end if;
  t := r.terms;

  if r.kind = 'lease' then
    if r.tenancy_id is null then
      insert into public.tenancies (unit_id, status, start_date, end_date, rent, rent_due_day,
                                    last_month_deposit, key_deposit, application_id, email_service_consent, notes)
      values ((coalesce(t->>'unit_id', r.unit_id::text))::uuid,
              'upcoming',
              (t->>'start_date')::date,
              nullif(t->>'end_date', '')::date,
              (t->>'rent')::numeric,
              coalesce(nullif(t->>'rent_due_day', '')::smallint, 1),
              nullif(t->>'last_month_deposit', '')::numeric,
              nullif(t->>'key_deposit', '')::numeric,
              r.application_id,
              -- The webhook reads the consent form's answer from the envelope and puts it here.
              coalesce(nullif(t->>'email_service_consent', ''),
                       'Not recorded: check the Email Service Consent page of the signed lease'),
              'Lease signed in DocuSign, envelope ' || r.envelope_id)
      returning id into new_tenancy;

      for tenant in select * from jsonb_array_elements(coalesce(t->'tenants', '[]'::jsonb)) loop
        insert into public.tenancy_tenants (tenancy_id, full_name, email, phone, is_primary)
        values (new_tenancy, tenant->>'full_name', nullif(lower(tenant->>'email'), ''), nullif(tenant->>'phone', ''),
                coalesce((tenant->>'is_primary')::boolean, first));
        first := false;
      end loop;

      update public.signature_requests set tenancy_id = new_tenancy where id = r.id;
    else
      new_tenancy := r.tenancy_id;   -- renewal / replacement lease on an existing tenancy
    end if;

  elsif r.kind = 'pm_contract' then
    update public.properties
       set agreement_start = coalesce(nullif(t->>'agreement_start', '')::date, agreement_start),
           agreement_renewal = coalesce(nullif(t->>'agreement_renewal', '')::date, agreement_renewal)
     where id = r.property_id;
  end if;

  update public.signature_requests set applied_at = now() where id = r.id;
  return jsonb_build_object('applied', true, 'kind', r.kind, 'tenancy_id', coalesce(new_tenancy, r.tenancy_id));
end;
$$;
revoke execute on function public.apply_signed_document(uuid) from public, anon, authenticated;
grant execute on function public.apply_signed_document(uuid) to service_role;

-- Staff record how a signed N-form was served; this creates the notice
-- (so it shows on the dashboard, the tenancy and the landlord's letter).
create or replace function public.record_notice_service(
  p_request_id uuid, p_served_on date, p_method text, p_served_by text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.signature_requests;
  ok boolean;
  nid uuid;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  select * into r from public.signature_requests where id = p_request_id for update;
  if not found then raise exception 'Signature request not found'; end if;
  if r.kind not in ('N1', 'N4', 'N5') then raise exception 'Not an N-form'; end if;
  if r.status <> 'completed' then raise exception 'The form must be signed before it is served'; end if;
  if r.tenancy_id is null then raise exception 'No tenancy on this form'; end if;
  if r.notice_id is not null then return r.notice_id; end if;

  select email_service_ok into ok from public.tenancies where id = r.tenancy_id;
  if p_method = 'email' and not coalesce(ok, false) then
    raise exception 'This tenant has not consented in writing to email service. Serve it by hand, mail slot or mail.';
  end if;

  insert into public.notices (tenancy_id, form, served_on, service_method, served_by, effective_date, amount,
                              status, notes, signature_request_id)
  values (r.tenancy_id, r.kind, p_served_on, p_method, p_served_by,
          nullif(r.terms->>'effective_date', '')::date, nullif(r.terms->>'amount', '')::numeric,
          'served', nullif(r.terms->>'notes', ''), r.id)
  returning id into nid;

  update public.signature_requests set notice_id = nid where id = r.id;
  return nid;
end;
$$;
revoke execute on function public.record_notice_service(uuid, date, text, text) from public, anon;
grant execute on function public.record_notice_service(uuid, date, text, text) to authenticated, service_role;
