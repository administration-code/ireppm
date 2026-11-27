-- 0101: what Chuck found after visiting a job.
--   vendor_outcome: 'fixed' (completed on site, invoice), 'estimate' (needs the landlord's OK first),
--   'non_issue' (nothing to repair). vendor_estimate*: his estimate (before HST) and the scope of work.
--   estimate_sent_at: when staff sent the estimate to the landlord for approval.
-- Run AFTER 0100. Safe to re-run.

alter table public.maintenance_requests add column if not exists vendor_outcome text check (vendor_outcome in ('fixed', 'estimate', 'non_issue'));
alter table public.maintenance_requests add column if not exists vendor_estimate numeric(10, 2);
alter table public.maintenance_requests add column if not exists vendor_estimate_notes text;
alter table public.maintenance_requests add column if not exists vendor_estimate_at timestamptz;
alter table public.maintenance_requests add column if not exists estimate_sent_at timestamptz;

-- Jobs he already marked done count as fixed.
update public.maintenance_requests set vendor_outcome = 'fixed' where vendor_done_at is not null and vendor_outcome is null;
