-- IRep Property Management: automatic deletion of unsuccessful applicants' documents.
-- The privacy policy promises: "If your application isn't successful, we delete
-- your application documents within 90 days." The daily job deletes them once
-- 80 days have passed since the decision (a margin inside the 90-day promise).
-- Run AFTER 0013. Safe to re-run.

-- When an application was decided (approved / declined / withdrawn).
alter table public.applications add column if not exists decided_at timestamptz;

create or replace function public.application_decided_at()
returns trigger language plpgsql as $$
begin
  if new.status in ('approved', 'declined', 'withdrawn') then
    if tg_op = 'INSERT' or old.status is distinct from new.status then
      new.decided_at := now();
    end if;
  else
    new.decided_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists applications_decided_at on public.applications;
create trigger applications_decided_at before insert or update of status on public.applications
  for each row execute function public.application_decided_at();

update public.applications set decided_at = coalesce(decided_at, updated_at)
 where status in ('approved', 'declined', 'withdrawn') and decided_at is null;

-- A record of every clean-up (no document contents, just what and when).
create table if not exists public.document_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  files_deleted integer not null,
  reason text not null,
  deleted_at timestamptz not null default now()
);
alter table public.document_deletions enable row level security;
drop policy if exists "document_deletions: staff read" on public.document_deletions;
create policy "document_deletions: staff read" on public.document_deletions
  for select using (public.is_staff());

-- Whose documents are due: people whose applications were ALL unsuccessful
-- (declined or withdrawn), the last decision at least p_days ago, nothing still
-- open or approved, and who aren't a current tenant.
create or replace function public.documents_due_for_deletion(p_days integer default 80)
returns table (user_id uuid, file_path text)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, d.file_path
    from public.applicant_documents d
   where exists (select 1 from public.applications a where a.user_id = d.user_id)
     and not exists (select 1 from public.applications a
                      where a.user_id = d.user_id and a.status in ('submitted', 'reviewing', 'approved'))
     and (select max(coalesce(a.decided_at, a.updated_at)) from public.applications a
           where a.user_id = d.user_id) < now() - make_interval(days => p_days)
     and not exists (select 1 from public.tenancy_tenants tt join public.tenancies t on t.id = tt.tenancy_id
                      where tt.profile_id = d.user_id and t.status in ('upcoming', 'active', 'notice'))
$$;
revoke execute on function public.documents_due_for_deletion(integer) from public, anon, authenticated;
grant execute on function public.documents_due_for_deletion(integer) to service_role;

-- After the files are removed from storage: delete the document records, clear the
-- file list kept on their applications, and log it.
create or replace function public.finish_document_deletion(p_user_id uuid, p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.applicant_documents where user_id = p_user_id and file_path = any (p_paths);
  get diagnostics n = row_count;
  update public.applications set documents = '[]'::jsonb
   where user_id = p_user_id and status in ('declined', 'withdrawn');
  insert into public.document_deletions (user_id, files_deleted, reason)
  values (p_user_id, n, 'Unsuccessful application: documents deleted within 90 days (privacy policy)');
  return n;
end;
$$;
revoke execute on function public.finish_document_deletion(uuid, text[]) from public, anon, authenticated;
grant execute on function public.finish_document_deletion(uuid, text[]) to service_role;
