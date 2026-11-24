-- 0090: Chuck quotes the repairs on an inspection and sends it straight to the landlord.
--   * inspection_reports.status gains 'draft' (saved as he goes; landlords never see drafts).
--   * inspection_reports.draft: the unfinished form (with uploaded photo paths) so he can finish later.
--   * improvement_items.source: 'check' (from a check marked needs repair / replacement) or 'improvement';
--     source_key says which check (e.g. gutters, roof, unit:<id>:stove).
--   * maintenance_requests.charge_to gains 'owner_invoice': the landlord pays on a separate invoice.
--     It is NOT deducted from the rent payout (statement views only deduct charge_to = 'owner').
-- Run AFTER 0089. Safe to re-run.

alter table public.inspection_reports drop constraint if exists inspection_reports_status_check;
alter table public.inspection_reports add constraint inspection_reports_status_check
  check (status in ('draft', 'submitted', 'sent', 'closed'));
alter table public.inspection_reports add column if not exists draft jsonb;
alter table public.inspection_reports add column if not exists sent_by text;

alter table public.improvement_items add column if not exists source text not null default 'improvement';
alter table public.improvement_items drop constraint if exists improvement_items_source_check;
alter table public.improvement_items add constraint improvement_items_source_check
  check (source in ('check', 'improvement'));
alter table public.improvement_items add column if not exists source_key text;

alter table public.maintenance_requests drop constraint if exists maintenance_requests_charge_to_check;
alter table public.maintenance_requests add constraint maintenance_requests_charge_to_check
  check (charge_to in ('owner', 'tenant', 'irep', 'owner_invoice'));
