-- IRep Property Management: partners see their own pay in the Agent Portal.
--   my_partner_pay() returns, for the signed-in partner only: their pay settings, completed work
--   orders with their price before HST, their ledger (payments, loan, adjustments, extra leasing
--   fees) and the leasing fees on landlord statements that count toward their share.
-- Run AFTER 0056. Safe to re-run.

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
      'leasing_fee_share', p.leasing_fee_share, 'leasing_fees_from', p.leasing_fees_from),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'status', m.status, 'completed_at', m.completed_at,
        'partner_pay', m.partner_pay, 'charge_to', m.charge_to,
        'unit', jsonb_build_object('label', u.label, 'property', jsonb_build_object('address', pr.address)))
        order by m.completed_at desc)
      from public.maintenance_requests m
      join public.units u on u.id = m.unit_id
      join public.properties pr on pr.id = u.property_id
      where m.partner_id = me and m.status = 'completed' and m.partner_pay is not null), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'entry_date', l.entry_date, 'amount', l.amount,
        'method', l.method, 'notes', l.notes) order by l.entry_date desc, l.created_at desc)
      from public.partner_ledger l where l.partner_id = me), '[]'::jsonb),
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
