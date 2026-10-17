-- Monthly $100 gift card draw for tenants who pay through PayProp before the 7th.
create table if not exists public.payprop_draws (
  period date primary key check (extract(day from period) = 1),
  entries integer not null default 0,
  winner_tenancy_id uuid references public.tenancies (id) on delete set null,
  winner_name text,
  winner_email text,
  drawn_at timestamptz,
  drawn_by uuid references public.profiles (id) on delete set null,
  winner_emailed_at timestamptz,
  gift_card_sent_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.payprop_draws enable row level security;
drop policy if exists "payprop_draws: staff all" on public.payprop_draws;
create policy "payprop_draws: staff all" on public.payprop_draws
  for all using (public.is_staff()) with check (public.is_staff());
