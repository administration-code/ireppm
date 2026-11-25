-- 0093: application turnaround. When the landlord was last reminded to decide on an applicant
-- (one automatic reminder after 1 business day). Run AFTER 0092. Safe to re-run.
alter table public.applications add column if not exists owner_reminder_sent_at timestamptz;
