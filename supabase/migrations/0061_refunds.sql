-- 0061: refunds to tenants and landlords.
--
-- Tenant refunds:
--   overpaid         money a tenant paid beyond what they owed. Uses up their credit (balance goes back up).
--   rent             a month's rent given back (e.g. leaving early). That month counts as not charged and not paid.
--   last_month_rent  last month's rent returned at move-out. No change to the rent ledger.
--   other            recorded with a note only.
--   funding: 'landlord' takes it off the landlord's payout (a statement deduction); 'irep' means IRep covers it.
-- Landlord refunds (a fee or work order charged by mistake, say):
--   funding: 'payout' adds a credit to their statement; 'separate' means IRep sent it on its own.

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  recipient text not null check (recipient in ('tenant', 'landlord')),
  tenancy_id uuid references public.tenancies (id) on delete set null,
  property_id uuid not null references public.properties (id) on delete cascade,
  reason text not null check (reason in ('overpaid', 'rent', 'last_month_rent', 'fee', 'work_order', 'other')),
  rent_period date check (rent_period is null or extract(day from rent_period) = 1),
  amount numeric(10, 2) not null check (amount > 0),
  funding text not null check (funding in ('landlord', 'irep', 'payout', 'separate')),
  statement_period date check (statement_period is null or extract(day from statement_period) = 1),
  statement_item_id uuid references public.statement_items (id) on delete set null,
  status text not null default 'to_send' check (status in ('to_send', 'sent')),
  sent_on date,
  method text check (method is null or method in ('etransfer', 'cheque', 'direct_deposit', 'payout', 'other')),
  reference text,
  note text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (recipient = 'landlord' or tenancy_id is not null),
  check ((recipient = 'tenant') = (funding in ('landlord', 'irep'))),
  check ((recipient = 'tenant') = (reason in ('overpaid', 'rent', 'last_month_rent', 'other')) or reason = 'other'),
  check (reason not in ('overpaid', 'rent') or rent_period is not null),
  check (funding not in ('landlord', 'payout') or statement_period is not null)
);
create index if not exists refunds_tenancy_idx on public.refunds (tenancy_id) where recipient = 'tenant';
create index if not exists refunds_property_idx on public.refunds (property_id, created_at desc);

alter table public.refunds enable row level security;
drop policy if exists "refunds: staff all" on public.refunds;
create policy "refunds: staff all" on public.refunds
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.refunds from anon;

-- Adds the statement line (a deduction for a tenant refund the landlord covers, a credit for a landlord
-- refund added to their payout), and keeps the money fields from changing once saved.
create or replace function public.refunds_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
  unit_label text;
  what text;
  item uuid;
begin
  if tg_op = 'DELETE' then
    if old.statement_item_id is not null then
      delete from public.statement_items where id = old.statement_item_id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.recipient is distinct from old.recipient or new.tenancy_id is distinct from old.tenancy_id
       or new.property_id is distinct from old.property_id or new.reason is distinct from old.reason
       or new.rent_period is distinct from old.rent_period or new.amount is distinct from old.amount
       or new.funding is distinct from old.funding or new.statement_period is distinct from old.statement_period then
      raise exception 'A refund''s amount and details can''t be changed. Delete it and record it again.';
    end if;
    return new;
  end if;

  -- INSERT
  if new.recipient = 'tenant' then
    select u.property_id, u.label into new.property_id, unit_label
      from public.tenancies t join public.units u on u.id = t.unit_id where t.id = new.tenancy_id;
    select tt.full_name into who from public.tenancy_tenants tt
     where tt.tenancy_id = new.tenancy_id order by tt.is_primary desc, tt.created_at limit 1;
  end if;

  what := case new.reason
    when 'overpaid' then 'overpayment'
    when 'rent' then to_char(new.rent_period, 'FMMonth YYYY') || ' rent'
    when 'last_month_rent' then 'last month''s rent'
    when 'fee' then 'fee charged in error'
    when 'work_order' then 'work order charge'
    else 'refund' end;

  if new.funding = 'landlord' then
    insert into public.statement_items (property_id, period, kind, description, amount, tenancy_id)
    values (new.property_id, new.statement_period, 'expense',
            'Refund to tenant ' || coalesce(who, '') || coalesce(' (' || nullif(unit_label, '') || ')', '') || ': ' || what,
            -new.amount, new.tenancy_id)
    returning id into item;
    new.statement_item_id := item;
  elsif new.funding = 'payout' then
    insert into public.statement_items (property_id, period, kind, description, amount)
    values (new.property_id, new.statement_period, 'fee_adjustment', 'Refund from IRep: ' || what, new.amount)
    returning id into item;
    new.statement_item_id := item;
  end if;
  return new;
end;
$$;
revoke execute on function public.refunds_rules() from public, anon, authenticated;

drop trigger if exists refunds_rules on public.refunds;
create trigger refunds_rules before insert or update on public.refunds
  for each row execute function public.refunds_rules();
drop trigger if exists refunds_rules_delete on public.refunds;
create trigger refunds_rules_delete after delete on public.refunds
  for each row execute function public.refunds_rules();

-- Tenant ledger: an overpayment refund uses up the credit; a rent refund cancels that month's charge and payment.
create or replace view public.tenancy_balances with (security_invoker = true) as
 select t.id as tenancy_id,
    coalesce(c.total, 0::numeric) - coalesce(r.rent_back, 0::numeric) as charged,
    coalesce(p.total, 0::numeric) - coalesce(r.all_back, 0::numeric) as paid,
    coalesce(c.total, 0::numeric) - coalesce(r.rent_back, 0::numeric) - (coalesce(p.total, 0::numeric) - coalesce(r.all_back, 0::numeric)) as balance,
    p.last_paid_on
   from tenancies t
     left join ( select rent_charges.tenancy_id, sum(rent_charges.amount) as total
           from rent_charges
          where rent_charges.period <= (now() at time zone 'America/Toronto'::text)::date
          group by rent_charges.tenancy_id) c on c.tenancy_id = t.id
     left join ( select payments.tenancy_id, sum(payments.amount) as total, max(payments.received_on) as last_paid_on
           from payments
          where payments.status = 'matched'::text and payments.kind = 'rent'::text
          group by payments.tenancy_id) p on p.tenancy_id = t.id
     left join ( select refunds.tenancy_id,
            sum(refunds.amount) filter (where refunds.reason = 'rent'
              and refunds.rent_period <= (now() at time zone 'America/Toronto'::text)::date) as rent_back,
            sum(refunds.amount) filter (where refunds.reason = 'overpaid'
              or (refunds.reason = 'rent' and refunds.rent_period <= (now() at time zone 'America/Toronto'::text)::date)) as all_back
           from refunds
          where refunds.recipient = 'tenant' and refunds.reason in ('overpaid', 'rent')
          group by refunds.tenancy_id) r on r.tenancy_id = t.id;

create or replace view public.rent_collection with (security_invoker = true) as
 select c.period,
    c.tenancy_id,
    u.property_id,
    (c.amount - coalesce(r.rent_back, 0::numeric))::numeric(10, 2) as due,
    coalesce(p.total, 0::numeric) - coalesce(r.all_back, 0::numeric) as paid,
    greatest(coalesce(p.by7, 0::numeric) - coalesce(r.all_back, 0::numeric), 0::numeric) as paid_by_7th,
    c.amount - coalesce(r.rent_back, 0::numeric) - (coalesce(p.total, 0::numeric) - coalesce(r.all_back, 0::numeric)) as outstanding,
    p.last_paid_on,
    coalesce(p.methods, '{}'::text[]) as methods
   from rent_charges c
     join tenancies t on t.id = c.tenancy_id
     join units u on u.id = t.unit_id
     left join lateral ( select sum(x.amount) as total,
            sum(x.amount) filter (where x.received_on <= (c.period + 6)) as by7,
            max(x.received_on) as last_paid_on,
            array_remove(array_agg(distinct x.method), null::text) as methods
           from payments x
          where x.tenancy_id = c.tenancy_id and x.period = c.period and x.status = 'matched'::text and x.kind = 'rent'::text) p on true
     left join lateral ( select sum(f.amount) filter (where f.reason = 'rent') as rent_back,
            sum(f.amount) as all_back
           from refunds f
          where f.recipient = 'tenant' and f.tenancy_id = c.tenancy_id and f.rent_period = c.period
            and f.reason in ('overpaid', 'rent')) r on true
  where c.kind = 'rent'::text;
