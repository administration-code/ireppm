-- IRep Property Management: initial database setup.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run: it skips anything that already exists.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in person. role = renter | staff | admin.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  full_name text,
  role text not null default 'renter' check (role in ('renter', 'staff', 'admin')),
  income_type text check (income_type in ('student', 'employed', 'support')),
  credit_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Is the current user IRep staff? (security definer so policies can call it without recursion)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Renters can't make themselves staff.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_staff() then
    new.role = old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- Listings. Only rows with status = 'available' appear on the public site.
-- ---------------------------------------------------------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  address text not null,
  unit text,
  neighbourhood text,
  city text not null default 'Windsor',
  property_type text not null default 'Apartment'
    check (property_type in ('Apartment', 'House', 'Townhouse', 'Room')),
  beds numeric(3, 1) not null default 1,
  baths numeric(3, 1) not null default 1,
  sqft integer,
  rent integer not null,
  available_on date,
  utilities text,
  parking text,
  laundry text,
  pets text,
  description text,
  features text[] not null default '{}',
  photos text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'available', 'leased', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Showing requests from renters.
-- ---------------------------------------------------------------------------
create table if not exists public.showing_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  preferred_date date not null,
  preferred_time text not null,
  notes text,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists showing_requests_listing_idx on public.showing_requests (listing_id);
create index if not exists showing_requests_user_idx on public.showing_requests (user_id);

-- ---------------------------------------------------------------------------
-- Documents in a renter's profile. Files live in the private 'applicant-docs' bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.applicant_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_type text not null
    check (doc_type in ('photo_id', 'income', 'paystubs', 'bank_statement', 'credit_report')),
  income_type text check (income_type in ('student', 'employed', 'support')),
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  uploaded_at timestamptz not null default now(),
  unique (user_id, doc_type)
);

-- ---------------------------------------------------------------------------
-- Applications. 'documents' is a snapshot of the files attached when submitted.
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  applicant_name text not null,
  applicant_email text,
  applicant_phone text,
  income_type text,
  documents jsonb not null default '[]'::jsonb,
  credit_consent boolean not null default false,
  consent_text text,
  consent_at timestamptz,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'approved', 'declined', 'withdrawn')),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id),
  check (credit_consent = true)
);
create index if not exists applications_listing_idx on public.applications (listing_id);

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Landlord inquiries from the About page.
-- ---------------------------------------------------------------------------
create table if not exists public.landlord_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  property_address text,
  interest text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security: renters see only their own rows; staff see everything.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.showing_requests enable row level security;
alter table public.applicant_documents enable row level security;
alter table public.applications enable row level security;
alter table public.landlord_inquiries enable row level security;

drop policy if exists "profiles: read own or staff" on public.profiles;
create policy "profiles: read own or staff" on public.profiles
  for select using (id = auth.uid() or public.is_staff());
drop policy if exists "profiles: update own or staff" on public.profiles;
create policy "profiles: update own or staff" on public.profiles
  for update using (id = auth.uid() or public.is_staff());

drop policy if exists "listings: public reads available" on public.listings;
create policy "listings: public reads available" on public.listings
  for select using (status = 'available' or public.is_staff());
drop policy if exists "listings: staff write" on public.listings;
create policy "listings: staff write" on public.listings
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "showings: read own or staff" on public.showing_requests;
create policy "showings: read own or staff" on public.showing_requests
  for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "showings: renter creates own" on public.showing_requests;
create policy "showings: renter creates own" on public.showing_requests
  for insert with check (user_id = auth.uid() and status = 'requested');
drop policy if exists "showings: staff update" on public.showing_requests;
create policy "showings: staff update" on public.showing_requests
  for update using (public.is_staff());

drop policy if exists "docs: own or staff read" on public.applicant_documents;
create policy "docs: own or staff read" on public.applicant_documents
  for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "docs: own insert" on public.applicant_documents;
create policy "docs: own insert" on public.applicant_documents
  for insert with check (user_id = auth.uid());
drop policy if exists "docs: own update" on public.applicant_documents;
create policy "docs: own update" on public.applicant_documents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "docs: own delete" on public.applicant_documents;
create policy "docs: own delete" on public.applicant_documents
  for delete using (user_id = auth.uid() or public.is_staff());

drop policy if exists "applications: read own or staff" on public.applications;
create policy "applications: read own or staff" on public.applications
  for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "applications: renter submits own" on public.applications;
create policy "applications: renter submits own" on public.applications
  for insert with check (user_id = auth.uid() and status = 'submitted');
drop policy if exists "applications: staff update" on public.applications;
create policy "applications: staff update" on public.applications
  for update using (public.is_staff());

drop policy if exists "inquiries: anyone submits" on public.landlord_inquiries;
create policy "inquiries: anyone submits" on public.landlord_inquiries
  for insert with check (status = 'new');
drop policy if exists "inquiries: staff read" on public.landlord_inquiries;
create policy "inquiries: staff read" on public.landlord_inquiries
  for select using (public.is_staff());
drop policy if exists "inquiries: staff update" on public.landlord_inquiries;
create policy "inquiries: staff update" on public.landlord_inquiries
  for update using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Storage buckets.
--   applicant-docs: PRIVATE. Files are stored under <user id>/<doc type>/...
--   listing-photos: public, so listing photos load on the website.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'applicant-docs', 'applicant-docs', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "applicant-docs: own folder read" on storage.objects;
create policy "applicant-docs: own folder read" on storage.objects
  for select using (
    bucket_id = 'applicant-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );
drop policy if exists "applicant-docs: own folder upload" on storage.objects;
create policy "applicant-docs: own folder upload" on storage.objects
  for insert with check (
    bucket_id = 'applicant-docs' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "applicant-docs: own folder delete" on storage.objects;
create policy "applicant-docs: own folder delete" on storage.objects
  for delete using (
    bucket_id = 'applicant-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

drop policy if exists "listing-photos: staff manage" on storage.objects;
create policy "listing-photos: staff manage" on storage.objects
  for all using (bucket_id = 'listing-photos' and public.is_staff())
  with check (bucket_id = 'listing-photos' and public.is_staff());
