-- 0089: inspection reports with photos in each part, and a roof check.
--   * inspection_reports.photos: { furnace: [...], water_valve: [...], gutters: [...], roof: [...], pests: [...],
--     exterior: [...], notes: [...] }, each a list of { path, name } in the maintenance photos bucket.
--   * inspection_reports.roof_condition: fair / needs_repair / not_checked.
--   * inspection_report_units.photos: { stove: [...], fridge: [...], washer: [...], dryer: [...], notes: [...] }.
--   * improvement_items.photos: [ { path, name } ] for that improvement (shown to the landlord).
-- Run AFTER 0088. Safe to re-run.

alter table public.inspection_reports add column if not exists photos jsonb not null default '{}'::jsonb;
alter table public.inspection_reports add column if not exists roof_condition text;
alter table public.inspection_reports drop constraint if exists inspection_reports_roof_condition_check;
alter table public.inspection_reports add constraint inspection_reports_roof_condition_check
  check (roof_condition is null or roof_condition in ('fair', 'needs_repair', 'not_checked'));
alter table public.inspection_report_units add column if not exists photos jsonb not null default '{}'::jsonb;
alter table public.improvement_items add column if not exists photos jsonb not null default '[]'::jsonb;
