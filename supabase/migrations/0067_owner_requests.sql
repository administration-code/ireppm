-- 0067: landlords ask IRep for information from their portal (a tenancy list, rent payments,
-- a statement, documents...). Staff answer and mark them done.
-- Owners read their own requests; they create them through /api/owner/requests (service role).

create table if not exists public.owner_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  kind text not null check (kind in ('tenancy_list', 'rent_payments', 'statement', 'year_end', 'documents', 'other')),
  period date check (period is null or extract(day from period) = 1),
  message text,
  status text not null default 'open' check (status in ('open', 'done')),
  staff_reply text,
  replied_by_email boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create index if not exists owner_requests_owner_idx on public.owner_requests (owner_id, created_at desc);
create index if not exists owner_requests_open_idx on public.owner_requests (created_at) where status = 'open';

alter table public.owner_requests enable row level security;
drop policy if exists "owner_requests: staff all" on public.owner_requests;
create policy "owner_requests: staff all" on public.owner_requests
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "owner_requests: owner reads own" on public.owner_requests;
create policy "owner_requests: owner reads own" on public.owner_requests
  for select using (public.is_owner_account(owner_id));
revoke all on public.owner_requests from anon;
