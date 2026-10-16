-- IRep Property Management: monthly reconciliation of the rent (trust) bank account and a
-- fiscal-year (Dec 31) package for the accountant.
--   * Staff upload the bank's monthly CSV. Each bank line is matched to what the system
--     already knows (rent payments in, landlord payouts out) or given a category
--     (IRep fees taken, bank fee, refund, ...).
--   * A month balances when (1) the statement closing balance equals opening + lines,
--     (2) every bank line is matched or categorised, and (3) the bank balance equals what
--     IRep owes out of the account (owners' balances, key deposits, unallocated money and
--     IRep fees not yet taken): the "three-way" check.
--   * A balanced month can be locked; locked months can't be changed.
-- Run AFTER 0018. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Accounts, imports and bank lines
-- ---------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                  -- e.g. "Rent trust account (Scotiabank)"
  kind text not null default 'trust' check (kind in ('trust', 'operating', 'other')),
  institution text,
  account_last4 text,
  opening_date date not null,                          -- first day we track
  opening_balance numeric(12, 2) not null default 0,   -- balance at the start of opening_date
  csv_mapping jsonb not null default '{}'::jsonb,      -- remembered column choices for the CSV import
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists bank_accounts_touch on public.bank_accounts;
create trigger bank_accounts_touch before update on public.bank_accounts
  for each row execute function public.touch_updated_at();

create table if not exists public.bank_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  file_name text,
  rows_added integer not null default 0,
  rows_skipped integer not null default 0,             -- already imported (same line twice)
  first_date date,
  last_date date,
  imported_by uuid references public.profiles (id) on delete set null,
  imported_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  import_id uuid references public.bank_imports (id) on delete set null,
  posted_on date not null,
  description text not null default '',
  amount numeric(12, 2) not null check (amount <> 0),  -- money in is positive, money out negative
  running_balance numeric(12, 2),                       -- from the bank file, if it has one
  fingerprint text not null,                            -- date|amount|description|nth, to skip repeats
  status text not null default 'unmatched'
    check (status in ('unmatched', 'matched', 'categorized', 'ignored')),
  category text check (category is null or category in (
    'irep_fees',          -- IRep's management/leasing fees moved to the operating account
    'vendor_payment',     -- paid a contractor for a work order
    'deposit_refund',     -- key deposit or other money returned to a tenant
    'owner_contribution', -- an owner put money in (e.g. to cover a repair)
    'bank_fee',
    'interest',
    'transfer',           -- between IRep accounts, not fees
    'correction',         -- bank error or reversal
    'other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, fingerprint)
);
create index if not exists bank_transactions_account_date_idx on public.bank_transactions (account_id, posted_on);
create index if not exists bank_transactions_status_idx on public.bank_transactions (status);
drop trigger if exists bank_transactions_touch on public.bank_transactions;
create trigger bank_transactions_touch before update on public.bank_transactions
  for each row execute function public.touch_updated_at();

-- What a bank line pays for: one or more rent payments (e.g. a PayProp batch), a landlord
-- payout, or a work order.
create table if not exists public.bank_transaction_links (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.bank_transactions (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  owner_payout_id uuid references public.owner_payouts (id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests (id) on delete set null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(payment_id, owner_payout_id, maintenance_request_id) = 1)
);
create index if not exists bank_links_tx_idx on public.bank_transaction_links (bank_transaction_id);
create unique index if not exists bank_links_payment_once on public.bank_transaction_links (payment_id) where payment_id is not null;
create unique index if not exists bank_links_payout_once on public.bank_transaction_links (owner_payout_id) where owner_payout_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Monthly reconciliations and year-end close
-- ---------------------------------------------------------------------------
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  statement_closing numeric(12, 2),                    -- typed from the bank statement
  status text not null default 'open' check (status in ('open', 'balanced', 'locked')),
  summary jsonb,                                       -- snapshot taken when locked
  notes text,
  balanced_at timestamptz,
  locked_at timestamptz,
  locked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, period)
);
drop trigger if exists reconciliations_touch on public.reconciliations;
create trigger reconciliations_touch before update on public.reconciliations
  for each row execute function public.touch_updated_at();

create table if not exists public.fiscal_year_closes (
  year integer primary key,
  summary jsonb,                                       -- snapshot of the year-end package
  notes text,
  closed_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete set null
);

-- Staff only, everywhere.
do $$
declare t text;
begin
  foreach t in array array['bank_accounts', 'bank_imports', 'bank_transactions', 'bank_transaction_links',
                           'reconciliations', 'fiscal_year_closes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: staff all" on public.%I', t, t);
    execute format('create policy "%s: staff all" on public.%I for all using (public.is_staff()) with check (public.is_staff())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Which rent payments and payouts go through the trust account
--    (cash handed to an owner, PayProp and last-month-applied don't).
-- ---------------------------------------------------------------------------
create or replace function public.trust_payment_methods() returns text[]
language sql immutable as $$ select array['etransfer', 'direct_deposit', 'cheque', 'cash', 'other'] $$;
create or replace function public.trust_payout_methods() returns text[]
language sql immutable as $$ select array['etransfer', 'cheque', 'other'] $$;

-- Locked months can't be changed (bank lines, links, payments and payouts dated in them).
create or replace function public.is_period_locked(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reconciliations r
                  where r.status = 'locked' and r.period = date_trunc('month', p_date)::date)
$$;

create or replace function public.guard_locked_period() returns trigger
language plpgsql as $$
declare
  d_old date;
  d_new date;
begin
  if tg_table_name = 'bank_transactions' then
    d_old := case when tg_op <> 'INSERT' then old.posted_on end;
    d_new := case when tg_op <> 'DELETE' then new.posted_on end;
  elsif tg_table_name = 'payments' then
    d_old := case when tg_op <> 'INSERT' then old.received_on end;
    d_new := case when tg_op <> 'DELETE' then new.received_on end;
  elsif tg_table_name = 'owner_payouts' then
    d_old := case when tg_op <> 'INSERT' then old.paid_on end;
    d_new := case when tg_op <> 'DELETE' then new.paid_on end;
  elsif tg_table_name = 'bank_transaction_links' then
    select posted_on into d_old from public.bank_transactions
     where id = case when tg_op = 'DELETE' then old.bank_transaction_id else new.bank_transaction_id end;
    d_new := d_old;
  end if;
  if (d_old is not null and public.is_period_locked(d_old)) or (d_new is not null and public.is_period_locked(d_new)) then
    raise exception '% is reconciled and locked. Unlock that month first.',
      to_char(coalesce(case when d_old is not null and public.is_period_locked(d_old) then d_old end, d_new), 'FMMonth YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists bank_transactions_lock on public.bank_transactions;
create trigger bank_transactions_lock before insert or update or delete on public.bank_transactions
  for each row execute function public.guard_locked_period();
drop trigger if exists bank_links_lock on public.bank_transaction_links;
create trigger bank_links_lock before insert or update or delete on public.bank_transaction_links
  for each row execute function public.guard_locked_period();
drop trigger if exists payments_lock on public.payments;
create trigger payments_lock before update of amount, received_on, method, tenancy_id, status or delete on public.payments
  for each row execute function public.guard_locked_period();
drop trigger if exists owner_payouts_lock on public.owner_payouts;
create trigger owner_payouts_lock before insert or update or delete on public.owner_payouts
  for each row execute function public.guard_locked_period();

-- Keep a bank line's status in step with its links.
create or replace function public.bank_link_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare tx uuid := case when tg_op = 'DELETE' then old.bank_transaction_id else new.bank_transaction_id end;
begin
  update public.bank_transactions b
     set status = case when exists (select 1 from public.bank_transaction_links l where l.bank_transaction_id = b.id)
                       then 'matched'
                       when b.status = 'matched' then 'unmatched' else b.status end
   where b.id = tx;
  return null;
end;
$$;
drop trigger if exists bank_links_status on public.bank_transaction_links;
create trigger bank_links_status after insert or delete on public.bank_transaction_links
  for each row execute function public.bank_link_status();

-- ---------------------------------------------------------------------------
-- 4. Import (the browser parses the CSV and sends rows) and auto-matching
-- ---------------------------------------------------------------------------
-- p_rows: [{posted_on: 'YYYY-MM-DD', description, amount, running_balance}]
create or replace function public.import_bank_rows(p_account_id uuid, p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  imp uuid;
  r jsonb;
  added integer := 0;
  skipped integer := 0;
  seen jsonb := '{}'::jsonb;
  base text;
  nth integer;
  fp text;
  d date;
  amt numeric;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  insert into public.bank_imports (account_id, file_name, imported_by)
  values (p_account_id, p_file_name, auth.uid()) returning id into imp;

  for r in select * from jsonb_array_elements(p_rows) loop
    d := (r->>'posted_on')::date;
    amt := round((r->>'amount')::numeric, 2);
    if d is null or amt is null or amt = 0 then skipped := skipped + 1; continue; end if;
    -- Two identical lines on the same day are both real: number them.
    base := d::text || '|' || amt::text || '|' || lower(regexp_replace(coalesce(r->>'description', ''), '\s+', ' ', 'g'));
    nth := coalesce((seen->>base)::integer, 0) + 1;
    seen := seen || jsonb_build_object(base, nth);
    fp := base || '|' || nth;
    if public.is_period_locked(d) then skipped := skipped + 1; continue; end if;
    insert into public.bank_transactions (account_id, import_id, posted_on, description, amount, running_balance, fingerprint)
    values (p_account_id, imp, d, coalesce(r->>'description', ''), amt, nullif(r->>'running_balance', '')::numeric, fp)
    on conflict (account_id, fingerprint) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;

  update public.bank_imports
     set rows_added = added, rows_skipped = skipped,
         first_date = (select min(posted_on) from public.bank_transactions where import_id = imp),
         last_date = (select max(posted_on) from public.bank_transactions where import_id = imp)
   where id = imp;
  return jsonb_build_object('import_id', imp, 'added', added, 'skipped', skipped,
                            'matched', public.auto_match_bank_lines(p_account_id));
end;
$$;

-- Match unmatched lines where there's exactly one sensible candidate:
--   money in  = one trust rent payment of the same amount received within 3 days
--   money out = one landlord payout of the same amount paid within 5 days
create or replace function public.auto_match_bank_lines(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  cand uuid;
  n integer := 0;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  for b in select * from public.bank_transactions
            where account_id = p_account_id and status = 'unmatched' and not public.is_period_locked(posted_on)
            order by posted_on loop
    cand := null;
    if b.amount > 0 then
      select (array_agg(p.id))[1] into cand
        from public.payments p
       where p.parent_id is null and p.status <> 'ignored'
         and p.method = any (public.trust_payment_methods())
         and p.amount = b.amount and abs(p.received_on - b.posted_on) <= 3
         and not exists (select 1 from public.bank_transaction_links l where l.payment_id = p.id)
      having count(*) = 1;
      if cand is not null then
        insert into public.bank_transaction_links (bank_transaction_id, payment_id, amount) values (b.id, cand, b.amount);
        n := n + 1;
      end if;
    else
      select (array_agg(o.id))[1] into cand
        from public.owner_payouts o
       where o.method = any (public.trust_payout_methods())
         and o.amount = -b.amount and abs(o.paid_on - b.posted_on) <= 5
         and not exists (select 1 from public.bank_transaction_links l where l.owner_payout_id = o.id)
      having count(*) = 1;
      if cand is not null then
        insert into public.bank_transaction_links (bank_transaction_id, owner_payout_id, amount) values (b.id, cand, -b.amount);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The month's numbers
-- ---------------------------------------------------------------------------
create or replace function public.reconciliation_summary(p_account_id uuid, p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  acct public.bank_accounts;
  m date := date_trunc('month', p_period)::date;
  m_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  rec public.reconciliations;
  opening numeric;
  bank_in numeric;
  bank_out numeric;
  closing_calc numeric;
  owners numeric;
  key_dep numeric;
  unallocated numeric;
  fees_earned numeric;
  fees_taken numeric;
  liability numeric;
  hst numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  select * into acct from public.bank_accounts where id = p_account_id;
  if not found then raise exception 'Account not found'; end if;
  select * into rec from public.reconciliations where account_id = p_account_id and period = m;

  opening := acct.opening_balance + coalesce((select sum(amount) from public.bank_transactions
                                                where account_id = p_account_id and posted_on >= acct.opening_date
                                                  and posted_on < m), 0);
  select coalesce(sum(amount) filter (where amount > 0), 0), coalesce(-sum(amount) filter (where amount < 0), 0)
    into bank_in, bank_out
    from public.bank_transactions where account_id = p_account_id and posted_on between m and m_end;
  closing_calc := opening + bank_in - bank_out;

  -- What IRep owes out of this account at month end.
  owners := coalesce((select sum(to_pay) from public.owner_statement_totals where period <= m), 0);
  key_dep := coalesce((select sum(amount) from public.payments
                        where kind = 'key_deposit' and status = 'matched' and parent_id is null
                          and method = any (public.trust_payment_methods()) and received_on <= m_end), 0)
           - coalesce((select -sum(amount) from public.bank_transactions
                        where account_id = p_account_id and category = 'deposit_refund' and posted_on <= m_end), 0);
  unallocated := coalesce((select sum(amount) from public.payments
                            where status = 'unmatched' and parent_id is null
                              and method = any (public.trust_payment_methods()) and received_on <= m_end), 0);
  fees_earned := coalesce((select sum(mgmt_fee + mgmt_fee_hst) from public.owner_statement_totals where period <= m), 0)
               + coalesce((select -sum(amount) from public.statement_items
                            where kind = 'leasing_fee' and period <= m), 0);
  fees_taken := coalesce((select -sum(amount) from public.bank_transactions
                           where account_id = p_account_id and category = 'irep_fees' and posted_on <= m_end), 0);
  liability := owners + key_dep + unallocated + (fees_earned - fees_taken);

  return jsonb_build_object(
    'account', jsonb_build_object('id', acct.id, 'name', acct.name),
    'period', m,
    'status', coalesce(rec.status, 'open'),
    'opening', round(opening, 2),
    'money_in', round(bank_in, 2),
    'money_out', round(bank_out, 2),
    'closing_calculated', round(closing_calc, 2),
    'statement_closing', rec.statement_closing,
    'statement_difference', case when rec.statement_closing is null then null
                                 else round(rec.statement_closing - closing_calc, 2) end,
    'lines', (select count(*) from public.bank_transactions where account_id = p_account_id and posted_on between m and m_end),
    'unmatched_lines', (select count(*) from public.bank_transactions
                         where account_id = p_account_id and posted_on between m and m_end and status = 'unmatched'),
    'unmatched_amount', coalesce((select sum(amount) from public.bank_transactions
                                   where account_id = p_account_id and posted_on between m and m_end and status = 'unmatched'), 0),
    -- Recorded in the system but not yet seen at the bank (deposits in transit / uncleared payouts).
    'outstanding_deposits', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'date', p.received_on, 'amount', p.amount,
                                         'who', p.payer_name, 'method', p.method) order by p.received_on)
                                       from public.payments p
                                      where p.parent_id is null and p.status <> 'ignored'
                                        and p.method = any (public.trust_payment_methods())
                                        and p.received_on between acct.opening_date and m_end
                                        and not exists (select 1 from public.bank_transaction_links l where l.payment_id = p.id)), '[]'::jsonb),
    'outstanding_payouts', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.paid_on, 'amount', o.amount,
                                        'property', pr.address) order by o.paid_on)
                                      from public.owner_payouts o join public.properties pr on pr.id = o.property_id
                                     where o.method = any (public.trust_payout_methods())
                                       and o.paid_on between acct.opening_date and m_end
                                       and not exists (select 1 from public.bank_transaction_links l where l.owner_payout_id = o.id)), '[]'::jsonb),
    'liability', jsonb_build_object(
        'owners', round(owners, 2), 'key_deposits', round(key_dep, 2), 'unallocated', round(unallocated, 2),
        'irep_fees_not_taken', round(fees_earned - fees_taken, 2), 'total', round(liability, 2)),
    'three_way_difference', round(coalesce(rec.statement_closing, closing_calc) - liability, 2),
    'by_category', coalesce((select jsonb_object_agg(coalesce(category, status), total) from (
        select category, status, round(sum(amount), 2) total from public.bank_transactions
         where account_id = p_account_id and posted_on between m and m_end and status in ('categorized', 'ignored')
         group by category, status) x), '{}'::jsonb),
    'hst_rate', hst
  );
end;
$$;

-- Balanced = statement matches, every line accounted for. (The three-way difference is shown
-- and must be explained in the notes if it isn't zero.)
create or replace function public.set_reconciliation(p_account_id uuid, p_period date, p_statement_closing numeric,
                                                     p_action text, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_period)::date;
  s jsonb;
  cur text;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  insert into public.reconciliations (account_id, period) values (p_account_id, m)
  on conflict (account_id, period) do nothing;
  select status into cur from public.reconciliations where account_id = p_account_id and period = m;

  if p_action = 'unlock' then
    update public.reconciliations set status = 'open', locked_at = null, locked_by = null,
           notes = concat_ws(E'\n', notes, nullif(trim(p_notes), ''))
     where account_id = p_account_id and period = m;
    return public.reconciliation_summary(p_account_id, m);
  end if;
  if cur = 'locked' then raise exception 'This month is locked. Unlock it to make changes.'; end if;

  update public.reconciliations
     set statement_closing = coalesce(p_statement_closing, statement_closing),
         notes = coalesce(nullif(trim(p_notes), ''), notes)
   where account_id = p_account_id and period = m;
  s := public.reconciliation_summary(p_account_id, m);

  if p_action in ('balance', 'lock') then
    if (s->>'statement_closing') is null then raise exception 'Enter the closing balance from the bank statement.'; end if;
    if (s->>'statement_difference')::numeric <> 0 then
      raise exception 'The statement is off by $%. Check for missing or extra bank lines.', s->>'statement_difference';
    end if;
    if (s->>'unmatched_lines')::integer > 0 then
      raise exception '% bank line(s) still need matching or a category.', s->>'unmatched_lines';
    end if;
    if (s->>'three_way_difference')::numeric <> 0 and coalesce(trim(p_notes), '') = ''
       and coalesce((select notes from public.reconciliations where account_id = p_account_id and period = m), '') = '' then
      raise exception 'The bank balance and what IRep holds for others differ by $%. Add a note explaining it.',
        s->>'three_way_difference';
    end if;
    update public.reconciliations set status = 'balanced', balanced_at = now()
     where account_id = p_account_id and period = m;
  end if;
  if p_action = 'lock' then
    if exists (select 1 from public.reconciliations where account_id = p_account_id and period < m
                and period >= date_trunc('month', (select opening_date from public.bank_accounts where id = p_account_id))
                and status <> 'locked') then
      raise exception 'Lock the earlier months first.';
    end if;
    update public.reconciliations set status = 'locked', locked_at = now(), locked_by = auth.uid(),
           summary = public.reconciliation_summary(p_account_id, m)
     where account_id = p_account_id and period = m;
  end if;
  return public.reconciliation_summary(p_account_id, m);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Fiscal year (Jan 1 – Dec 31) package for the accountant
-- ---------------------------------------------------------------------------
create or replace function public.fiscal_year_summary(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  y0 date := make_date(p_year, 1, 1);
  y1 date := make_date(p_year, 12, 31);
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'year', p_year,
    'closed', exists (select 1 from public.fiscal_year_closes where year = p_year),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name,
        'months', (select jsonb_agg(jsonb_build_object('period', mo, 'status',
                     coalesce((select status from public.reconciliations r where r.account_id = a.id and r.period = mo), 'open'))
                     order by mo)
                     from generate_series(y0, make_date(p_year, 12, 1), interval '1 month') g(mo)),
        'opening', a.opening_balance + coalesce((select sum(amount) from public.bank_transactions
                     where account_id = a.id and posted_on >= a.opening_date and posted_on < y0), 0),
        'money_in', coalesce((select sum(amount) from public.bank_transactions where account_id = a.id
                     and posted_on between y0 and y1 and amount > 0), 0),
        'money_out', coalesce((select -sum(amount) from public.bank_transactions where account_id = a.id
                     and posted_on between y0 and y1 and amount < 0), 0),
        'closing', a.opening_balance + coalesce((select sum(amount) from public.bank_transactions
                     where account_id = a.id and posted_on >= a.opening_date and posted_on <= y1), 0),
        'by_category', coalesce((select jsonb_object_agg(k, v) from (
                     select coalesce(category, case when status = 'matched' and amount > 0 then 'rent_received'
                                                     when status = 'matched' then 'owner_payouts' else status end) k,
                            round(sum(amount), 2) v
                       from public.bank_transactions where account_id = a.id and posted_on between y0 and y1
                      group by 1) x), '{}'::jsonb))
      order by a.name) from public.bank_accounts a where a.active), '[]'::jsonb),
    -- IRep's own income for the year, by month (before and including HST).
    'irep_income', coalesce((select jsonb_agg(jsonb_build_object(
        'period', mo,
        'management_fees', coalesce((select sum(mgmt_fee) from public.owner_statement_totals where period = mo), 0),
        'management_hst', coalesce((select sum(mgmt_fee_hst) from public.owner_statement_totals where period = mo), 0),
        'leasing_fees_incl_hst', coalesce((select -sum(amount) from public.statement_items
                                            where kind = 'leasing_fee' and period = mo), 0)) order by mo)
      from generate_series(y0, make_date(p_year, 12, 1), interval '1 month') g(mo)), '[]'::jsonb),
    -- Per landlord: rent collected, fees, work orders, paid out, and balance owing at Dec 31.
    'owners', coalesce((select jsonb_agg(x order by x->>'owner') from (
        select jsonb_build_object(
          'owner', o.name,
          'rent_collected', coalesce(sum(s.rent_collected + s.last_month_forwarded), 0),
          'management_fees', coalesce(sum(s.mgmt_fee + s.mgmt_fee_hst), 0),
          'work_orders', coalesce(sum(s.work_orders), 0),
          'other_items', coalesce(sum(s.items_total), 0),
          'paid_out', coalesce(sum(s.paid_out), 0),
          'balance_dec31', coalesce((select sum(t.to_pay) from public.owner_statement_totals t
                                       join public.properties p2 on p2.id = t.property_id
                                      where p2.owner_id = o.id and t.period <= make_date(p_year, 12, 1)), 0)) x
          from public.owners o
          left join public.properties p on p.owner_id = o.id
          left join public.owner_statement_totals s on s.property_id = p.id and s.period between y0 and make_date(p_year, 12, 1)
         group by o.id, o.name) q), '[]'::jsonb)
  );
end;
$$;

create or replace function public.close_fiscal_year(p_year integer, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if exists (select 1 from public.bank_accounts a
              cross join generate_series(make_date(p_year, 1, 1), make_date(p_year, 12, 1), interval '1 month') g(mo)
              where a.active and g.mo >= date_trunc('month', a.opening_date)
                and not exists (select 1 from public.reconciliations r
                                 where r.account_id = a.id and r.period = g.mo and r.status = 'locked')) then
    raise exception 'Every month of % must be reconciled and locked first.', p_year;
  end if;
  s := public.fiscal_year_summary(p_year);
  insert into public.fiscal_year_closes (year, summary, notes, closed_by) values (p_year, s, p_notes, auth.uid())
  on conflict (year) do update set summary = excluded.summary, notes = excluded.notes,
                                   closed_at = now(), closed_by = excluded.closed_by;
  return s;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['import_bank_rows(uuid, text, jsonb)', 'auto_match_bank_lines(uuid)',
                           'reconciliation_summary(uuid, date)', 'set_reconciliation(uuid, date, numeric, text, text)',
                           'fiscal_year_summary(integer)', 'close_fiscal_year(integer, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
