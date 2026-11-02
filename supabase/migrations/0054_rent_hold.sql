-- IRep Property Management: hold rent back from a landlord payout.
--   A hold is a statement item (kind 'rent_hold', negative) in the month the rent counts, so the
--   money stays with IRep instead of going to the owner. When it's settled, staff choose how much
--   goes to the landlord (a positive 'rent_hold' item in the month it's released, linked by hold_of)
--   and how much is refunded to the tenant (recorded on the hold; it never reaches the owner).
-- Run AFTER 0053. Safe to re-run.

alter table public.statement_items drop constraint if exists statement_items_kind_check;
alter table public.statement_items add constraint statement_items_kind_check
  check (kind in ('leasing_fee', 'expense', 'fee_adjustment', 'carryover', 'other', 'rent_hold'));

alter table public.statement_items add column if not exists hold_status text
  check (hold_status is null or hold_status in ('held', 'settled'));
alter table public.statement_items add column if not exists hold_of uuid references public.statement_items (id) on delete cascade;
alter table public.statement_items add column if not exists refunded_amount numeric(10, 2);
alter table public.statement_items add column if not exists refunded_on date;
alter table public.statement_items add column if not exists settled_at timestamptz;
alter table public.statement_items add column if not exists settle_note text;

create index if not exists statement_items_open_holds_idx on public.statement_items (property_id)
  where kind = 'rent_hold' and hold_status = 'held';
