-- PayProp welcome letters: staff upload the letter PayProp generates for a tenancy; tenants get it
-- by email and can download it from their account. Private bucket 'tenancy-documents' (staff only;
-- tenants download through a 60-second link from the website after a check that it's their tenancy).
alter table public.tenancies add column if not exists payprop_letter_path text;
alter table public.tenancies add column if not exists payprop_letter_name text;
alter table public.tenancies add column if not exists payprop_letter_sent_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenancy-documents', 'tenancy-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "tenancy-documents: staff all" on storage.objects;
create policy "tenancy-documents: staff all" on storage.objects
  for all using (bucket_id = 'tenancy-documents' and public.is_staff())
  with check (bucket_id = 'tenancy-documents' and public.is_staff());
