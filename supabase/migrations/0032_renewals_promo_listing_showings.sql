-- IRep Property Management: contract renewal dates, first-year promos, listing details and
-- showing requests.
--   1. agreement_renewal fills itself in as one year after agreement_start, less a day
--      (Oct 1, 2026 -> Sep 30, 2027; Mar 1, 2027 -> Feb 29, 2028; Feb 29, 2028 -> Feb 28, 2029).
--      Staff can still type a different date.
--   2. First-year promo: a dollar discount off the monthly fee between promo_start and promo_end
--      (defaults to the first year of the agreement). Statements charge the lower fee in those months.
--   3. Listings get structured utilities, parking and laundry details.
--   4. Showing requests: at least 24 hours ahead unless the unit is vacant (same day is fine);
--      Chuck approves, declines or suggests another time from a private link; renters accept or
--      decline a suggested time; current tenants get written notice when a showing is confirmed.
-- Run AFTER 0031. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Renewal date = end of a one-year term
-- ---------------------------------------------------------------------------
create or replace function public.one_year_term_end(p_start date)
returns date
language sql
immutable
as $$
  select case when p_start is null then null
              when extract(month from p_start) = 2 and extract(day from p_start) = 29
                then (p_start + interval '1 year')::date          -- Feb 29 -> Feb 28 next year
              else (p_start + interval '1 year' - interval '1 day')::date end
$$;
grant execute on function public.one_year_term_end(date) to anon, authenticated, service_role;

create or replace function public.properties_term_dates()
returns trigger language plpgsql as $$
begin
  -- Renewal: fill in when the start date is set or changed, unless staff changed the renewal too.
  if new.agreement_start is not null then
    if tg_op = 'INSERT' then
      if new.agreement_renewal is null then new.agreement_renewal := public.one_year_term_end(new.agreement_start); end if;
    elsif new.agreement_start is distinct from old.agreement_start
          and new.agreement_renewal is not distinct from old.agreement_renewal then
      new.agreement_renewal := public.one_year_term_end(new.agreement_start);
    elsif new.agreement_renewal is null then
      new.agreement_renewal := public.one_year_term_end(new.agreement_start);
    end if;
  end if;
  -- Promo: defaults to the first year of the agreement.
  if coalesce(new.promo_discount, 0) <> 0 then
    if new.promo_start is null then new.promo_start := coalesce(new.agreement_start, current_date); end if;
    if new.promo_end is null then new.promo_end := public.one_year_term_end(new.promo_start); end if;
  end if;
  return new;
end;
$$;

alter table public.properties add column if not exists promo_discount numeric(10, 2) not null default 0;
alter table public.properties add column if not exists promo_start date;
alter table public.properties add column if not exists promo_end date;
alter table public.properties add column if not exists promo_note text;
alter table public.properties drop constraint if exists properties_promo_check;
alter table public.properties add constraint properties_promo_check
  check (promo_discount >= 0 and (promo_end is null or promo_start is null or promo_end >= promo_start));

drop trigger if exists properties_term_dates on public.properties;
create trigger properties_term_dates before insert or update on public.properties
  for each row execute function public.properties_term_dates();

-- Fill in renewals that are missing.
update public.properties
   set agreement_renewal = public.one_year_term_end(agreement_start)
 where agreement_start is not null and agreement_renewal is null;

-- ---------------------------------------------------------------------------
-- 2. The fee for a given month (promo comes off while it runs)
-- ---------------------------------------------------------------------------
create or replace function public.property_fee_for_month(p_property_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, coalesce(p.monthly_fee, 0)
           - case when p.promo_discount > 0 and p.promo_start is not null
                       and p_month >= date_trunc('month', p.promo_start)::date
                       and p_month <= coalesce(p.promo_end, 'infinity'::date)
                  then p.promo_discount else 0 end)
    from public.properties p where p.id = p_property_id
$$;
grant execute on function public.property_fee_for_month(uuid, date) to authenticated, service_role;

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
  -- A first-year promo discount comes off in the months it covers (0032).
  cross join lateral (
    select case when pr.fee_billed_separately
                  or not exists (select 1 from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
                                   join public.units u on u.id = t.unit_id
                                  where u.property_id = pr.id and c.period = mo.month and c.kind = 'rent')
                then 0 else public.property_fee_for_month(pr.id, mo.month) end as amount) fee;



-- The fee breakdown now shows the promo too.
create or replace function public.property_fee_breakdown(p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  base numeric;
  per_unit numeric := coalesce((select amount from public.service_rates where key = 'additional_unit'), 25);
  hst numeric := coalesce((select amount from public.service_rates where key = 'hst'), 13);
  this_month numeric;
begin
  if not (public.is_staff() or auth.uid() is null
          or exists (select 1 from public.properties x where x.id = p_property_id and public.is_owner_account(x.owner_id))) then
    raise exception 'Not allowed';
  end if;
  select * into p from public.properties where id = p_property_id;
  if not found then return null; end if;
  base := public.standard_management_fee(p.management_package, 1);
  this_month := public.property_fee_for_month(p.id, date_trunc('month', current_date)::date);
  return jsonb_build_object(
    'has_list_price', base is not null,
    'base', base,
    'extra_units', greatest(p.unit_count - 1, 0),
    'per_unit', per_unit,
    'extra_units_amount', per_unit * greatest(p.unit_count - 1, 0),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('key', a.addon_key, 'name', r.name,
                                         'amount', coalesce(a.monthly_price, r.amount)) order by r.sort_order)
                          from public.property_addons a join public.service_rates r on r.key = a.addon_key
                         where a.property_id = p.id and r.unit = 'per_month'), '[]'::jsonb),
    'addons_amount', public.property_addons_monthly(p.id),
    'discount', p.fee_discount,
    'fee', p.monthly_fee,
    'promo_discount', p.promo_discount,
    'promo_start', p.promo_start,
    'promo_end', p.promo_end,
    'fee_this_month', this_month,
    'hst', round(coalesce(this_month, 0) * hst / 100, 2),
    'lawn_snow', public.property_lawn_snow(p.id));
end;
$$;
grant execute on function public.property_fee_breakdown(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Listing details
-- ---------------------------------------------------------------------------
alter table public.listings add column if not exists utilities_included text[] not null default '{}';
alter table public.listings add column if not exists parking_option text;
alter table public.listings add column if not exists parking_spots integer;
alter table public.listings add column if not exists parking_instructions text;
alter table public.listings add column if not exists laundry_option text;
alter table public.listings drop constraint if exists listings_parking_option_check;
alter table public.listings add constraint listings_parking_option_check check (parking_option is null or parking_option in
  ('included', 'not_included', 'street', 'first_come', 'assigned'));
alter table public.listings drop constraint if exists listings_laundry_option_check;
alter table public.listings add constraint listings_laundry_option_check check (laundry_option is null or laundry_option in
  ('included', 'not_included', 'pay_per_use'));
alter table public.listings drop constraint if exists listings_parking_spots_check;
alter table public.listings add constraint listings_parking_spots_check check (parking_spots is null or parking_spots between 0 and 50);

-- ---------------------------------------------------------------------------
-- 4. Showing requests
-- ---------------------------------------------------------------------------
alter table public.showing_requests drop constraint if exists showing_requests_status_check;
alter table public.showing_requests add constraint showing_requests_status_check
  check (status in ('requested', 'confirmed', 'rescheduled', 'declined', 'completed', 'cancelled'));
alter table public.showing_requests add column if not exists proposed_date date;
alter table public.showing_requests add column if not exists proposed_time text;
alter table public.showing_requests add column if not exists staff_note text;
alter table public.showing_requests add column if not exists decided_at timestamptz;
alter table public.showing_requests add column if not exists tenant_notice_sent_at timestamptz;

-- Private links for Chuck to answer a request without signing in. Kept in their own table so
-- renters (who can read their own request) never see the link. Staff only.
create table if not exists public.showing_action_tokens (
  showing_id uuid primary key references public.showing_requests (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.showing_action_tokens enable row level security;
drop policy if exists "showing_action_tokens: staff read" on public.showing_action_tokens;
create policy "showing_action_tokens: staff read" on public.showing_action_tokens
  for select using (public.is_staff());

create or replace function public.showing_requests_make_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.showing_action_tokens (showing_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists showing_requests_make_token on public.showing_requests;
create trigger showing_requests_make_token after insert on public.showing_requests
  for each row execute function public.showing_requests_make_token();
insert into public.showing_action_tokens (showing_id) select id from public.showing_requests on conflict do nothing;

-- Is the unit behind a listing empty right now? (No current tenancy.) Unknown counts as occupied.
create or replace function public.listing_is_vacant(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.units u where u.listing_id = p_listing_id)
     and not exists (select 1 from public.units u join public.tenancies t on t.unit_id = u.id
                      where u.listing_id = p_listing_id and t.status in ('active', 'notice'))
$$;
grant execute on function public.listing_is_vacant(uuid) to anon, authenticated, service_role;

-- When a time window starts, in Windsor time.
create or replace function public.showing_window_start(p_date date, p_window text)
returns timestamptz
language sql
immutable
as $$
  select (p_date + case when p_window ilike 'morning%' then time '09:00'
                         when p_window ilike 'evening%' then time '17:00'
                         else time '12:00' end) at time zone 'America/Toronto'
$$;
grant execute on function public.showing_window_start(date, text) to anon, authenticated, service_role;

-- Earliest time a showing can start: 24 hours from now, or now if the unit is vacant.
create or replace function public.showing_earliest(p_listing_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case when public.listing_is_vacant(p_listing_id) then now() else now() + interval '24 hours' end
$$;
grant execute on function public.showing_earliest(uuid) to anon, authenticated, service_role;

create or replace function public.showing_requests_check_time()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.showing_window_start(new.preferred_date, new.preferred_time) < public.showing_earliest(new.listing_id) then
    raise exception 'Showings need at least 24 hours'' notice for the current tenants. Please pick a later time.';
  end if;
  return new;
end;
$$;
drop trigger if exists showing_requests_check_time on public.showing_requests;
create trigger showing_requests_check_time before insert on public.showing_requests
  for each row execute function public.showing_requests_check_time();

-- Renters: accept a suggested time (goes back to staff/Chuck as confirmed by the renter) or cancel.
create or replace function public.renter_answer_showing(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.showing_requests;
begin
  select * into s from public.showing_requests where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Showing not found'; end if;
  if s.status <> 'rescheduled' then raise exception 'There is no suggested time to answer.'; end if;
  if not p_accept then
    update public.showing_requests set status = 'cancelled', decided_at = now() where id = p_id;
    return 'cancelled';
  end if;
  if public.showing_window_start(s.proposed_date, s.proposed_time) < public.showing_earliest(s.listing_id) then
    raise exception 'That time is now too soon. Please request a new showing.';
  end if;
  update public.showing_requests
     set preferred_date = s.proposed_date, preferred_time = s.proposed_time,
         proposed_date = null, proposed_time = null, status = 'confirmed', confirmed_at = now(), decided_at = now()
   where id = p_id;
  return 'confirmed';
end;
$$;
revoke execute on function public.renter_answer_showing(uuid, boolean) from public, anon;
grant execute on function public.renter_answer_showing(uuid, boolean) to authenticated;
