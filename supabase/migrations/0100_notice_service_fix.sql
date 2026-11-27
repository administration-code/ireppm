-- 0100: fix "Mark Served" for N-forms.
-- Since migration 0015, signing an N-form in DocuSign created a notice marked "served" on the
-- signing date (without linking it to the form). Recording the real service then failed, because
-- the form already had a notice ("That didn't save"). Now:
--   1. Signing no longer creates a notice: it's served when Chuck or staff record the service.
--   2. record_notice_service fills in the existing notice (date, method, who) if there is one.
--   3. Existing notices are linked to their forms, and where the Certificate of Service has the real
--      date and method, the notice gets them and is linked. The rest are marked "service date not
--      confirmed" and left unlinked, so Mark Served still shows for them.
-- Run AFTER 0099. Safe to re-run.

create or replace function public.log_signed_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- N-forms are served when the service is recorded (record_notice_service), not when signed.
  return new;
end;
$$;

create or replace function public.record_notice_service(p_request_id uuid, p_served_on date, p_method text, p_served_by text default null)
returns uuid language plpgsql security definer set search_path = public as $$
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

  select email_service_ok into ok from public.tenancies where id = r.tenancy_id;
  if p_method = 'email' and not coalesce(ok, false) then
    raise exception 'This tenant has not consented in writing to email service. Serve it by hand, mail slot or mail.';
  end if;

  select id into nid from public.notices where signature_request_id = r.id;
  if nid is not null then
    update public.notices
       set served_on = p_served_on, service_method = p_method, served_by = p_served_by, status = 'served',
           notes = nullif(trim(both ' ' from replace(replace(coalesce(notes, ''), 'Signed through DocuSign', ''),
                                                     'Service date not confirmed (recorded automatically when signed).', '')), '')
     where id = nid;
  else
    insert into public.notices (tenancy_id, form, served_on, service_method, served_by, effective_date, amount,
                                status, notes, signature_request_id)
    values (r.tenancy_id, r.kind, p_served_on, p_method, p_served_by,
            nullif(r.terms->>'effective_date', '')::date, nullif(r.terms->>'amount', '')::numeric,
            'served', nullif(r.terms->>'notes', ''), r.id)
    returning id into nid;
  end if;

  update public.signature_requests set notice_id = nid where id = r.id;
  return nid;
end;
$$;

-- Existing notices: take the real date and method from the Certificate of Service where it has them.
with cert as (
  select distinct on (c.related_request_id) c.related_request_id, c.terms->>'served_on' served_on, c.terms->>'method' method
  from public.signature_requests c
  where c.kind = 'certificate_of_service' and c.status in ('sent', 'delivered', 'completed') and coalesce(c.terms->>'served_on', '') <> ''
  order by c.related_request_id, (c.status = 'completed') desc, c.created_at desc
)
update public.notices n
   set served_on = cert.served_on::date,
       service_method = case
         when cert.method in ('handed', 'adult', 'employee') then 'in_person'
         when cert.method in ('mail_slot', 'mailbox') then 'mail_slot'
         when cert.method in ('mail', 'courier') then cert.method
         when coalesce(cert.method, '') = '' then n.service_method
         else 'other' end,
       served_by = coalesce(n.served_by, 'Zan Greksa'),
       notes = nullif(trim(both ' ' from replace(coalesce(n.notes, ''), 'Signed through DocuSign', '')), '')
  from cert
 where n.signature_request_id = cert.related_request_id and n.notes = 'Signed through DocuSign';

update public.notices
   set notes = 'Service date not confirmed (recorded automatically when signed).'
 where notes = 'Signed through DocuSign';

-- Link the confirmed ones. Unconfirmed ones stay unlinked, so Mark Served (staff) or Mark Delivered
-- (Chuck) still shows for them and fills in the real date.
update public.signature_requests s set notice_id = n.id
  from public.notices n
 where n.signature_request_id = s.id and s.notice_id is null
   and coalesce(n.notes, '') <> 'Service date not confirmed (recorded automatically when signed).';
