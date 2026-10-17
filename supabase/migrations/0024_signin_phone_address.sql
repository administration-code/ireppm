-- IRep Property Management: keep the phone number typed at sign-in (even when the email link is
-- opened in another browser or on another device), fill the name from Google, and let renters
-- keep their current address on their profile (copied onto applications).
-- Run AFTER 0023. Safe to re-run.

alter table public.profiles add column if not exists current_address text;
alter table public.applications add column if not exists applicant_address text;

-- The phone typed in the sign-in form, by email, for up to 2 hours until the person signs in.
create table if not exists public.signin_phones (
  email text primary key,
  phone text not null,
  created_at timestamptz not null default now()
);
alter table public.signin_phones enable row level security;   -- no policies: functions only

create or replace function public.remember_signin_phone(p_email text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  ph text := left(trim(coalesce(p_phone, '')), 30);
begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if length(regexp_replace(ph, '\D', '', 'g')) < 10 then return; end if;
  insert into public.signin_phones (email, phone, created_at) values (em, ph, now())
  on conflict (email) do update set phone = excluded.phone, created_at = now();
  delete from public.signin_phones where created_at < now() - interval '1 day';
end;
$$;
revoke execute on function public.remember_signin_phone(text, text) from public;
grant execute on function public.remember_signin_phone(text, text) to anon, authenticated;

-- Called right after sign-in: fill an empty phone (from the sign-in form or the sign-up data)
-- and an empty name (from Google). Never overwrites what the person already saved.
create or replace function public.claim_signin_details()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u record;
  pend text;
begin
  if uid is null then return null; end if;
  select email, raw_user_meta_data as meta into u from auth.users where id = uid;
  select phone into pend from public.signin_phones
   where email = lower(trim(u.email)) and created_at > now() - interval '2 hours';

  update public.profiles p
     set phone = coalesce(nullif(p.phone, ''), pend, nullif(u.meta ->> 'phone', '')),
         full_name = coalesce(nullif(p.full_name, ''), nullif(u.meta ->> 'full_name', ''), nullif(u.meta ->> 'name', ''))
   where p.id = uid;
  delete from public.signin_phones where email = lower(trim(u.email));

  return (select jsonb_build_object('phone', phone, 'full_name', full_name) from public.profiles where id = uid);
end;
$$;
revoke execute on function public.claim_signin_details() from public, anon;
grant execute on function public.claim_signin_details() to authenticated;

-- New accounts: phone from the sign-in form, name from Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (new.id, new.email,
          nullif(new.raw_user_meta_data ->> 'phone', ''),
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')))
  on conflict (id) do nothing;
  return new;
end;
$$;
