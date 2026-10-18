-- 0043: landlord referrals. A landlord who refers another landlord gets one month's management fee free
-- (credited on their statement) once the referred landlord's first full month with IRep is done.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_owner_id uuid references public.owners (id) on delete set null,
  referrer_text text,                        -- what the new landlord typed ("referred by"), before staff match it
  referred_name text not null,
  referred_email text,
  referred_owner_id uuid references public.owners (id) on delete set null,
  inquiry_id uuid references public.landlord_inquiries (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'credited', 'declined')),
  credit_property_id uuid references public.properties (id) on delete set null,
  credit_period date check (credit_period is null or extract(day from credit_period) = 1),
  credit_amount numeric(10, 2),
  statement_item_id uuid references public.statement_items (id) on delete set null,
  thanked_at timestamptz,
  notes text
);
alter table public.referrals enable row level security;
drop policy if exists "referrals: staff all" on public.referrals;
create policy "referrals: staff all" on public.referrals for all using (public.is_staff()) with check (public.is_staff());

alter table public.landlord_inquiries add column if not exists referred_by text;
