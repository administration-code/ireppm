-- 0080: ID and other sensitive documents.
--   sensitive_documents: ID or sensitive files staff received by text, WhatsApp or email and saved to an
--     applicant's or tenant's file (private applicant-docs bucket, under sensitive/).
--   Landlords see sensitive files only on a secure page that expires (sensitive_view_tokens), and every
--   view is logged (sensitive_doc_views).
--   ID verification is stored only as "verified by <staff> on <date>", never an ID or licence number.
--   Retention: sensitive files are deleted 30 days after the application is declined or withdrawn
--     (photo ID and bank statements the applicant uploaded too). Other documents keep the 90-day rule (0014).
-- Run AFTER 0079. Safe to re-run.

create table if not exists public.sensitive_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete cascade,
  tenancy_id uuid references public.tenancies (id) on delete cascade,
  kind text not null check (kind in ('photo_id', 'proof_of_income', 'bank_statement', 'other')),
  label text not null check (length(trim(label)) between 1 and 120 and label !~ '\d{5,}'),
  received_via text not null check (received_via in ('text', 'whatsapp', 'email', 'in_person', 'other')),
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  original_deleted_at timestamptz,          -- staff confirmed the copy in the email/chat is gone
  constraint sensitive_documents_owner check (application_id is not null or tenancy_id is not null)
);
create index if not exists sensitive_documents_app_idx on public.sensitive_documents (application_id);
create index if not exists sensitive_documents_tenancy_idx on public.sensitive_documents (tenancy_id);
alter table public.sensitive_documents enable row level security;
drop policy if exists "sensitive_documents: staff read" on public.sensitive_documents;
create policy "sensitive_documents: staff read" on public.sensitive_documents for select using (public.is_staff());
drop policy if exists "sensitive_documents: staff update" on public.sensitive_documents;
create policy "sensitive_documents: staff update" on public.sensitive_documents for update using (public.is_staff()) with check (public.is_staff());
revoke all on public.sensitive_documents from anon;

-- Short-lived links to the secure viewing page (15 minutes, one viewer).
create table if not exists public.sensitive_view_tokens (
  token text primary key,
  application_id uuid references public.applications (id) on delete cascade,
  doc_type text,                                   -- an applicant-uploaded document (photo_id, bank_statement…)
  sensitive_document_id uuid references public.sensitive_documents (id) on delete cascade,
  viewer_id uuid not null,
  viewer_role text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.sensitive_view_tokens enable row level security;  -- server only
revoke all on public.sensitive_view_tokens from anon, authenticated;

-- Every view of a sensitive document.
create table if not exists public.sensitive_doc_views (
  id uuid primary key default gen_random_uuid(),
  viewed_at timestamptz not null default now(),
  application_id uuid references public.applications (id) on delete set null,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  sensitive_document_id uuid references public.sensitive_documents (id) on delete set null,
  doc_type text,
  viewer_id uuid,
  viewer_role text not null,
  viewer_name text,
  ip text,
  user_agent text
);
create index if not exists sensitive_doc_views_app_idx on public.sensitive_doc_views (application_id, viewed_at desc);
alter table public.sensitive_doc_views enable row level security;
drop policy if exists "sensitive_doc_views: staff read" on public.sensitive_doc_views;
create policy "sensitive_doc_views: staff read" on public.sensitive_doc_views for select using (public.is_staff());
revoke all on public.sensitive_doc_views from anon;

-- "ID verified by <staff> on <date>": the only ID record kept.
alter table public.applications add column if not exists id_verified_by uuid;
alter table public.applications add column if not exists id_verified_by_name text;
alter table public.applications add column if not exists id_verified_on date;
alter table public.tenancies add column if not exists id_verified_by uuid;
alter table public.tenancies add column if not exists id_verified_by_name text;
alter table public.tenancies add column if not exists id_verified_on date;

-- For the application's staff and its landlord: the sensitive files (names only) and the ID check.
create or replace function public.application_sensitive_docs(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  role text := public.application_role(p_application_id);
  a public.applications;
begin
  if role is null or role = 'applicant' then raise exception 'Not allowed'; end if;
  select * into a from public.applications where id = p_application_id;
  return jsonb_build_object(
    'verified', case when a.id_verified_on is not null
                     then jsonb_build_object('by', a.id_verified_by_name, 'on', a.id_verified_on) end,
    'docs', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'label', d.label, 'uploaded_at', d.uploaded_at)
                                       order by d.uploaded_at)
                        from public.sensitive_documents d where d.application_id = p_application_id), '[]'::jsonb)
  );
end;
$fn$;
revoke execute on function public.application_sensitive_docs(uuid) from public, anon;
grant execute on function public.application_sensitive_docs(uuid) to authenticated, service_role;

-- Retention, 30 days after an unsuccessful application.
-- Staff-saved sensitive files on applications that were declined or withdrawn (not ones also on a tenancy).
create or replace function public.sensitive_docs_due(p_days integer default 30)
returns table (id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $fn$
  select d.id, d.file_path
    from public.sensitive_documents d
    join public.applications a on a.id = d.application_id
   where d.tenancy_id is null
     and a.status in ('declined', 'withdrawn')
     and coalesce(a.decided_at, a.updated_at) < now() - make_interval(days => p_days)
$fn$;
revoke execute on function public.sensitive_docs_due(integer) from public, anon, authenticated;
grant execute on function public.sensitive_docs_due(integer) to service_role;

-- Photo ID and bank statements an applicant uploaded, once all their applications were unsuccessful
-- (same test as documents_due_for_deletion in 0014, sooner, and only these two kinds).
create or replace function public.applicant_sensitive_due(p_days integer default 30)
returns table (user_id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $fn$
  select d.user_id, d.file_path
    from public.applicant_documents d
   where d.doc_type in ('photo_id', 'bank_statement')
     and exists (select 1 from public.applications a where a.user_id = d.user_id)
     and not exists (select 1 from public.applications a
                      where a.user_id = d.user_id and a.status in ('submitted', 'reviewing', 'approved'))
     and (select max(coalesce(a.decided_at, a.updated_at)) from public.applications a
           where a.user_id = d.user_id) < now() - make_interval(days => p_days)
     and not exists (select 1 from public.tenancy_tenants tt join public.tenancies t on t.id = tt.tenancy_id
                      where tt.profile_id = d.user_id and t.status in ('upcoming', 'active', 'notice'))
$fn$;
revoke execute on function public.applicant_sensitive_due(integer) from public, anon, authenticated;
grant execute on function public.applicant_sensitive_due(integer) to service_role;

-- After the files are removed from storage: drop the records and the entries on the applications, and log it.
create or replace function public.finish_sensitive_deletion(p_user_id uuid, p_paths text[], p_sensitive_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n integer := 0;
  m integer := 0;
begin
  if p_user_id is not null and coalesce(array_length(p_paths, 1), 0) > 0 then
    delete from public.applicant_documents where user_id = p_user_id and file_path = any (p_paths);
    get diagnostics n = row_count;
    update public.applications
       set documents = coalesce((select jsonb_agg(e) from jsonb_array_elements(documents) e
                                  where not (e->>'path' = any (p_paths))), '[]'::jsonb)
     where user_id = p_user_id and status in ('declined', 'withdrawn');
  end if;
  if coalesce(array_length(p_sensitive_ids, 1), 0) > 0 then
    delete from public.sensitive_documents where id = any (p_sensitive_ids);
    get diagnostics m = row_count;
  end if;
  if n + m > 0 then
    insert into public.document_deletions (user_id, files_deleted, reason)
    values (p_user_id, n + m, 'Unsuccessful application: ID and sensitive documents deleted after 30 days');
  end if;
  return n + m;
end;
$fn$;
revoke execute on function public.finish_sensitive_deletion(uuid, text[], uuid[]) from public, anon, authenticated;
grant execute on function public.finish_sensitive_deletion(uuid, text[], uuid[]) to service_role;
