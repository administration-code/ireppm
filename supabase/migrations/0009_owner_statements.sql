-- IRep Property Management: landlord statements and payouts (back office, step 4).
-- Run AFTER 0008. Safe to re-run.

-- Some owners pay the management fee separately (e.g. 370 Cameron via Square),
-- so it isn't taken from their rent.
alter table public.properties add column if not exists fee_billed_separately boolean not null default false;

-- Rent a tenant paid straight to the landlord: clears the tenant's balance but
-- isn't money IRep collected or forwards.
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('etransfer', 'payprop', 'cash', 'direct_deposit', 'cheque', 'last_month_applied', 'paid_to_owner', 'other'));

-- ---------------------------------------------------------------------------
-- Statement items: leasing fees, expenses, fee adjustments, carry-overs.
-- amount is from the owner's side: positive adds to what they get, negative deducts.
-- ---------------------------------------------------------------------------
create table if not exists public.statement_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  kind text not null check (kind in ('leasing_fee', 'expense', 'fee_adjustment', 'carryover', 'other')),
  description text not null,
  amount numeric(10, 2) not null,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists statement_items_property_period_idx on public.statement_items (property_id, period);
drop trigger if exists statement_items_touch on public.statement_items;
create trigger statement_items_touch before update on public.statement_items
  for each row execute function public.touch_updated_at();

-- Money sent to the owner (e-Transfer, or PayProp's payout after its fee).
create table if not exists public.owner_payouts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  paid_on date not null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null default 'etransfer' check (method in ('etransfer', 'payprop', 'cheque', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_payouts_property_period_idx on public.owner_payouts (property_id, period);
drop trigger if exists owner_payouts_touch on public.owner_payouts;
create trigger owner_payouts_touch before update on public.owner_payouts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Work orders charged to the tenant become a charge on their rent ledger.
-- ---------------------------------------------------------------------------
create unique index if not exists rent_charges_one_per_work_order
  on public.rent_charges (maintenance_request_id) where maintenance_request_id is not null;

create or replace function public.maintenance_chargeback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and new.charge_to = 'tenant' and new.tenancy_id is not null
     and coalesce(new.actual_cost, 0) > 0 then
    insert into public.rent_charges (tenancy_id, period, kind, amount, description, maintenance_request_id)
    values (new.tenancy_id,
            date_trunc('month', coalesce(new.completed_at, now()) at time zone 'America/Toronto')::date,
            'chargeback', new.actual_cost, 'Repair charged to tenant: ' || new.title, new.id)
    on conflict (maintenance_request_id) where maintenance_request_id is not null
    do update set amount = excluded.amount, description = excluded.description;
  end if;
  return new;
end;
$$;
revoke execute on function public.maintenance_chargeback() from public, anon, authenticated;

drop trigger if exists maintenance_chargeback on public.maintenance_requests;
create trigger maintenance_chargeback after insert or update of status, charge_to, actual_cost on public.maintenance_requests
  for each row execute function public.maintenance_chargeback();

-- ---------------------------------------------------------------------------
-- Monthly landlord statement, one row per property per month.
--   Rent counts in the later of its rent month and the month it arrived
--   (early payments count in their rent month; late arrears in the month received).
--   Last month's rent counts in the later of the month received and the lease's first month.
--   Work orders charged to the owner count in the month they were completed.
-- ---------------------------------------------------------------------------
create or replace view public.owner_statements
with (security_invoker = true) as
with
hst as (select coalesce((select amount from public.service_rates where key = 'hst'), 13) as pct),
pay as (
  select u.property_id, p.amount, p.kind, p.method,
         case when p.kind = 'rent'
              then greatest(coalesce(p.period, date_trunc('month', p.received_on)::date), date_trunc('month', p.received_on)::date)
              else greatest(date_trunc('month', p.received_on)::date, date_trunc('month', t.start_date)::date) end as month
    from public.payments p
    join public.tenancies t on t.id = p.tenancy_id
    join public.units u on u.id = t.unit_id
   where p.status = 'matched'),
exp as (
  select u.property_id,
         date_trunc('month', coalesce(m.completed_at, m.updated_at) at time zone 'America/Toronto')::date as month,
         m.actual_cost as amount
    from public.maintenance_requests m
    join public.units u on u.id = m.unit_id
   where m.status = 'completed' and m.charge_to = 'owner' and coalesce(m.actual_cost, 0) > 0),
months as (
  select u.property_id, c.period as month
    from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id join public.units u on u.id = t.unit_id
   where c.kind = 'rent'
  union select property_id, period from public.statement_items
  union select property_id, period from public.owner_payouts
  union select property_id, month from pay
  union select property_id, month from exp)
select pr.id as property_id, mo.month as period,
       coalesce((select sum(c.amount) from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                  join public.units u on u.id = t.unit_id
                 where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent'), 0) as rent_expected,
       coalesce((select sum(rc.paid_by_7th) from public.rent_collection rc
                 where rc.property_id = pr.id and rc.period = mo.month), 0) as paid_by_7th,
       coalesce((select sum(greatest(rc.outstanding, 0)) from public.rent_collection rc
                 where rc.property_id = pr.id and rc.period = mo.month), 0) as rent_outstanding,
       coalesce((select sum(x.amount) from pay x where x.property_id = pr.id and x.month = mo.month
                  and x.kind = 'rent' and x.method not in ('last_month_applied', 'paid_to_owner')), 0) as rent_collected,
       coalesce((select sum(x.amount) from pay x where x.property_id = pr.id and x.month = mo.month
                  and x.kind = 'last_month_rent'), 0) as last_month_forwarded,
       fee.amount as mgmt_fee,
       round(fee.amount * (select pct from hst) / 100, 2) as mgmt_fee_hst,
       coalesce((select sum(e.amount) from exp e where e.property_id = pr.id and e.month = mo.month), 0) as work_orders,
       coalesce((select sum(i.amount) from public.statement_items i where i.property_id = pr.id and i.period = mo.month), 0) as items_total,
       coalesce((select sum(o.amount) from public.owner_payouts o where o.property_id = pr.id and o.period = mo.month), 0) as paid_out,
       pr.fee_billed_separately
  from public.properties pr
  join (select distinct property_id, month from months) mo on mo.property_id = pr.id
  -- The management fee applies to months with rent due, unless the owner pays it separately.
  cross join lateral (
    select case when pr.fee_billed_separately
                  or not exists (select 1 from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                                   join public.units u on u.id = t.unit_id
                                  where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent')
                then 0 else coalesce(pr.monthly_fee, 0) end as amount) fee;

-- Same, with the totals worked out.
create or replace view public.owner_statement_totals
with (security_invoker = true) as
  select s.*,
         s.rent_collected + s.last_month_forwarded as gross,
         s.rent_collected + s.last_month_forwarded - s.mgmt_fee - s.mgmt_fee_hst - s.work_orders + s.items_total as net_due,
         s.rent_collected + s.last_month_forwarded - s.mgmt_fee - s.mgmt_fee_hst - s.work_orders + s.items_total - s.paid_out as to_pay,
         (s.rent_expected > 0 and s.paid_by_7th >= s.rent_expected) as full_by_7th
    from public.owner_statements s;

-- ---------------------------------------------------------------------------
-- Access: staff only.
-- ---------------------------------------------------------------------------
alter table public.statement_items enable row level security;
alter table public.owner_payouts enable row level security;

drop policy if exists "statement_items: staff all" on public.statement_items;
create policy "statement_items: staff all" on public.statement_items
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "owner_payouts: staff all" on public.owner_payouts;
create policy "owner_payouts: staff all" on public.owner_payouts
  for all using (public.is_staff()) with check (public.is_staff());

revoke all on public.owner_statements, public.owner_statement_totals from anon;
