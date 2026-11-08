-- 0065: partner pay with HST, lawn and snow care, and monthly dividends.
--   * Work orders: the partner's price before HST (partner_pay) plus HST on top, unless the job is marked
--     "no HST" (a price he agreed directly with the landlord).
--   * Lawn and snow care: from lawn_snow_from, each month he earns every property's lawn/snow add-on fee,
--     plus HST. Added automatically on the 1st as ledger lines.
--   * Dividends: from dividends_from, a monthly dividend is recorded on the 1st in the dividends (T5) ledger.
--   * Chuck: HST from now on, $1,000 dividend and lawn/snow from January 2027. Rishi: $1,000 dividend from January 2027.

alter table public.partners add column if not exists charges_hst boolean not null default false;
alter table public.partners add column if not exists monthly_dividend numeric(10, 2) not null default 0;
alter table public.partners add column if not exists dividends_from date;
alter table public.partners add column if not exists lawn_snow_from date;

alter table public.maintenance_requests add column if not exists partner_hst boolean not null default true;

alter table public.partner_ledger add column if not exists hst numeric(10, 2);
alter table public.partner_ledger drop constraint if exists partner_ledger_kind_check;
alter table public.partner_ledger add constraint partner_ledger_kind_check
  check (kind in ('leasing_fee', 'payment', 'loan_opening', 'loan_payment', 'adjustment', 'lawn_snow'));
create unique index if not exists partner_ledger_lawn_snow_once
  on public.partner_ledger (partner_id, entry_date, property_id) where kind = 'lawn_snow';

alter table public.dividends add column if not exists partner_id uuid references public.partners (id) on delete set null;
alter table public.dividends add column if not exists monthly boolean not null default false;
create unique index if not exists dividends_monthly_once on public.dividends (partner_id, paid_on) where monthly;

-- Adds the month's dividends and lawn/snow lines. Safe to run more than once.
create or replace function public.ensure_partner_month(p_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_month)::date;
  hst_pct numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
  std numeric := coalesce((select amount from public.service_rates where key = 'snow_lawn'), 50);
  added integer := 0;
  n integer;
begin
  insert into public.dividends (paid_on, recipient, recipient_type, amount, eligible, partner_id, monthly, note)
  select m, trim(regexp_replace(p.name, '\s*\(.*\)\s*$', '')), 'individual', p.monthly_dividend, false, p.id, true, 'Monthly dividend'
    from public.partners p
   where p.monthly_dividend > 0 and p.dividends_from is not null and p.dividends_from <= m
  on conflict do nothing;
  get diagnostics n = row_count; added := added + n;

  insert into public.partner_ledger (partner_id, entry_date, kind, amount, hst, property_id, notes)
  select p.id, m, 'lawn_snow', coalesce(a.monthly_price, std),
         case when p.charges_hst then round(coalesce(a.monthly_price, std) * hst_pct / 100, 2) else 0 end,
         pr.id, 'Lawn and snow care: ' || pr.address
    from public.partners p
    join public.property_addons a on a.addon_key = 'snow_lawn'
    join public.properties pr on pr.id = a.property_id and not pr.archived
   where p.lawn_snow_from is not null and p.lawn_snow_from <= m
  on conflict do nothing;
  get diagnostics n = row_count; added := added + n;
  return added;
end;
$$;
revoke execute on function public.ensure_partner_month(date) from public, anon, authenticated;

update public.partners set charges_hst = true, monthly_dividend = 1000, dividends_from = '2027-01-01', lawn_snow_from = '2027-01-01'
 where id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576';
update public.partners set monthly_dividend = 1000, dividends_from = '2027-01-01'
 where id = '7d98bbbe-1804-4d46-a132-a455c9bbff5c';

-- The $143 HST Chuck was paid on Nov 7 (13% of the $1,100 in billed work orders).
insert into public.partner_ledger (partner_id, entry_date, kind, amount, method, notes)
select 'bee3f28a-a809-4a19-86d2-a0647e3fb576', '2026-11-07', 'payment', 143, 'etransfer', 'HST on billed work orders ($1,100 x 13%)'
 where not exists (select 1 from public.partner_ledger where partner_id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576'
                     and entry_date = '2026-11-07' and amount = 143);

-- The partner's own pay page.
create or replace function public.my_partner_pay()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public.my_partner_id();
  p public.partners;
begin
  if me is null then return null; end if;
  select * into p from public.partners where id = me;
  return jsonb_build_object(
    'partner', jsonb_build_object('id', p.id, 'name', p.name, 'company', p.company,
      'loan_share_pct', p.loan_share_pct, 'loan_name', p.loan_name,
      'leasing_fee_share', p.leasing_fee_share, 'leasing_fees_from', p.leasing_fees_from,
      'charges_hst', p.charges_hst, 'monthly_dividend', p.monthly_dividend, 'dividends_from', p.dividends_from,
      'lawn_snow_from', p.lawn_snow_from),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'status', m.status, 'completed_at', m.completed_at,
        'partner_pay', m.partner_pay, 'partner_hst', m.partner_hst, 'charge_to', m.charge_to,
        'unit', jsonb_build_object('label', u.label, 'property', jsonb_build_object('address', pr.address)))
        order by m.completed_at desc)
      from public.maintenance_requests m
      join public.units u on u.id = m.unit_id
      join public.properties pr on pr.id = u.property_id
      where m.partner_id = me and m.status = 'completed' and m.partner_pay is not null), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'entry_date', l.entry_date, 'amount', l.amount, 'hst', l.hst,
        'method', l.method, 'notes', l.notes) order by l.entry_date desc, l.created_at desc)
      from public.partner_ledger l where l.partner_id = me), '[]'::jsonb),
    'dividends', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'paid_on', d.paid_on, 'amount', d.amount, 'note', d.note)
        order by d.paid_on desc)
      from public.dividends d where d.partner_id = me), '[]'::jsonb),
    'fees', case when coalesce(p.leasing_fee_share, 0) > 0 then coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'period', i.period, 'description', i.description, 'amount', i.amount,
        'property', jsonb_build_object('address', pr.address)) order by i.period)
      from public.statement_items i join public.properties pr on pr.id = i.property_id
      where i.kind = 'leasing_fee' and (p.leasing_fees_from is null or i.period >= p.leasing_fees_from)), '[]'::jsonb)
      else '[]'::jsonb end);
end;
$$;
revoke execute on function public.my_partner_pay() from public, anon;
grant execute on function public.my_partner_pay() to authenticated;
