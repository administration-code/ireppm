-- IRep Property Management: staff can delete leasing records (test entries, spam,
-- duplicates): showing requests, applications, landlord inquiries, draft listings and
-- unsent/failed signature requests. Every deletion is logged. Run AFTER 0017. Safe to re-run.

create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- showing_request, application, landlord_inquiry, listing, signature_request
  record_id uuid not null,
  user_id uuid,                       -- the renter, for applications and showings
  summary text,                       -- e.g. "Application: Jane Doe for 1746 Buckingham Dr, Upper"
  reason text,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_records_user_idx on public.deleted_records (user_id);
alter table public.deleted_records enable row level security;
drop policy if exists "deleted_records: staff read" on public.deleted_records;
create policy "deleted_records: staff read" on public.deleted_records
  for select using (public.is_staff());

-- Delete one leasing record. Returns the summary that was logged.
create or replace function public.delete_leasing_record(p_kind text, p_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  uid uuid;
  st text;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;

  if p_kind = 'showing_request' then
    select 'Showing: ' || coalesce(pr.full_name, pr.email, 'renter') || ' for ' || coalesce(l.address, 'a listing')
           || coalesce(', ' || l.unit, '') || ' on ' || to_char(sr.preferred_date, 'Mon FMDD, YYYY'), sr.user_id
      into s, uid
      from public.showing_requests sr
      left join public.profiles pr on pr.id = sr.user_id
      left join public.listings l on l.id = sr.listing_id
     where sr.id = p_id;
    if not found then raise exception 'Showing request not found'; end if;
    delete from public.showing_requests where id = p_id;

  elsif p_kind = 'application' then
    select 'Application: ' || a.applicant_name || ' for ' || coalesce(l.address, 'a listing') || coalesce(', ' || l.unit, ''),
           a.user_id
      into s, uid
      from public.applications a left join public.listings l on l.id = a.listing_id
     where a.id = p_id;
    if not found then raise exception 'Application not found'; end if;
    if exists (select 1 from public.tenancies where application_id = p_id) then
      raise exception 'This application led to a tenancy, so it is kept with the tenancy records.';
    end if;
    if exists (select 1 from public.signature_requests where application_id = p_id and status in ('sent', 'delivered', 'completed')) then
      raise exception 'A lease for this application has been sent in DocuSign. Void it first.';
    end if;
    delete from public.applications where id = p_id;

  elsif p_kind = 'landlord_inquiry' then
    select 'Landlord inquiry: ' || name || coalesce(' (' || property_address || ')', '') into s
      from public.landlord_inquiries where id = p_id;
    if not found then raise exception 'Inquiry not found'; end if;
    delete from public.landlord_inquiries where id = p_id;

  elsif p_kind = 'listing' then
    select 'Listing: ' || address || coalesce(', ' || unit, ''), status into s, st
      from public.listings where id = p_id;
    if not found then raise exception 'Listing not found'; end if;
    if st <> 'draft' then
      raise exception 'Only draft listings can be deleted. Mark it rented or unavailable instead.';
    end if;
    if exists (select 1 from public.applications where listing_id = p_id)
       or exists (select 1 from public.showing_requests where listing_id = p_id) then
      raise exception 'This listing has showings or applications. Delete those first.';
    end if;
    delete from public.listings where id = p_id;

  elsif p_kind = 'signature_request' then
    select coalesce(title, 'Signature request'), status into s, st from public.signature_requests where id = p_id;
    if not found then raise exception 'Signature request not found'; end if;
    if st not in ('draft', 'error', 'voided', 'declined') then
      raise exception 'Only drafts, failed, voided or declined requests can be deleted. Void it in DocuSign first.';
    end if;
    s := 'Signature request: ' || s;
    delete from public.signature_requests where id = p_id;

  else
    raise exception 'Unknown record type %', p_kind;
  end if;

  insert into public.deleted_records (kind, record_id, user_id, summary, reason, deleted_by)
  values (p_kind, p_id, uid, s, nullif(trim(p_reason), ''), auth.uid());
  return s;
end;
$$;
revoke execute on function public.delete_leasing_record(text, uuid, text) from public, anon;
grant execute on function public.delete_leasing_record(text, uuid, text) to authenticated;

-- Document retention (from 0014): a renter whose applications were all deleted still has
-- their documents removed within 90 days, counted from the deletion.
create or replace function public.documents_due_for_deletion(p_days integer default 80)
returns table (user_id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, d.file_path
    from public.applicant_documents d
   where (exists (select 1 from public.applications a where a.user_id = d.user_id)
          or exists (select 1 from public.deleted_records r where r.user_id = d.user_id and r.kind = 'application'))
     and not exists (select 1 from public.applications a
                      where a.user_id = d.user_id and a.status in ('submitted', 'reviewing', 'approved'))
     and greatest(
           (select max(coalesce(a.decided_at, a.updated_at)) from public.applications a where a.user_id = d.user_id),
           (select max(r.deleted_at) from public.deleted_records r where r.user_id = d.user_id and r.kind = 'application')
         ) < now() - make_interval(days => p_days)
     and not exists (select 1 from public.tenancy_tenants tt join public.tenancies t on t.id = tt.tenancy_id
                      where tt.profile_id = d.user_id and t.status in ('upcoming', 'active', 'notice'))
$$;
revoke execute on function public.documents_due_for_deletion(integer) from public, anon, authenticated;
grant execute on function public.documents_due_for_deletion(integer) to service_role;
