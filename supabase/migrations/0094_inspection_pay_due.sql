-- 0094: inspections twice a year, paid per inspection.
--   * partners.inspection_pay: what IRep pays this contractor per inspection, before HST (Chuck: $50).
--     HST goes on top when partners.charges_hst is on.
--   * partner_ledger gains kind 'inspection': added automatically when he sends an inspection
--     (one per report: inspection_report_id is unique).
-- Run AFTER 0093. Safe to re-run.

alter table public.partners add column if not exists inspection_pay numeric(10, 2);
update public.partners set inspection_pay = 50 where id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576' and inspection_pay is null;

alter table public.partner_ledger drop constraint if exists partner_ledger_kind_check;
alter table public.partner_ledger add constraint partner_ledger_kind_check
  check (kind in ('leasing_fee', 'payment', 'loan_opening', 'loan_payment', 'adjustment', 'lawn_snow', 'inspection'));
alter table public.partner_ledger add column if not exists inspection_report_id uuid unique references public.inspection_reports (id) on delete set null;
