-- 0084: cash Chuck collects from tenants, and when he deposits it.
--   * partners.collects_cash: who sees "Cash" in the Agent Portal (Chuck only, to start).
--   * cash_collections: one row per tenant cash payment Chuck logs. Logging it also records the rent
--     payment in the portal straight away (payments row, method cash).
--   * cash_deposits: one row per bank deposit (or e-Transfer to IRep) of the cash he's holding. The portal
--     matches a bank deposit to the bank line by amount and date once the bank file is imported.
-- Partners never read these tables directly: the Agent Portal goes through the server (/api/agent/cash).
-- Run AFTER 0083. Safe to re-run.

alter table public.partners add column if not exists collects_cash boolean not null default false;
update public.partners set collects_cash = true where id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576';

create table if not exists public.cash_deposits (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  deposited_on date not null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'bank_deposit' check (method in ('bank_deposit', 'etransfer')),
  note text,
  bank_transaction_id uuid references public.bank_transactions (id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cash_deposits_unmatched_idx on public.cash_deposits (deposited_on) where bank_transaction_id is null;

create table if not exists public.cash_collections (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  tenancy_id uuid not null references public.tenancies (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  collected_on date not null,
  kind text not null default 'rent' check (kind in ('rent', 'last_month_rent', 'key_deposit', 'other')),
  note text,
  payment_id uuid references public.payments (id) on delete set null,
  deposit_id uuid references public.cash_deposits (id) on delete set null,
  status text not null default 'held' check (status in ('held', 'deposited', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists cash_collections_held_idx on public.cash_collections (partner_id, collected_on) where status = 'held';

alter table public.cash_deposits enable row level security;
alter table public.cash_collections enable row level security;
drop policy if exists "cash_deposits: staff all" on public.cash_deposits;
create policy "cash_deposits: staff all" on public.cash_deposits for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "cash_collections: staff all" on public.cash_collections;
create policy "cash_collections: staff all" on public.cash_collections for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.cash_deposits from anon;
revoke all on public.cash_collections from anon;
