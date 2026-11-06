-- 0062: rent is counted oldest month first.
-- A tenant's rent payments clear their oldest unpaid charge first (opening balances and other charges
-- included), then the next month, and so on. So a tenant who missed October and sends one month's rent
-- in November has October cleared and still owes November. Landlord payouts don't change: a payment
-- still counts on the statement for the month it was received.

-- Per-month rent figures, allocated oldest first.
create or replace view public.rent_collection with (security_invoker = true) as
with ch as (
  select c.id, c.period, c.tenancy_id, c.kind, u.property_id,
    (c.amount - case when c.kind = 'rent' then coalesce((select sum(f.amount) from refunds f
                       where f.recipient = 'tenant' and f.reason = 'rent' and f.tenancy_id = c.tenancy_id
                         and f.rent_period = c.period), 0) else 0 end)::numeric(10, 2) as due
  from rent_charges c join tenancies t on t.id = c.tenancy_id join units u on u.id = t.unit_id
), cum as (
  select ch.*,
    coalesce(sum(ch.due) over w_before, 0) as before,
    not exists (select 1 from rent_charges c2 where c2.tenancy_id = ch.tenancy_id and c2.kind = 'rent' and c2.period > ch.period) as is_last
  from ch
  window w_before as (partition by ch.tenancy_id order by ch.period, (ch.kind = 'rent'), ch.id rows between unbounded preceding and 1 preceding)
), back as (
  select f.tenancy_id, sum(f.amount) as amt from refunds f
   where f.recipient = 'tenant' and f.reason in ('overpaid', 'rent') group by f.tenancy_id
), alloc as (
  select cum.*, pt.total - coalesce(b.amt, 0) - cum.before as left_all, pt.by7 - coalesce(b.amt, 0) - cum.before as left_by7
  from cum
  left join back b on b.tenancy_id = cum.tenancy_id
  cross join lateral (select coalesce(sum(x.amount), 0) as total,
                             coalesce(sum(x.amount) filter (where x.received_on <= cum.period + 6), 0) as by7
                        from payments x where x.tenancy_id = cum.tenancy_id and x.status = 'matched' and x.kind = 'rent') pt
  where cum.kind = 'rent'
)
select a.period, a.tenancy_id, a.property_id, a.due,
  greatest(case when a.is_last then a.left_all else least(a.left_all, a.due) end, 0::numeric) as paid,
  greatest(least(a.left_by7, a.due), 0::numeric) as paid_by_7th,
  a.due - greatest(case when a.is_last then a.left_all else least(a.left_all, a.due) end, 0::numeric) as outstanding,
  pm.last_paid_on,
  coalesce(pm.methods, '{}'::text[]) as methods
from alloc a
left join lateral (select max(x.received_on) as last_paid_on, array_remove(array_agg(distinct x.method), null::text) as methods
                     from payments x where x.tenancy_id = a.tenancy_id and x.period = a.period and x.status = 'matched' and x.kind = 'rent') pm on true;

-- New payments are labelled with the oldest month they clear.
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
  if tg_op = 'INSERT' and new.tenancy_id is null and new.status = 'unmatched' and new.payer_name is not null then
    select * into pr from public.payer_rules r
     where public.payer_key(r.payer_name) = public.payer_key(new.payer_name)
     order by r.created_at desc limit 1;
    if found and pr.action = 'ignore' then
      new.status := 'ignored';
      new.notes := concat_ws(' ', nullif(new.notes, ''), coalesce(pr.note, 'Sender rule: not rent for a property we manage.'));
    elsif found and pr.action = 'tenancy' then
      new.tenancy_id := pr.tenancy_id;
    else
      select * into m from public.match_payer(new.payer_name);
      new.tenancy_id := m.match_id;
      new.suggested_tenancy_id := coalesce(new.suggested_tenancy_id, m.suggest_id);
    end if;
  end if;

  if new.period is null and new.kind = 'rent' then
    auto_period := true;
    new.period := case when extract(day from new.received_on) >= 25
                       then (date_trunc('month', new.received_on) + interval '1 month')::date
                       else date_trunc('month', new.received_on)::date end;
  end if;

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
revoke execute on function public.payments_rules() from public, anon, authenticated;

-- Ekeh (4033 Howard, Room 1): his November 3 payment clears October.
update public.payments set period = '2026-10-01'
 where id = '89d2ffc1-9917-44c5-ad72-0f77687ac3e2' and period = '2026-11-01';
