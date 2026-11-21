-- 0075: onboarding when a lease or lease amendment is signed (Project 2), and staff tasks.
--   * staff_tasks: one list of things to do or waiting on others (Needs setup, LMR top-up, AI drafts...).
--   * lease_onboarding: one item per signed lease or amendment, with the PayProp checklist.
--   * tenancy_changes: an amendment's rent / tenant changes, applied on the effective date (daily job).
--   * signature_requests.kind 'lease_amendment'.
-- Run AFTER 0074. Safe to re-run.

create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'other'
    check (kind in ('needs_setup', 'lmr_topup', 'amendment', 'follow_up', 'draft_email', 'ai', 'other')),
  title text not null check (length(trim(title)) > 0),
  detail text,
  status text not null default 'open' check (status in ('open', 'waiting', 'done', 'dismissed')),
  waiting_on text,
  waiting_since date,
  due_date date,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  signature_request_id uuid references public.signature_requests (id) on delete set null,
  link text,
  data jsonb not null default '{}'::jsonb,
  source text not null default 'staff' check (source in ('system', 'staff', 'ai')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create index if not exists staff_tasks_open_idx on public.staff_tasks (status, created_at desc) where status in ('open', 'waiting');
create unique index if not exists staff_tasks_one_per_request on public.staff_tasks (signature_request_id, kind)
  where signature_request_id is not null and kind in ('needs_setup', 'amendment');
alter table public.staff_tasks enable row level security;
drop policy if exists "staff_tasks: staff all" on public.staff_tasks;
create policy "staff_tasks: staff all" on public.staff_tasks for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.staff_tasks from anon;

create table if not exists public.lease_onboarding (
  id uuid primary key default gen_random_uuid(),
  signature_request_id uuid not null unique references public.signature_requests (id) on delete cascade,
  kind text not null check (kind in ('lease', 'amendment')),
  tenancy_id uuid references public.tenancies (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  needs_payprop boolean not null default true,
  payprop_added boolean not null default false,
  payprop_letter_sent boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'done')),
  summary_sent_at timestamptz,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create index if not exists lease_onboarding_open_idx on public.lease_onboarding (status) where status = 'open';
alter table public.lease_onboarding enable row level security;
drop policy if exists "lease_onboarding: staff all" on public.lease_onboarding;
create policy "lease_onboarding: staff all" on public.lease_onboarding for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.lease_onboarding from anon;

create table if not exists public.tenancy_changes (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  signature_request_id uuid references public.signature_requests (id) on delete set null,
  effective_date date not null,
  new_rent numeric(10, 2) check (new_rent is null or new_rent > 0),
  add_tenants jsonb not null default '[]'::jsonb,
  remove_tenant_ids uuid[] not null default '{}',
  note text,
  applied_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.tenancy_changes enable row level security;
drop policy if exists "tenancy_changes: staff all" on public.tenancy_changes;
create policy "tenancy_changes: staff all" on public.tenancy_changes for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.tenancy_changes from anon;

-- Applies amendments whose effective date has come: the new rent (this month's and later rent
-- charges follow it) and tenants added or taken off. Run daily; safe to run again.
create or replace function public.apply_tenancy_changes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  p jsonb;
  n integer := 0;
  today date := (now() at time zone 'America/Toronto')::date;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only'; end if;
  for c in select * from public.tenancy_changes where applied_at is null and effective_date <= today order by effective_date loop
    if c.new_rent is not null then
      update public.tenancies set rent = c.new_rent where id = c.tenancy_id;
      update public.rent_charges set amount = c.new_rent
       where tenancy_id = c.tenancy_id and kind = 'rent' and period >= date_trunc('month', c.effective_date)::date
         and not public.is_period_locked(period);
    end if;
    for p in select * from jsonb_array_elements(c.add_tenants) loop
      if coalesce(trim(p->>'full_name'), '') <> '' then
        insert into public.tenancy_tenants (tenancy_id, full_name, email, phone, is_primary)
        values (c.tenancy_id, trim(p->>'full_name'), nullif(lower(trim(p->>'email')), ''), nullif(trim(p->>'phone'), ''), false);
      end if;
    end loop;
    if array_length(c.remove_tenant_ids, 1) > 0 then
      update public.tenancy_tenants set tenancy_id = null, is_primary = false
       where id = any (c.remove_tenant_ids) and tenancy_id = c.tenancy_id;
    end if;
    update public.tenancy_changes set applied_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.apply_tenancy_changes() from public, anon;
grant execute on function public.apply_tenancy_changes() to authenticated, service_role;

alter table public.signature_requests drop constraint if exists signature_requests_kind_check;
alter table public.signature_requests add constraint signature_requests_kind_check check (kind in
  ('lease', 'lease_amendment', 'pm_contract', 'N1', 'N4', 'N5', 'N9', 'N11', 'certificate_of_service', 'other'));
