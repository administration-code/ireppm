-- 0074: closes the gaps between the portal and the Google Sheets tracker (Project 1).
--   b) payments.match_method / matched_by / matched_at: how and by whom each payment was tied to a tenancy.
--   e) property_fee_changes: scheduled management-fee changes; property_fee_for_month uses them.
--   f) etransfer_pending + etransfer_address_reminders: e-Transfers sent to the old address.
--   h) opening_balances: the cutover entry screen writes here; each line makes its ledger entry.
--      payments.method 'opening_credit': a tenant credit carried in from the tracker (not rent collected).
--   d) deposits_leasing: one row per tenancy for the Deposits & Leasing view.
-- Run AFTER 0073. Safe to re-run.

------------------------------------------------------------------------------------------------
-- b) Matched-by audit
alter table public.payments add column if not exists match_method text;
alter table public.payments add column if not exists matched_by uuid;
alter table public.payments add column if not exists matched_at timestamptz;
alter table public.payments add column if not exists sent_to text;
alter table public.payments drop constraint if exists payments_match_method_check;
alter table public.payments add constraint payments_match_method_check check (match_method is null or match_method in
  ('auto_name', 'sender_rule', 'staff_match', 'manual_entry', 'import', 'payprop_batch', 'split', 'opening_balance', 'system'));

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in
  ('etransfer', 'payprop', 'cash', 'direct_deposit', 'cheque', 'last_month_applied', 'paid_to_owner', 'opening_credit', 'other'));

create or replace function public.payments_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  pr record;
  auto_period boolean := false;
  oldest date;
  i integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.tenancy_id is not null then
      -- Entered by staff (or an import) already tied to a tenancy.
      new.match_method := coalesce(new.match_method, case new.source
        when 'import' then 'import' when 'payprop' then 'payprop_batch' when 'split' then 'split' else 'manual_entry' end);
      new.matched_by := coalesce(new.matched_by, auth.uid());
      new.matched_at := coalesce(new.matched_at, now());
    elsif new.status = 'unmatched' and new.payer_name is not null then
      select * into pr from public.payer_rules r
       where public.payer_key(r.payer_name) = public.payer_key(new.payer_name)
       order by r.created_at desc limit 1;
      if found and pr.action = 'ignore' then
        new.status := 'ignored';
        new.notes := concat_ws(' ', nullif(new.notes, ''), coalesce(pr.note, 'Sender rule: not rent for a property we manage.'));
      elsif found and pr.action = 'tenancy' then
        new.tenancy_id := pr.tenancy_id;
        new.match_method := 'sender_rule';
        new.matched_at := now();
      else
        select * into m from public.match_payer(new.payer_name);
        new.tenancy_id := m.match_id;
        new.suggested_tenancy_id := coalesce(new.suggested_tenancy_id, m.suggest_id);
        if new.tenancy_id is not null then
          new.match_method := 'auto_name';
          new.matched_at := now();
        end if;
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.tenancy_id is distinct from old.tenancy_id then
    if new.tenancy_id is null then
      new.match_method := null; new.matched_by := null; new.matched_at := null;
    else
      new.match_method := case when auth.uid() is null then coalesce(nullif(new.match_method, old.match_method), 'system') else 'staff_match' end;
      new.matched_by := auth.uid();
      new.matched_at := now();
    end if;
  end if;

  if new.period is null and new.kind = 'rent' then
    auto_period := true;
    new.period := case when extract(day from new.received_on) >= 25
                       then (date_trunc('month', new.received_on) + interval '1 month')::date
                       else date_trunc('month', new.received_on)::date end;
  end if;

  -- Oldest arrears first: an unassigned rent payment goes to the tenancy's oldest unpaid month.
  if auto_period and new.tenancy_id is not null and new.method not in ('last_month_applied', 'paid_to_owner') then
    select min(rc.period) into oldest from public.rent_collection rc
     where rc.tenancy_id = new.tenancy_id and rc.period < new.period and rc.outstanding > 0;
    if oldest is not null then
      new.period := oldest;
    else
      while i < 3 and public.rent_month_paid(new.tenancy_id, new.period, new.id) loop
        new.period := (new.period + interval '1 month')::date;
        i := i + 1;
      end loop;
    end if;
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

-- What we can tell about payments matched before the audit existed.
update public.payments set match_method = case source
    when 'import' then 'import' when 'payprop' then 'payprop_batch' when 'split' then 'split' when 'manual' then 'manual_entry' end
 where match_method is null and tenancy_id is not null and source in ('import', 'payprop', 'split', 'manual')
   and not public.is_period_locked(coalesce(period, date_trunc('month', received_on)::date));

-- An opening credit is the tenant's money from before the cutover: not rent collected this month.
do $views$
declare
  d text;
  v text;
begin
  foreach v in array array['owner_statements', 'owner_statement_payments'] loop
    d := pg_get_viewdef(('public.' || v)::regclass);
    if position('opening_credit' in d) = 0 then
      d := replace(d, 'ARRAY[''last_month_applied''::text, ''paid_to_owner''::text]',
                      'ARRAY[''last_month_applied''::text, ''paid_to_owner''::text, ''opening_credit''::text]');
      if position('opening_credit' in d) = 0 then raise exception '%: patch point not found', v; end if;
      execute format('create or replace view public.%I with (security_invoker = true) as %s', v, d);
    end if;
  end loop;
end;
$views$;

------------------------------------------------------------------------------------------------
-- e) Scheduled management-fee changes
create table if not exists public.property_fee_changes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  rate_type text not null check (rate_type in ('locked', 'standard', 'base', 'custom', 'before_schedule')),
  amount numeric(10, 2) not null check (amount >= 0),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (property_id, effective_month)
);
alter table public.property_fee_changes enable row level security;
drop policy if exists "property_fee_changes: staff all" on public.property_fee_changes;
create policy "property_fee_changes: staff all" on public.property_fee_changes
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.property_fee_changes from anon;

-- The first scheduled change also records the fee in force before it, so earlier months keep it.
create or replace function public.property_fee_changes_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.property_fee_changes where property_id = new.property_id and id <> new.id) then
    insert into public.property_fee_changes (property_id, effective_month, rate_type, amount, note)
    select new.property_id, '2000-01-01', 'before_schedule', coalesce(p.monthly_fee, 0), 'Fee before the first scheduled change'
      from public.properties p where p.id = new.property_id and new.effective_month > '2000-01-01'
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists property_fee_changes_baseline on public.property_fee_changes;
create trigger property_fee_changes_baseline after insert on public.property_fee_changes
  for each row execute function public.property_fee_changes_baseline();

create or replace function public.property_fee_for_month(p_property_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, coalesce(
           (select c.amount from public.property_fee_changes c
             where c.property_id = p.id and c.effective_month <= date_trunc('month', p_month)::date
             order by c.effective_month desc limit 1),
           p.monthly_fee, 0)
           - case when p.promo_discount > 0 and p.promo_start is not null
                       and p_month >= date_trunc('month', p.promo_start)::date
                       and p_month <= coalesce(p.promo_end, 'infinity'::date)
                  then p.promo_discount else 0 end)
    from public.properties p where p.id = p_property_id
$$;

-- Daily: the property's displayed fee follows the schedule once a change takes effect.
create or replace function public.apply_fee_changes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only'; end if;
  update public.properties p
     set monthly_fee = c.amount, custom_fee = true
    from (select distinct on (property_id) property_id, amount
            from public.property_fee_changes
           where effective_month <= date_trunc('month', (now() at time zone 'America/Toronto'))::date
           order by property_id, effective_month desc) c
   where c.property_id = p.id and p.monthly_fee is distinct from c.amount;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.apply_fee_changes() from public, anon;
grant execute on function public.apply_fee_changes() to authenticated, service_role;

------------------------------------------------------------------------------------------------
-- f) e-Transfers sent to the old address (ireppm@ireprealty.com)
create table if not exists public.etransfer_pending (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  amount numeric(10, 2) not null check (amount > 0),
  payer_name text,
  memo text,
  sent_to text,
  received_at timestamptz not null default now(),
  tenancy_id uuid references public.tenancies (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'deposited', 'dismissed')),
  payment_id uuid references public.payments (id) on delete set null,
  resolved_by uuid,
  resolved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
alter table public.etransfer_pending enable row level security;
drop policy if exists "etransfer_pending: staff all" on public.etransfer_pending;
create policy "etransfer_pending: staff all" on public.etransfer_pending
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.etransfer_pending from anon;

create table if not exists public.etransfer_address_reminders (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_to text not null,
  reason text
);
create index if not exists etransfer_address_reminders_idx on public.etransfer_address_reminders (tenancy_id, sent_at desc);
alter table public.etransfer_address_reminders enable row level security;
drop policy if exists "etransfer_address_reminders: staff read" on public.etransfer_address_reminders;
create policy "etransfer_address_reminders: staff read" on public.etransfer_address_reminders
  for select using (public.is_staff());
revoke all on public.etransfer_address_reminders from anon;

------------------------------------------------------------------------------------------------
-- h) Opening balances from the tracker
create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  kind text not null check (kind in ('tenancy_arrears', 'tenancy_credit', 'lmr_held', 'deposit_unforwarded', 'partner_owed')),
  tenancy_id uuid references public.tenancies (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  note text,
  rent_charge_id uuid references public.rent_charges (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  partner_ledger_id uuid references public.partner_ledger (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind not in ('tenancy_arrears', 'tenancy_credit', 'lmr_held') or tenancy_id is not null),
  check (kind <> 'deposit_unforwarded' or property_id is not null or tenancy_id is not null),
  check (kind <> 'partner_owed' or partner_id is not null)
);
alter table public.opening_balances enable row level security;
drop policy if exists "opening_balances: staff all" on public.opening_balances;
create policy "opening_balances: staff all" on public.opening_balances
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.opening_balances from anon;

-- Each opening line makes its ledger entry: arrears as an opening-balance charge, a credit as an
-- opening-credit payment, money owed to a partner as a ledger adjustment. LMR held and deposits
-- not yet forwarded are kept here for the Deposits & Leasing view.
create or replace function public.opening_balances_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m date;
  ref uuid;
begin
  if tg_op = 'DELETE' then
    if old.rent_charge_id is not null then delete from public.rent_charges where id = old.rent_charge_id; end if;
    if old.payment_id is not null then delete from public.payments where id = old.payment_id; end if;
    if old.partner_ledger_id is not null then delete from public.partner_ledger where id = old.partner_ledger_id; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Opening balances can''t be edited. Delete the line and add it again.';
  end if;
  m := date_trunc('month', new.as_of)::date;
  if new.kind = 'tenancy_arrears' then
    insert into public.rent_charges (tenancy_id, period, kind, amount, description)
    values (new.tenancy_id, m, 'opening_balance', new.amount, coalesce(new.note, 'Opening balance carried over from the tracker'))
    returning id into ref;
    new.rent_charge_id := ref;
  elsif new.kind = 'tenancy_credit' then
    insert into public.payments (tenancy_id, received_on, amount, method, kind, period, source, status, memo, match_method)
    values (new.tenancy_id, new.as_of, new.amount, 'opening_credit', 'rent', m, 'manual', 'matched',
            coalesce(new.note, 'Opening credit carried over from the tracker'), 'opening_balance')
    returning id into ref;
    new.payment_id := ref;
  elsif new.kind = 'partner_owed' then
    insert into public.partner_ledger (partner_id, entry_date, kind, amount, notes, property_id)
    values (new.partner_id, new.as_of, 'adjustment', new.amount, coalesce(new.note, 'Opening balance owed, from the tracker'), new.property_id)
    returning id into ref;
    new.partner_ledger_id := ref;
  end if;
  return new;
end;
$$;
drop trigger if exists opening_balances_rules on public.opening_balances;
create trigger opening_balances_rules before insert or update on public.opening_balances
  for each row execute function public.opening_balances_rules();
drop trigger if exists opening_balances_rules_delete on public.opening_balances;
create trigger opening_balances_rules_delete after delete on public.opening_balances
  for each row execute function public.opening_balances_rules();

------------------------------------------------------------------------------------------------
-- d) Deposits & Leasing: one row per tenancy (like the tracker's tab).
create or replace view public.deposits_leasing with (security_invoker = true) as
select t.id as tenancy_id,
       p.id as property_id,
       p.address,
       u.label as unit,
       t.status,
       t.start_date,
       t.rent,
       t.collects_rent,
       (select string_agg(tt.full_name, ', ' order by tt.is_primary desc, tt.created_at) from public.tenancy_tenants tt where tt.tenancy_id = t.id) as tenants,
       t.last_month_deposit as lmr_expected,
       coalesce((select sum(x.amount) from public.payments x where x.tenancy_id = t.id and x.kind = 'last_month_rent' and x.status = 'matched'), 0) as lmr_received,
       (select min(greatest(coalesce(x.period, date_trunc('month', x.received_on)::date), date_trunc('month', x.received_on)::date))
          from public.payments x where x.tenancy_id = t.id and x.kind = 'last_month_rent' and x.status = 'matched') as lmr_statement_month,
       coalesce((select sum(-s.amount) from public.statement_items s where s.tenancy_id = t.id and s.kind = 'rent_hold' and s.hold_status = 'held'), 0) as held_now,
       coalesce((select sum(o.amount) from public.opening_balances o where o.tenancy_id = t.id and o.kind = 'lmr_held'), 0) as lmr_held_opening,
       coalesce((select sum(o.amount) from public.opening_balances o where o.tenancy_id = t.id and o.kind = 'deposit_unforwarded'), 0) as unforwarded_opening,
       t.key_deposit as key_expected,
       coalesce((select sum(x.amount) from public.payments x where x.tenancy_id = t.id and x.kind = 'key_deposit' and x.status = 'matched'), 0) as key_received,
       coalesce((select sum(l.fee) from public.leasing_fee_splits l where l.tenancy_id = t.id or (l.tenancy_id is null and l.property_id = p.id and l.period = date_trunc('month', t.start_date)::date)), 0) as leasing_fee,
       coalesce((select sum(l.hst) from public.leasing_fee_splits l where l.tenancy_id = t.id or (l.tenancy_id is null and l.property_id = p.id and l.period = date_trunc('month', t.start_date)::date)), 0) as leasing_hst,
       coalesce((select sum(l.chuck_commission + l.chuck_loan) from public.leasing_fee_splits l where l.tenancy_id = t.id or (l.tenancy_id is null and l.property_id = p.id and l.period = date_trunc('month', t.start_date)::date)), 0) as chuck_share,
       coalesce((select sum(l.rishi_commission + l.rishi_loan) from public.leasing_fee_splits l where l.tenancy_id = t.id or (l.tenancy_id is null and l.property_id = p.id and l.period = date_trunc('month', t.start_date)::date)), 0) as rishi_share
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  join public.properties p on p.id = u.property_id;
