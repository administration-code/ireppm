-- IRep Property Management: landlords review and approve applicants before IRep accepts them.
--   * Renters list references on their profile (copied onto each application).
--   * Staff upload the FrontLobby credit report and a short summary, and record reference checks.
--   * Staff send the application to the property's owner, who reviews it in the owner portal and
--     approves, declines or asks questions. Questions go to the applicant; answers go back.
-- Documents stay in private buckets; landlords only ever get short-lived links from the server.
-- Run AFTER 0024. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. References and screening on applications
-- ---------------------------------------------------------------------------
-- [{kind: current_landlord | previous_landlord | employer | personal, name, phone, email,
--   relationship, since, until, address, note}]
alter table public.profiles add column if not exists rental_references jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists rental_references jsonb not null default '[]'::jsonb;

alter table public.applications add column if not exists credit_report_path text;   -- bucket screening-reports
alter table public.applications add column if not exists credit_summary text;       -- e.g. "Score 712, no collections"
alter table public.applications add column if not exists credit_checked_at timestamptz;
alter table public.applications add column if not exists reference_notes text;      -- staff notes from reference calls

alter table public.applications add column if not exists owner_review_status text not null default 'not_sent';
alter table public.applications drop constraint if exists applications_owner_review_status_check;
alter table public.applications add constraint applications_owner_review_status_check
  check (owner_review_status in ('not_sent', 'pending', 'approved', 'declined', 'info_requested'));
alter table public.applications add column if not exists owner_review_sent_at timestamptz;
alter table public.applications add column if not exists owner_decided_at timestamptz;
alter table public.applications add column if not exists owner_decision_note text;
alter table public.applications add column if not exists owner_id uuid references public.owners (id) on delete set null;

-- Private bucket for screening reports (staff upload; landlords get signed links via the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screening-reports', 'screening-reports', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false;
drop policy if exists "screening-reports: staff all" on storage.objects;
create policy "screening-reports: staff all" on storage.objects
  for all using (bucket_id = 'screening-reports' and public.is_staff())
  with check (bucket_id = 'screening-reports' and public.is_staff());

-- The owner of the property a listing belongs to (listing -> unit -> property -> owner).
create or replace function public.listing_owner_id(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_id from public.units u join public.properties p on p.id = u.property_id
   where u.listing_id = p_listing_id and p.owner_id is not null
   order by u.created_at limit 1
$$;
revoke execute on function public.listing_owner_id(uuid) from public, anon;
grant execute on function public.listing_owner_id(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Messages between the landlord, the applicant and IRep about one application
-- ---------------------------------------------------------------------------
create table if not exists public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sender_role text not null check (sender_role in ('owner', 'applicant', 'staff')),
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists application_messages_app_idx on public.application_messages (application_id, created_at);
alter table public.application_messages enable row level security;
drop policy if exists "application_messages: staff all" on public.application_messages;
create policy "application_messages: staff all" on public.application_messages
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "application_messages: applicant reads own" on public.application_messages;
create policy "application_messages: applicant reads own" on public.application_messages
  for select using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid()));
-- Owners read through owner_application_review(); everyone writes through post_application_message().

-- Who is asking about this application: 'staff', 'owner', 'applicant' or null.
create or replace function public.application_role(p_application_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_application_id;
  if not found then return null; end if;
  if public.is_staff() then return 'staff'; end if;
  if a.user_id = auth.uid() then return 'applicant'; end if;
  if a.owner_id is not null and a.owner_review_status <> 'not_sent' and public.is_owner_account(a.owner_id) then
    return 'owner';
  end if;
  return null;
end;
$$;
revoke execute on function public.application_role(uuid) from public, anon;
grant execute on function public.application_role(uuid) to authenticated, service_role;

create or replace function public.post_application_message(p_application_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  role text := public.application_role(p_application_id);
  mid uuid;
begin
  if role is null then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Write a message first.'; end if;
  insert into public.application_messages (application_id, sender_role, sender_id, body)
  values (p_application_id, role, auth.uid(), left(trim(p_body), 4000))
  returning id into mid;
  return mid;
end;
$$;
revoke execute on function public.post_application_message(uuid, text) from public, anon;
grant execute on function public.post_application_message(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Staff send the application to the landlord
-- ---------------------------------------------------------------------------
create or replace function public.send_application_to_owner(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.applications;
  oid uuid;
  o public.owners;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  select * into a from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if a.status in ('declined', 'withdrawn') then raise exception 'This application is %.', a.status; end if;
  -- Applicants who applied before landlords were included in the consent must agree again.
  if coalesce(a.consent_text, '') not ilike '%owner%' then
    raise exception 'This applicant applied before landlords were part of the consent. Ask them to re-confirm on their profile (re-apply), then send it.';
  end if;
  oid := coalesce(a.owner_id, public.listing_owner_id(a.listing_id));
  if oid is null then
    raise exception 'This listing isn''t linked to a unit with an owner. Link the listing to its unit first.';
  end if;
  select * into o from public.owners where id = oid;
  if coalesce(o.email, '') = '' then raise exception 'The owner (%) has no email. Add it on the owner''s page first.', o.name; end if;

  update public.applications
     set owner_id = oid, owner_review_status = 'pending', owner_review_sent_at = now(),
         owner_decided_at = null, owner_decision_note = null,
         status = case when status = 'submitted' then 'reviewing' else status end
   where id = p_application_id;
  return jsonb_build_object('owner_id', o.id, 'owner_name', o.name, 'owner_email', o.email,
                            'owner_linked', o.profile_id is not null);
end;
$$;
revoke execute on function public.send_application_to_owner(uuid) from public, anon;
grant execute on function public.send_application_to_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Landlord side (owner portal)
-- ---------------------------------------------------------------------------
-- Applications sent to the signed-in landlord, with everything they need to decide.
-- Document entries list type and name only; files open through /api/owner/applications/file.
create or replace function public.owner_applications()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'listing', jsonb_build_object('address', l.address, 'unit', l.unit, 'rent', l.rent, 'available_on', l.available_on),
           'applicant_name', a.applicant_name,
           'applicant_email', a.applicant_email,
           'applicant_phone', a.applicant_phone,
           'applicant_address', a.applicant_address,
           'income_type', a.income_type,
           'documents', (select coalesce(jsonb_agg(jsonb_build_object('type', d->>'type', 'name', d->>'name')), '[]'::jsonb)
                           from jsonb_array_elements(a.documents) d),
           'references', a.rental_references,
           'reference_notes', a.reference_notes,
           'credit_summary', a.credit_summary,
           'credit_report', a.credit_report_path is not null,
           'credit_checked_at', a.credit_checked_at,
           'submitted_at', a.created_at,
           'review_status', a.owner_review_status,
           'sent_at', a.owner_review_sent_at,
           'decided_at', a.owner_decided_at,
           'decision_note', a.owner_decision_note,
           'messages', (select coalesce(jsonb_agg(jsonb_build_object('from', m.sender_role, 'body', m.body, 'at', m.created_at)
                                                  order by m.created_at), '[]'::jsonb)
                          from public.application_messages m where m.application_id = a.id))
         order by a.owner_review_sent_at desc), '[]'::jsonb)
    from public.applications a
    join public.listings l on l.id = a.listing_id
    join public.owners o on o.id = a.owner_id
   where o.profile_id = auth.uid() and auth.uid() is not null
     and a.owner_review_status <> 'not_sent'
     and a.status not in ('withdrawn')
$$;
revoke execute on function public.owner_applications() from public, anon;
grant execute on function public.owner_applications() to authenticated;

-- The landlord's decision. 'info_requested' needs a question, which goes to the applicant.
create or replace function public.owner_decide_application(p_application_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if public.application_role(p_application_id) not in ('owner', 'staff') then raise exception 'Not allowed'; end if;
  if p_decision not in ('approved', 'declined', 'info_requested') then raise exception 'Unknown decision'; end if;
  if a.status in ('withdrawn', 'declined') then raise exception 'This application is no longer open.'; end if;
  if p_decision = 'info_requested' and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Write the question you want to ask the applicant.';
  end if;
  update public.applications
     set owner_review_status = p_decision, owner_decided_at = now(), owner_decision_note = nullif(trim(p_note), '')
   where id = p_application_id;
  if p_decision = 'info_requested' then
    insert into public.application_messages (application_id, sender_role, sender_id, body)
    values (p_application_id, case when public.is_staff() then 'staff' else 'owner' end, auth.uid(), left(trim(p_note), 4000));
  end if;
end;
$$;
revoke execute on function public.owner_decide_application(uuid, text, text) from public, anon;
grant execute on function public.owner_decide_application(uuid, text, text) to authenticated, service_role;

-- When the applicant answers a landlord's question, the review goes back to 'pending'.
create or replace function public.application_message_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_role = 'applicant' then
    update public.applications set owner_review_status = 'pending'
     where id = new.application_id and owner_review_status = 'info_requested';
  end if;
  return new;
end;
$$;
revoke execute on function public.application_message_reopen() from public, anon, authenticated;
drop trigger if exists application_messages_reopen on public.application_messages;
create trigger application_messages_reopen after insert on public.application_messages
  for each row execute function public.application_message_reopen();

-- Applicants who applied before landlords were included agree to share their application
-- with the property's owner (the website shows them a one-click button).
create or replace function public.applicant_agree_owner_review(p_application_id uuid, p_consent_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_consent_text, '') not ilike '%owner%' then raise exception 'Missing consent text'; end if;
  update public.applications set consent_text = p_consent_text, consent_at = now()
   where id = p_application_id and user_id = auth.uid() and status not in ('withdrawn', 'declined');
  if not found then raise exception 'Application not found'; end if;
end;
$$;
revoke execute on function public.applicant_agree_owner_review(uuid, text) from public, anon;
grant execute on function public.applicant_agree_owner_review(uuid, text) to authenticated;

-- Retention: credit reports follow the same rule as applicant documents (0014). Reports for
-- applications that closed more than p_days ago, and didn't become a current tenancy.
create or replace function public.screening_reports_due_for_deletion(p_days integer default 80)
returns table (application_id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.credit_report_path
    from public.applications a
   where a.credit_report_path is not null
     and a.status in ('declined', 'withdrawn', 'approved')
     and coalesce(a.decided_at, a.updated_at) < now() - make_interval(days => p_days)
     and not exists (select 1 from public.tenancies t
                      where t.application_id = a.id and t.status in ('upcoming', 'active', 'notice'))
$$;
revoke execute on function public.screening_reports_due_for_deletion(integer) from public, anon, authenticated;
grant execute on function public.screening_reports_due_for_deletion(integer) to service_role;
