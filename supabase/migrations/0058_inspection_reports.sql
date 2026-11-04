-- IRep Property Management: inspection reports with recommended improvements.
--   * inspection_reports: one visit to a property by a vendor (partner) or staff, with the
--     property checks: furnace filter swapped, water shut-off valve set for the season,
--     gutter condition, signs of pests.
--   * inspection_report_units: each unit's appliances (stove, fridge, washer, dryer):
--     fair / needs replacement / not in the unit.
--   * improvement_items: recommended improvements, one line each, sent to the landlord, who
--     approves or declines each line. IRep adds a price per line afterwards.
--   Staff manage everything directly; vendors submit and landlords decide through the website's
--   server (it checks who they are), so only staff policies are needed here.
-- Run AFTER 0057. Safe to re-run.

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  inspected_on date not null default current_date,
  partner_id uuid references public.partners (id) on delete set null,
  inspected_by text,
  furnace_filter_swapped boolean,
  water_valve_set boolean,
  gutter_condition text check (gutter_condition is null or gutter_condition in ('fair', 'needs_replacement', 'none')),
  pests boolean,
  pests_note text,
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'sent', 'closed')),
  sent_at timestamptz,
  sent_to text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspection_reports_property_idx on public.inspection_reports (property_id, inspected_on desc);
drop trigger if exists inspection_reports_touch on public.inspection_reports;
create trigger inspection_reports_touch before update on public.inspection_reports
  for each row execute function public.touch_updated_at();

create table if not exists public.inspection_report_units (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inspection_reports (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  stove text check (stove is null or stove in ('fair', 'needs_replacement', 'none')),
  fridge text check (fridge is null or fridge in ('fair', 'needs_replacement', 'none')),
  washer text check (washer is null or washer in ('fair', 'needs_replacement', 'none')),
  dryer text check (dryer is null or dryer in ('fair', 'needs_replacement', 'none')),
  notes text,
  unique (report_id, unit_id)
);

create table if not exists public.improvement_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inspection_reports (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  sort integer not null default 0,
  description text not null,
  details text,
  added_by text,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'declined')),
  decided_at timestamptz,
  owner_note text,
  price numeric(10, 2) check (price is null or price >= 0),
  maintenance_request_id uuid references public.maintenance_requests (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists improvement_items_report_idx on public.improvement_items (report_id, sort);

alter table public.inspection_reports enable row level security;
alter table public.inspection_report_units enable row level security;
alter table public.improvement_items enable row level security;
drop policy if exists "inspection_reports: staff all" on public.inspection_reports;
create policy "inspection_reports: staff all" on public.inspection_reports
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "inspection_report_units: staff all" on public.inspection_report_units;
create policy "inspection_report_units: staff all" on public.inspection_report_units
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "improvement_items: staff all" on public.improvement_items;
create policy "improvement_items: staff all" on public.improvement_items
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.inspection_reports, public.inspection_report_units, public.improvement_items from anon;
