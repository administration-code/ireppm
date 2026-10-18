-- 0039: three-way check no longer counts last-month-rent refunds as "key deposits held".
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
  -- IRep doesn't take key deposits. Last month's rent is passed to the landlord, so a refund to a tenant
  -- (category deposit_refund) is money paid out on the landlord's behalf, not a deposit IRep was holding.
  key_dep := coalesce((select sum(amount) from public.payments
                        where kind = 'key_deposit' and status = 'matched' and parent_id is null
                          and method = any (public.trust_payment_methods()) and received_on <= m_end), 0);
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
