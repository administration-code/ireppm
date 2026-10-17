-- IRep Property Management: N11 Agreement to End the Tenancy, for tenants who want to move
-- out sooner than an N9 allows (60 days, end of a rental period, end of a fixed term).
-- The tenant asks through the portal; staff approve or decline; on approval every tenant and
-- the landlord (IRep as agent) sign in DocuSign. Run AFTER 0022. Safe to re-run.

alter table public.signature_requests drop constraint if exists signature_requests_kind_check;
alter table public.signature_requests add constraint signature_requests_kind_check
  check (kind in ('lease', 'pm_contract', 'N1', 'N4', 'N5', 'N9', 'N11', 'certificate_of_service', 'other'));

-- A tenant's request to end early. Staff decide; nothing is signed until they approve.
create table if not exists public.n11_requests (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  termination_date date not null,
  reason text,
  phone text,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'cancelled', 'signed')),
  requested_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,                     -- shown to the tenant when declined
  signature_request_id uuid references public.signature_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists n11_requests_tenancy_idx on public.n11_requests (tenancy_id, created_at desc);
create unique index if not exists n11_requests_one_open on public.n11_requests (tenancy_id) where status = 'requested';
drop trigger if exists n11_requests_touch on public.n11_requests;
create trigger n11_requests_touch before update on public.n11_requests
  for each row execute function public.touch_updated_at();

alter table public.n11_requests enable row level security;
drop policy if exists "n11_requests: staff all" on public.n11_requests;
create policy "n11_requests: staff all" on public.n11_requests
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "n11_requests: tenant reads own" on public.n11_requests;
create policy "n11_requests: tenant reads own" on public.n11_requests
  for select using (public.is_tenant_of(tenancy_id));

drop policy if exists "signature_requests: tenant reads own N9" on public.signature_requests;
drop policy if exists "signature_requests: tenant reads own notices" on public.signature_requests;
create policy "signature_requests: tenant reads own notices" on public.signature_requests
  for select using (kind in ('N9', 'N11') and tenancy_id is not null and public.is_tenant_of(tenancy_id));

-- Tenant cancels their own request while it's still waiting.
create or replace function public.cancel_n11_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.n11_requests;
begin
  select * into r from public.n11_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not (public.is_staff() or public.is_tenant_of(r.tenancy_id)) then raise exception 'Not your request'; end if;
  if r.status <> 'requested' then raise exception 'This request has already been reviewed.'; end if;
  update public.n11_requests set status = 'cancelled' where id = p_id;
end;
$$;
revoke execute on function public.cancel_n11_request(uuid) from public, anon;
grant execute on function public.cancel_n11_request(uuid) to authenticated, service_role;

-- Staff decline (approval goes through /api/docusign/n11, which sends the agreement).
create or replace function public.decline_n11_request(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  update public.n11_requests
     set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_id and status = 'requested';
  if not found then raise exception 'This request has already been reviewed.'; end if;
end;
$$;
revoke execute on function public.decline_n11_request(uuid, text) from public, anon;
grant execute on function public.decline_n11_request(uuid, text) to authenticated, service_role;

-- Same as 0021, plus: an open or waiting N11 blocks a new notice, and the latest N11 request
-- is returned so the portal can show its status.
create or replace function public.n9_prepare(p_tenancy_id uuid, p_termination date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.tenancies;
  earliest date;
  err text;
  info jsonb;
begin
  select * into t from public.tenancies where id = p_tenancy_id;
  if not found then raise exception 'Tenancy not found'; end if;
  if not (public.is_staff() or public.is_tenant_of(p_tenancy_id) or auth.uid() is null) then
    raise exception 'Not your tenancy';
  end if;
  earliest := public.n9_earliest_date(p_tenancy_id);

  if t.status not in ('active', 'upcoming') then
    err := case when t.status = 'notice' then 'Notice has already been given for this tenancy.' else 'This tenancy has ended.' end;
  elsif exists (select 1 from public.signature_requests
                 where tenancy_id = p_tenancy_id and kind in ('N9', 'N11') and status in ('draft', 'sent', 'delivered')) then
    err := 'A notice is already waiting to be signed. Check your email from DocuSign.';
  elsif exists (select 1 from public.n11_requests where tenancy_id = p_tenancy_id and status = 'requested') then
    err := 'Your request to move out early is waiting for IRep to review it.';
  elsif p_termination is not null and p_termination < earliest then
    err := 'The earliest move-out date you can give is ' || to_char(earliest, 'FMMonth FMDD, YYYY') || '.';
  elsif p_termination is not null and p_termination <> public.rental_period_end(p_termination, t.rent_due_day)
        and p_termination is distinct from t.end_date then
    err := 'The move-out date must be the last day of a rental period, e.g. '
           || to_char(public.rental_period_end(p_termination, t.rent_due_day), 'FMMonth FMDD, YYYY') || '.';
  end if;

  select jsonb_build_object(
           'landlord_name', coalesce(o.name, 'The landlord') || ' c/o IRep Property Management',
           'address', concat_ws(', ', concat_ws(' - ', p.address, nullif(u.label, '')), p.city, 'ON', p.postal_code),
           'unit_label', u.label, 'property_address', p.address,
           'unit_id', u.id, 'property_id', p.id, 'owner_id', o.id)
    into info
    from public.units u join public.properties p on p.id = u.property_id
    left join public.owners o on o.id = p.owner_id
   where u.id = t.unit_id;

  return info || jsonb_build_object(
    'ok', err is null,
    'error', err,
    'earliest', earliest,
    'rent_due_day', t.rent_due_day,
    'n11_request', (select jsonb_build_object('id', id, 'status', status, 'termination_date', termination_date,
                                              'decision_note', decision_note, 'created_at', created_at)
                      from public.n11_requests where tenancy_id = p_tenancy_id order by created_at desc limit 1),
    'fixed_term_end', t.end_date,
    'tenants', coalesce((select jsonb_agg(jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone,
                                                             'is_primary', is_primary) order by is_primary desc, created_at)
                           from public.tenancy_tenants where tenancy_id = p_tenancy_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.n9_prepare(uuid, date) from public, anon;
grant execute on function public.n9_prepare(uuid, date) to authenticated, service_role;

-- Same as 0021, plus N11: when everyone has signed, the tenancy goes on notice like an N9.
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
  nid uuid;
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
      new_tenancy := r.tenancy_id;
    end if;

  elsif r.kind = 'pm_contract' then
    update public.properties
       set agreement_start = coalesce(nullif(t->>'agreement_start', '')::date, agreement_start),
           agreement_renewal = coalesce(nullif(t->>'agreement_renewal', '')::date, agreement_renewal)
     where id = r.property_id;

  elsif r.kind in ('N9', 'N11') then
    if r.tenancy_id is null then raise exception 'No tenancy on this notice'; end if;
    update public.tenancies
       set status = case when status in ('active', 'upcoming') then 'notice' else status end,
           move_out_date = (t->>'termination_date')::date
     where id = r.tenancy_id;
    update public.n11_requests set status = 'signed' where signature_request_id = r.id;
    if r.notice_id is null then
      insert into public.notices (tenancy_id, form, served_on, service_method, served_by, effective_date,
                                  status, notes, signature_request_id)
      values (r.tenancy_id, r.kind, coalesce((r.completed_at at time zone 'America/Toronto')::date,
                                             (now() at time zone 'America/Toronto')::date),
              'other', case when r.kind = 'N9' then 'Tenant, online (DocuSign)' else 'Tenants and landlord, signed in DocuSign' end,
              (t->>'termination_date')::date, 'served',
              case when r.kind = 'N9' then 'Given through the tenant portal and signed in DocuSign.'
                   else 'Agreement to end the tenancy early, requested through the tenant portal and signed by all parties in DocuSign.' end,
              r.id)
      returning id into nid;
      update public.signature_requests set notice_id = nid where id = r.id;
    end if;
  end if;

  update public.signature_requests set applied_at = now() where id = r.id;
  return jsonb_build_object('applied', true, 'kind', r.kind, 'tenancy_id', coalesce(new_tenancy, r.tenancy_id));
end;
$$;

revoke execute on function public.apply_signed_document(uuid) from public, anon, authenticated;
grant execute on function public.apply_signed_document(uuid) to service_role;
