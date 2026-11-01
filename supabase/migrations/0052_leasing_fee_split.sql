-- IRep Property Management: leasing fees split between partners (Chuck and Rishi).
--   * Each leasing fee on a landlord statement (half a month's rent, + HST) is split between
--     the partners by partners.leasing_fee_share (% of the fee BEFORE HST; HST is always held back).
--   * partners.leasing_fees_from: the first statement month counted on their pay page.
--     October 2026 fees were already paid out on Oct 7, so both start from November 2026.
--   * Rishi is added as a partner with his shareholder loan (half of his share repays it).
-- Run AFTER 0051. Safe to re-run.

alter table public.partners add column if not exists leasing_fee_share numeric(5, 2) not null default 0
  check (leasing_fee_share >= 0 and leasing_fee_share <= 100);
alter table public.partners add column if not exists leasing_fees_from date;

update public.partners set leasing_fee_share = 50, leasing_fees_from = '2026-11-01'
 where id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576' and leasing_fee_share = 0;

insert into public.partners (name, trades, notes, active, loan_share_pct, loan_name, leasing_fee_share, leasing_fees_from)
select 'Rishi Bakshi', '{}', 'Shareholder. Gets half of each leasing fee (before HST); half of that repays his loan.', true,
       50, 'Shareholder loan', 50, '2026-11-01'
 where not exists (select 1 from public.partners where name = 'Rishi Bakshi');

insert into public.partner_ledger (partner_id, kind, entry_date, amount, notes)
select p.id, v.kind, v.d::date, v.amt, v.notes
  from public.partners p
  cross join (values
    ('loan_opening', '2026-09-08', 20000.00, 'Shareholder loan advanced'),
    ('loan_payment', '2026-09-08', 450.00, 'Received: from leasing fees, recorded before this tracker'),
    ('loan_payment', '2026-10-07', 268.38, 'Received: from leasing fees, recorded before this tracker')
  ) as v(kind, d, amt, notes)
 where p.name = 'Rishi Bakshi'
   and not exists (select 1 from public.partner_ledger l where l.partner_id = p.id);
