-- IRep Property Management: contractor pay tracker (e.g. Chuck).
--   * maintenance_requests.partner_pay: what the contractor charged, before HST. The owner
--     is billed that plus HST (actual_cost); IRep holds the HST back when paying the contractor.
--     Work-order earnings are paid in full (no loan share).
--   * partners.loan_share_pct / loan_name: part of the leasing fees owed to the contractor that
--     goes toward a loan instead of being paid out (Chuck: 50% to the truck loan).
--   * partner_ledger: leasing fees owed to the contractor, payments to them, the loan's
--     starting balance, extra loan payments and one-off adjustments.
-- Run AFTER 0050. Safe to re-run.

alter table public.maintenance_requests add column if not exists partner_pay numeric(10, 2)
  check (partner_pay is null or partner_pay >= 0);

alter table public.partners add column if not exists loan_share_pct numeric(5, 2) not null default 0
  check (loan_share_pct >= 0 and loan_share_pct <= 100);
alter table public.partners add column if not exists loan_name text;

create table if not exists public.partner_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  entry_date date not null default current_date,
  -- leasing_fee: leasing fee owed to them, before HST (raises what we owe; loan share applies)
  -- payment: money sent to the contractor          (lowers what we owe)
  -- loan_opening: loan balance owed (start or add)  (raises the loan balance)
  -- loan_payment: paid toward the loan another way  (lowers the loan balance)
  -- adjustment: + we owe them more / - we owe less
  kind text not null check (kind in ('leasing_fee', 'payment', 'loan_opening', 'loan_payment', 'adjustment')),
  amount numeric(10, 2) not null,
  method text,
  notes text,
  property_id uuid references public.properties (id) on delete set null,
  statement_item_id uuid references public.statement_items (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'adjustment' or amount > 0)
);
create index if not exists partner_ledger_partner_idx on public.partner_ledger (partner_id, entry_date);

alter table public.partner_ledger enable row level security;
drop policy if exists "partner_ledger: staff all" on public.partner_ledger;
create policy "partner_ledger: staff all" on public.partner_ledger
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.partner_ledger from anon;

-- Chuck: half of the leasing fees owed to him go to the truck loan.
update public.partners set loan_share_pct = 50, loan_name = 'Truck loan'
 where id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576' and loan_share_pct = 0;

-- His work orders from the Nov 1, 2026 list: before-HST price.
update public.maintenance_requests
   set partner_pay = case when charge_to = 'irep' then actual_cost else round(actual_cost / 1.13, 2) end
 where partner_id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576' and status = 'completed'
   and partner_pay is null and coalesce(actual_cost, 0) > 0
   and (staff_notes like 'From Chuck''s work order list%' or staff_notes like '%Chuck''s work order list:%');
