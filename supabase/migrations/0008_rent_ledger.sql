-- IRep Property Management: rent ledger (back office, step 3).
-- Rent charges, payments (e-Transfer, PayProp, cash, direct deposit), payer
-- matching, balances and the monthly collection board.
-- Run AFTER 0007. Safe to re-run.

-- Rent already paid to a previous manager (no charges are created up to this date).
alter table public.tenancies add column if not exists prepaid_through date;

-- ---------------------------------------------------------------------------
-- Charges: what a tenancy owes. One 'rent' charge per tenancy per month.
-- ---------------------------------------------------------------------------
create table if not exists public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  period date not null check (extract(day from period) = 1),      -- the rent month, e.g. 2026-10-01
  kind text not null default 'rent'
    check (kind in ('rent', 'opening_balance', 'chargeback', 'fee', 'other')),
  description text,
  amount numeric(10, 2) not null,
  maintenance_request_id uuid references public.maintenance_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rent_charges_one_rent_per_month
  on public.rent_charges (tenancy_id, period) where kind = 'rent';
create index if not exists rent_charges_period_idx on public.rent_charges (period);
drop trigger if exists rent_charges_touch on public.rent_charges;
create trigger rent_charges_touch before update on public.rent_charges
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Payments: money received. tenancy_id is empty until matched to a tenant.
-- A lump sum (e.g. cash Chuck collected and e-Transferred) is 'split' into
-- child payments, one per tenant; only the children count toward balances.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid references public.tenancies (id) on delete set null,
  suggested_tenancy_id uuid references public.tenancies (id) on delete set null,
  received_on date not null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null default 'etransfer'
    check (method in ('etransfer', 'payprop', 'cash', 'direct_deposit', 'cheque', 'last_month_applied', 'other')),
  kind text not null default 'rent'
    check (kind in ('rent', 'last_month_rent', 'key_deposit', 'other')),
  period date check (period is null or extract(day from period) = 1),   -- rent month it pays for
  payer_name text,
  memo text,                                 -- e-Transfer message
  reference text unique,                     -- Interac reference number / PayProp id
  source text not null default 'manual' check (source in ('interac_email', 'payprop', 'manual', 'split', 'import')),
  received_by text,                          -- e.g. 'Chuck' for cash
  parent_id uuid references public.payments (id) on delete cascade,
  status text not null default 'unmatched'
    check (status in ('matched', 'unmatched', 'split', 'ignored')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_tenancy_idx on public.payments (tenancy_id);
create index if not exists payments_period_idx on public.payments (period);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_parent_idx on public.payments (parent_id);
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Names a tenant's payments arrive under (e.g. a parent paying, "ricky" for Ricardo).
create table if not exists public.payer_aliases (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  payer_name text not null,
  payer_key text generated always as (lower(regexp_replace(trim(payer_name), '\s+', ' ', 'g'))) stored,
  created_at timestamptz not null default now(),
  unique (payer_key, tenancy_id)
);

-- ---------------------------------------------------------------------------
-- Matching: alias first, then a tenant's full name, then a first-name suggestion.
-- Only current tenancies (upcoming/active/notice) are considered.
-- ---------------------------------------------------------------------------
create or replace function public.payer_key(n text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(coalesce(n, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.match_payer(p_name text, out match_id uuid, out suggest_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text := public.payer_key(p_name);
  ids uuid[];
begin
  if k = '' then return; end if;

  select array_agg(distinct a.tenancy_id) into ids
    from public.payer_aliases a join public.tenancies t on t.id = a.tenancy_id
   where a.payer_key = k and t.status in ('upcoming', 'active', 'notice');
  if cardinality(ids) = 1 then match_id := ids[1]; return; end if;

  select array_agg(distinct tt.tenancy_id) into ids
    from public.tenancy_tenants tt join public.tenancies t on t.id = tt.tenancy_id
   where public.payer_key(tt.full_name) = k and t.status in ('upcoming', 'active', 'notice');
  if cardinality(ids) = 1 then match_id := ids[1]; return; end if;

  -- Suggestion only: the payer's first word matches exactly one tenant's first or last name.
  select array_agg(distinct tt.tenancy_id) into ids
    from public.tenancy_tenants tt join public.tenancies t on t.id = tt.tenancy_id
   where t.status in ('upcoming', 'active', 'notice')
     and split_part(k, ' ', 1) <> ''
     and (split_part(public.payer_key(tt.full_name), ' ', 1) = split_part(k, ' ', 1)
          or public.payer_key(tt.full_name) like '% ' || split_part(k, ' ', 1));
  if cardinality(ids) = 1 then suggest_id := ids[1]; end if;
end;
$$;
revoke execute on function public.match_payer(text) from public, anon;

-- Defaults, auto-matching and status housekeeping.
create or replace function public.payments_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  -- The rent month: payments from the 25th on count toward next month (paying early).
  if new.period is null and new.kind = 'rent' then
    new.period := case when extract(day from new.received_on) >= 25
                       then (date_trunc('month', new.received_on) + interval '1 month')::date
                       else date_trunc('month', new.received_on)::date end;
  end if;

  if tg_op = 'INSERT' and new.tenancy_id is null and new.status = 'unmatched' and new.payer_name is not null then
    select * into m from public.match_payer(new.payer_name);
    new.tenancy_id := m.match_id;
    new.suggested_tenancy_id := coalesce(new.suggested_tenancy_id, m.suggest_id);
  end if;

  if new.status in ('split', 'ignored') then
    null;
  elsif new.tenancy_id is not null then
    new.status := 'matched';
  else
    new.status := 'unmatched';
  end if;
  return new;
end;
$$;
revoke execute on function public.payments_rules() from public, anon, authenticated;

drop trigger if exists payments_rules on public.payments;
create trigger payments_rules before insert or update on public.payments
  for each row execute function public.payments_rules();

-- When staff match an e-Transfer by hand, remember the payer's name for next time.
create or replace function public.payments_remember_payer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'interac_email' and new.status = 'matched' and new.payer_name is not null
     and new.tenancy_id is not null and old.tenancy_id is distinct from new.tenancy_id then
    insert into public.payer_aliases (tenancy_id, payer_name)
    values (new.tenancy_id, new.payer_name)
    on conflict (payer_key, tenancy_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.payments_remember_payer() from public, anon, authenticated;

drop trigger if exists payments_remember_payer on public.payments;
create trigger payments_remember_payer after update of tenancy_id on public.payments
  for each row execute function public.payments_remember_payer();

-- ---------------------------------------------------------------------------
-- Monthly rent charges. Safe to call any number of times (staff pages and the
-- e-Transfer feed call it for the current month).
-- ---------------------------------------------------------------------------
create or replace function public.generate_rent_charges(p_month date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  n integer;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Staff only';
  end if;
  insert into public.rent_charges (tenancy_id, period, kind, amount, description)
  select t.id, m, 'rent', t.rent, to_char(m, 'FMMonth YYYY') || ' rent'
    from public.tenancies t
   where t.status in ('active', 'notice', 'upcoming', 'ended')
     and t.start_date <= m_end
     and (t.move_out_date is null or t.move_out_date >= m)    -- stops after the move-out month
     and not (t.status = 'ended' and t.move_out_date is null)
     -- (end_date alone doesn't stop rent: Ontario leases continue month-to-month)
     and (t.prepaid_through is null or t.prepaid_through < m)
  on conflict (tenancy_id, period) where kind = 'rent' do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.generate_rent_charges(date) from public, anon;
grant execute on function public.generate_rent_charges(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Balances and the collection board (staff only, via RLS on the base tables).
-- ---------------------------------------------------------------------------
create or replace view public.tenancy_balances
with (security_invoker = true) as
  select t.id as tenancy_id,
         coalesce(c.total, 0) as charged,
         coalesce(p.total, 0) as paid,
         coalesce(c.total, 0) - coalesce(p.total, 0) as balance,
         p.last_paid_on
    from public.tenancies t
    left join (select tenancy_id, sum(amount) total from public.rent_charges group by tenancy_id) c on c.tenancy_id = t.id
    left join (select tenancy_id, sum(amount) total, max(received_on) last_paid_on
                 from public.payments
                where status = 'matched' and kind = 'rent'
                group by tenancy_id) p on p.tenancy_id = t.id;

create or replace view public.rent_collection
with (security_invoker = true) as
  select c.period, c.tenancy_id, u.property_id, c.amount as due,
         coalesce(sum(p.amount), 0) as paid,
         coalesce(sum(p.amount) filter (where p.received_on <= c.period + 6), 0) as paid_by_7th,
         c.amount - coalesce(sum(p.amount), 0) as outstanding,
         max(p.received_on) as last_paid_on,
         array_remove(array_agg(distinct p.method), null) as methods
    from public.rent_charges c
    join public.tenancies t on t.id = c.tenancy_id
    join public.units u on u.id = t.unit_id
    left join public.payments p
      on p.tenancy_id = c.tenancy_id and p.period = c.period
     and p.status = 'matched' and p.kind = 'rent'
   where c.kind = 'rent'
   group by c.id, c.period, c.tenancy_id, u.property_id, c.amount;

-- ---------------------------------------------------------------------------
-- Access: staff only.
-- ---------------------------------------------------------------------------
alter table public.rent_charges enable row level security;
alter table public.payments enable row level security;
alter table public.payer_aliases enable row level security;

drop policy if exists "rent_charges: staff all" on public.rent_charges;
create policy "rent_charges: staff all" on public.rent_charges
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "payments: staff all" on public.payments;
create policy "payments: staff all" on public.payments
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "payer_aliases: staff all" on public.payer_aliases;
create policy "payer_aliases: staff all" on public.payer_aliases
  for all using (public.is_staff()) with check (public.is_staff());

revoke all on public.tenancy_balances, public.rent_collection from anon;
