-- 0083: management fees PayProp has already taken, by property and month (from the PayProp imports).
-- PayProp's fee due date is usually the 28th of the month before (e.g. Oct 28 = November's fee) or the 1st,
-- so the fee month is the month of (due date + 5 days). Used on Landlord Payouts so a fee PayProp took isn't
-- taken again from an e-Transfer payout, and so IRep only moves the rest of its fees out of the trust account.
-- Run AFTER 0082. Safe to re-run.
create or replace view public.payprop_fees_by_month
with (security_invoker = true) as
select pp.property_id,
       date_trunc('month', ((l.raw->>'DueDate')::date + 5))::date as period,
       round(sum(l.after_split), 2) as payprop_fee,
       count(*) as lines,
       min(l.transferred_date) as first_paid,
       max(l.transferred_date) as last_paid
  from public.payprop_lines l
  join public.payprop_properties pp on pp.payprop_property_id = l.payprop_property_id
 where l.ben_type = 'C'
   and coalesce(l.after_split, 0) > 0
   and lower(coalesce(l.category, '')) like 'management fee%'
   and (l.raw->>'DueDate') ~ '^\d{4}-\d{2}-\d{2}$'
   and pp.property_id is not null
 group by 1, 2;
grant select on public.payprop_fees_by_month to authenticated;
