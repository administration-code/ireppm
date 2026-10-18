-- Reviews from tenants and landlords. Submitted through /api/reviews (server), approved by staff
-- before they appear on /reviews. Only staff can read or change rows directly.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reviewer_type text not null check (reviewer_type in ('tenant', 'landlord')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  title text check (char_length(title) <= 120),
  body text not null check (char_length(body) between 10 and 2000),
  consent boolean not null check (consent),
  email text,
  profile_id uuid references public.profiles (id) on delete set null,
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  approved_at timestamptz,
  staff_reply text check (char_length(staff_reply) <= 1000),
  reviewed_by uuid references public.profiles (id) on delete set null
);
create index if not exists reviews_public_idx on public.reviews (status, created_at desc);
alter table public.reviews enable row level security;
drop policy if exists "reviews: staff all" on public.reviews;
create policy "reviews: staff all" on public.reviews
  for all using (public.is_staff()) with check (public.is_staff());
