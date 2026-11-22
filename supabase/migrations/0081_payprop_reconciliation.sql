-- 0081: PayProp reconciliation. Staff upload PayProp's "All Payments" CSV each month; each line
-- (one per tenant payment per beneficiary share) is kept here and matched against the portal's
-- PayProp rent payments, PayProp landlord payouts, and the PayProp deposits at Scotiabank.
-- Safe to re-run.

create table if not exists public.payprop_lines (
  payment_record_id text primary key,          -- PayProp PaymentRecordID (one beneficiary share)
  payprop_payment_id text not null,            -- PayProp ID (the tenant payment)
  payprop_property_id text,
  property_name text,
  payor_name text,
  bank_date date,                              -- when the tenant's money reached PayProp
  paid_amount numeric(12,2),
  ben_type text,                               -- B = owner, C = IRep (agency)
  payee_name text,
  after_split numeric(12,2),                   -- this beneficiary's share
  after_split_tax numeric(12,2),
  transferred_date date,                       -- when PayProp paid it out
  remit_id text,
  category text,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);
create index if not exists payprop_lines_bank_idx on public.payprop_lines (bank_date);
create index if not exists payprop_lines_transfer_idx on public.payprop_lines (transferred_date);
alter table public.payprop_lines enable row level security;
drop policy if exists "payprop_lines: staff all" on public.payprop_lines;
create policy "payprop_lines: staff all" on public.payprop_lines for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.payprop_lines from anon;

-- Which portal property each PayProp property is (filled automatically, editable by staff).
create table if not exists public.payprop_properties (
  payprop_property_id text primary key,
  name text,
  property_id uuid references public.properties (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.payprop_properties enable row level security;
drop policy if exists "payprop_properties: staff all" on public.payprop_properties;
create policy "payprop_properties: staff all" on public.payprop_properties for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.payprop_properties from anon;
