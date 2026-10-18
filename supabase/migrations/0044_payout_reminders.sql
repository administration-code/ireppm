-- 0044: payouts still to send (shown on the dashboard and the Landlord Payouts page until marked sent).
create table if not exists public.payout_reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payee text not null,
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null,
  property_id uuid references public.properties (id) on delete set null,  -- set: marking it sent records the landlord payout
  period date check (period is null or extract(day from period) = 1),
  done_at timestamptz,
  done_note text,
  owner_payout_id uuid references public.owner_payouts (id) on delete set null
);
alter table public.payout_reminders enable row level security;
drop policy if exists "payout_reminders: staff all" on public.payout_reminders;
create policy "payout_reminders: staff all" on public.payout_reminders for all using (public.is_staff()) with check (public.is_staff());

insert into public.payout_reminders (payee, amount, reason, property_id, period) values
  ('Pratik Bidkar', 350.00, '1252 McEwan: Ayoola''s rent ($200 Oct 14 + $150 Oct 15), received after the Oct 8 payout', 'e9674676-6057-4dc9-975a-1a0b912389b6', '2026-10-01'),
  ('Chirag Matholiya', 450.00, '523 Caron: Akash''s rent ($600 paid by Arinze Oct 16) less $150 Oxio internet', '3fff935c-9a16-4850-a43d-42a6182ee2c9', '2026-10-01'),
  ('Saira Momtaz', 600.00, '1333 Windermere (former property): rent collected after management ended. Confirm the amount before sending.', null, null),
  ('Imtiaz Mirza', 925.00, '557 McEwan (former property): rent collected after management ended, incl. City of Windsor $450. Confirm the amount before sending.', null, null);
