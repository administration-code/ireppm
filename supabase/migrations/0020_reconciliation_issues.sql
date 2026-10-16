-- IRep Property Management: explain WHY a month doesn't balance and how to fix it.
-- reconciliation_issues(account, month) returns a list of findings, most important first:
--   {severity: 'error'|'warning'|'info', code, title, detail, fix, bank_transaction_id?, payment_id?,
--    owner_payout_id?, amount?, date?}
-- The page shows these as a checklist; the daily email lists the errors. Run AFTER 0019. Safe to re-run.

create or replace function public.money_text(n numeric) returns text
language sql immutable as $$
  select case when n < 0 then '-' else '' end || to_char(abs(n), 'FM$999,999,990.00')
$$;

create or replace function public.reconciliation_issues(p_account_id uuid, p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_period)::date;
  m_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  s jsonb;
  out jsonb := '[]'::jsonb;
  diff numeric;
  r record;
  acct public.bank_accounts;
  fees numeric;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  select * into acct from public.bank_accounts where id = p_account_id;
  s := public.reconciliation_summary(p_account_id, m);

  -- 1. Nothing imported yet.
  if (s->>'lines')::integer = 0 then
    out := out || jsonb_build_array(jsonb_build_object('severity', 'error', 'code', 'no_lines',
      'title', 'No bank lines for ' || to_char(m, 'FMMonth YYYY'),
      'detail', 'The bank CSV for this month hasn''t been uploaded.',
      'fix', 'Download the month''s CSV from ScotiaConnect and upload it on Bank imports.'));
  end if;

  -- 2. Statement doesn't match the imported lines.
  diff := (s->>'statement_difference')::numeric;
  if s->>'statement_closing' is null and (s->>'lines')::integer > 0 then
    out := out || jsonb_build_array(jsonb_build_object('severity', 'warning', 'code', 'no_statement',
      'title', 'Statement closing balance not entered',
      'detail', 'We can''t confirm every bank line was imported until the statement balance is entered.',
      'fix', 'Type the closing balance from the bank statement.'));
  elsif diff is not null and diff <> 0 then
    out := out || jsonb_build_array(jsonb_build_object('severity', 'error', 'code', 'statement_off',
      'title', 'Statement is off by ' || public.money_text(diff),
      'detail', case when diff > 0 then 'The bank shows more money than the imported lines add up to: a deposit is probably missing, or a withdrawal was imported twice.'
                     else 'The bank shows less money than the imported lines add up to: a withdrawal is probably missing, or a deposit was imported twice.' end,
      'fix', 'Check the lines below, re-upload the full month''s CSV (repeats are skipped), or check the closing balance you typed.',
      'amount', diff));
    -- A line with exactly that amount imported twice?
    for r in select b.id, b.posted_on, b.description, b.amount from public.bank_transactions b
              where b.account_id = p_account_id and b.posted_on between m and m_end
                and b.amount = -diff
                and exists (select 1 from public.bank_transactions b2 where b2.account_id = b.account_id
                              and b2.id <> b.id and b2.amount = b.amount and abs(b2.posted_on - b.posted_on) <= 2)
              limit 3 loop
      out := out || jsonb_build_array(jsonb_build_object('severity', 'error', 'code', 'possible_duplicate',
        'title', 'Possible duplicate: ' || r.description || ' ' || public.money_text(r.amount),
        'detail', 'This amount appears twice within 2 days and equals the difference.',
        'fix', 'If the bank statement shows it once, mark one of them Ignored with a note "duplicate".',
        'bank_transaction_id', r.id, 'amount', r.amount, 'date', r.posted_on));
    end loop;
    -- Running balance column: the first day whose closing (by our lines) isn't any of the
    -- balances the bank printed that day. Lines within a day can be in any order, so compare days.
    for r in with days as (
               select b.posted_on,
                      array_agg(b.running_balance) as bank_balances,
                      acct.opening_balance + (select coalesce(sum(b2.amount), 0) from public.bank_transactions b2
                                               where b2.account_id = p_account_id and b2.posted_on >= acct.opening_date
                                                 and b2.posted_on <= b.posted_on) as ours
                 from public.bank_transactions b
                where b.account_id = p_account_id and b.posted_on between m and m_end and b.running_balance is not null
                group by b.posted_on)
             select * from days where not (round(ours, 2) = any (bank_balances)) order by posted_on limit 1 loop
      out := out || jsonb_build_array(jsonb_build_object('severity', 'error', 'code', 'balance_breaks',
        'title', 'The balance first stops matching on ' || to_char(r.posted_on, 'Mon FMDD'),
        'detail', 'By the end of that day the imported lines add up to ' || public.money_text(r.ours)
                  || ', which isn''t a balance the bank shows for that day.',
        'fix', 'A line on this date (or the day before) is missing or doubled. Compare that day on the statement.',
        'date', r.posted_on));
    end loop;
  end if;

  -- 3. Unmatched bank lines, with a hint for each.
  for r in select b.* from public.bank_transactions b
            where b.account_id = p_account_id and b.posted_on between m and m_end and b.status = 'unmatched'
            order by b.posted_on loop
    declare
      hint text;
      near record;
    begin
      hint := null;
      if r.amount > 0 then
        select p.id, p.amount, p.received_on, p.payer_name into near from public.payments p
         where p.parent_id is null and p.status <> 'ignored' and p.method = any (public.trust_payment_methods())
           and abs(p.received_on - r.posted_on) <= 7
           and not exists (select 1 from public.bank_transaction_links l where l.payment_id = p.id)
         order by abs(p.amount - r.amount), abs(p.received_on - r.posted_on) limit 1;
        if near.id is not null and near.amount <> r.amount and abs(near.amount - r.amount) <= greatest(50, r.amount * 0.05) then
          hint := 'Close to the ' || public.money_text(near.amount) || ' payment from ' || coalesce(near.payer_name, 'a tenant')
                  || ' on ' || to_char(near.received_on, 'Mon FMDD') || '. If that''s it, correct the payment amount on the Rent page, then match.';
        elsif near.id is null then
          hint := 'No rent payment is recorded for this. If it''s rent, add it on the Rent page (Record a payment), then match. Otherwise give it a category.';
        else
          hint := 'Use Match. If it''s several payments deposited together, tick them all.';
        end if;
      else
        hint := 'If it''s a landlord payout, record it on Landlord payouts and match it. IRep fee transfers, bank fees and contractor payments: choose a category.';
      end if;
      out := out || jsonb_build_array(jsonb_build_object('severity', 'error', 'code', 'unmatched_line',
        'title', 'Not explained: ' || r.description || ' ' || public.money_text(r.amount),
        'detail', to_char(r.posted_on, 'Mon FMDD') || '. Every bank line needs a match or a category.',
        'fix', hint, 'bank_transaction_id', r.id, 'amount', r.amount, 'date', r.posted_on));
    end;
  end loop;

  -- 4. Recorded but never reached the bank (older than 5 days at month end).
  for r in select (e->>'id')::uuid id, (e->>'date')::date d, (e->>'amount')::numeric a, e->>'who' who
             from jsonb_array_elements(s->'outstanding_deposits') e
            where (e->>'date')::date < m_end - 5 loop
    out := out || jsonb_build_array(jsonb_build_object('severity', 'warning', 'code', 'deposit_missing',
      'title', 'Payment not at the bank: ' || coalesce(r.who, 'tenant') || ' ' || public.money_text(r.a),
      'detail', 'Recorded ' || to_char(r.d, 'Mon FMDD') || ' but no matching deposit was found.',
      'fix', 'Check whether it was deposited (cash from Chuck?) or recorded twice. If it never arrived, mark it ignored on the Rent page.',
      'payment_id', r.id, 'amount', r.a, 'date', r.d));
  end loop;
  for r in select (e->>'id')::uuid id, (e->>'date')::date d, (e->>'amount')::numeric a, e->>'property' prop
             from jsonb_array_elements(s->'outstanding_payouts') e
            where (e->>'date')::date < m_end - 5 loop
    out := out || jsonb_build_array(jsonb_build_object('severity', 'warning', 'code', 'payout_missing',
      'title', 'Payout not at the bank: ' || r.prop || ' ' || public.money_text(r.a),
      'detail', 'Recorded ' || to_char(r.d, 'Mon FMDD') || ' but no matching withdrawal was found.',
      'fix', 'Check the e-Transfer went out. If it was sent from a different account or not sent, correct it on Landlord payouts.',
      'owner_payout_id', r.id, 'amount', r.a, 'date', r.d));
  end loop;

  -- 5. Three-way difference, with likely causes.
  diff := (s->>'three_way_difference')::numeric;
  if diff <> 0 then
    fees := coalesce(-(s->'by_category'->>'bank_fee')::numeric, 0);
    out := out || jsonb_build_array(jsonb_build_object('severity', case when abs(diff) < 1 then 'info' else 'warning' end,
      'code', 'three_way',
      'title', 'Bank and what IRep holds for others differ by ' || public.money_text(diff),
      'detail', case
        when fees > 0 and abs(abs(diff) - fees) < 0.01 then 'This equals the bank fees charged to the trust account this month.'
        when (s->'liability'->>'irep_fees_not_taken')::numeric <> 0 and abs(diff - 0) > 0
             and abs(abs(diff) - abs((s->'liability'->>'irep_fees_not_taken')::numeric)) < 0.01
          then 'This equals IRep''s fees that are earned but not yet moved out (or moved twice).'
        when diff > 0 then 'There''s more money in the account than IRep owes to others. Often an owner payout not yet recorded, or rent recorded to the wrong month.'
        else 'There''s less money than IRep owes to others. Often a payout recorded but not sent, fees taken twice, or a rent payment recorded that never arrived.' end,
      'fix', case when fees > 0 and abs(abs(diff) - fees) < 0.01
                  then 'Move the bank fees from the operating account into the trust account, or note it.'
                  else 'Check the landlord balances on Landlord payouts and the IRep fee transfers, then add a note explaining what''s left.' end,
      'amount', diff));
  end if;

  -- 6. Gaps: earlier months not locked.
  for r in select g.mo::date mo from generate_series(date_trunc('month', acct.opening_date), m - interval '1 month', interval '1 month') g(mo)
            where not exists (select 1 from public.reconciliations x where x.account_id = p_account_id
                                and x.period = g.mo::date and x.status = 'locked') loop
    out := out || jsonb_build_array(jsonb_build_object('severity', 'info', 'code', 'earlier_open',
      'title', to_char(r.mo, 'FMMonth YYYY') || ' isn''t locked yet',
      'detail', 'Months are locked in order.', 'fix', 'Finish and lock ' || to_char(r.mo, 'FMMonth') || ' first.',
      'date', r.mo));
  end loop;

  return coalesce((select jsonb_agg(e order by case e->>'severity' when 'error' then 1 when 'warning' then 2 else 3 end)
                     from jsonb_array_elements(out) e), '[]'::jsonb);
end;
$$;
revoke execute on function public.reconciliation_issues(uuid, date) from public, anon;
grant execute on function public.reconciliation_issues(uuid, date) to authenticated, service_role;

-- For the daily email: every active account, last month and this month, errors and warnings.
create or replace function public.reconciliation_alerts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('account', a.name, 'period', mo, 'status',
                    coalesce((select status from public.reconciliations r where r.account_id = a.id and r.period = mo), 'open'),
                    'issues', (select coalesce(jsonb_agg(i), '[]'::jsonb)
                                 from jsonb_array_elements(public.reconciliation_issues(a.id, mo)) i
                                where i->>'severity' in ('error', 'warning'))) order by a.name, mo), '[]'::jsonb)
    from public.bank_accounts a
    cross join lateral (values ((date_trunc('month', (now() at time zone 'America/Toronto')) - interval '1 month')::date),
                               (date_trunc('month', (now() at time zone 'America/Toronto'))::date)) v(mo)
   where a.active and mo >= date_trunc('month', a.opening_date)
     and coalesce((select status from public.reconciliations r where r.account_id = a.id and r.period = mo), 'open') <> 'locked'
$$;
revoke execute on function public.reconciliation_alerts() from public, anon, authenticated;
grant execute on function public.reconciliation_alerts() to service_role;
