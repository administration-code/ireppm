-- IRep Property Management: access-control fixes from the Nov 3, 2026 review.
--
-- 1. Account takeover through the profile email (critical).
--    Signed-in users could change the email on their own profile row, and a trigger then linked
--    them to any landlord (owners) or tenant (tenancy_tenants) record with that email that hadn't
--    signed in yet, giving them that landlord's or tenant's portal. Now:
--      * only staff can change a profile's email (it mirrors the verified sign-in email), and
--      * landlord/tenant records link only to a sign-in whose email is CONFIRMED and matches,
--        including at the moment someone confirms their email.
-- 2. Functions signed-in users didn't need: match_payer (looked up tenancies by payer name) and
--    rent_month_paid (whether a tenancy paid a month) are used only inside the database.
-- 3. Fee functions no longer callable without signing in.
-- Run AFTER 0058. Safe to re-run.

-- 1a. Role and email are staff-only to change.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_staff() then
    if new.role is distinct from old.role then new.role := old.role; end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
  end if;
  return new;
end;
$$;

-- 1b. Link landlord and tenant records only to a confirmed sign-in with the same email.
create or replace function public.link_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and exists (
       select 1 from auth.users u
        where u.id = new.id and u.email_confirmed_at is not null
          and lower(trim(u.email)) = lower(trim(new.email))) then
    update public.owners set profile_id = new.id
     where profile_id is null and email is not null
       and lower(trim(email)) = lower(trim(new.email));
  end if;
  return new;
end;
$$;

create or replace function public.link_tenant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and exists (
       select 1 from auth.users u
        where u.id = new.id and u.email_confirmed_at is not null
          and lower(trim(u.email)) = lower(trim(new.email))) then
    update public.tenancy_tenants set profile_id = new.id
     where profile_id is null and email is not null
       and lower(trim(email)) = lower(trim(new.email));
  end if;
  return new;
end;
$$;

-- 1c. When someone confirms (or changes and confirms) their sign-in email: keep the profile's
--     email in step and link their landlord/tenant records.
create or replace function public.sync_confirmed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and new.email is not null
     and (old.email_confirmed_at is null or new.email is distinct from old.email) then
    update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
    update public.owners set profile_id = new.id
     where profile_id is null and email is not null and lower(trim(email)) = lower(trim(new.email));
    update public.tenancy_tenants set profile_id = new.id
     where profile_id is null and email is not null and lower(trim(email)) = lower(trim(new.email));
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_confirmed_email() from public, anon, authenticated;
drop trigger if exists on_auth_email_confirmed on auth.users;
create trigger on_auth_email_confirmed after update of email_confirmed_at, email on auth.users
  for each row execute function public.sync_confirmed_email();

-- 2. Database-only helpers.
revoke execute on function public.match_payer(text) from public, anon, authenticated;
revoke execute on function public.rent_month_paid(uuid, date, uuid) from public, anon, authenticated;

-- 3. Fee helpers: signed-in only.
revoke execute on function public.property_fee_for_month(uuid, date) from public, anon;
revoke execute on function public.property_addons_monthly(uuid) from public, anon;
revoke execute on function public.property_lawn_snow(uuid) from public, anon;
revoke execute on function public.standard_management_fee(text, integer) from public, anon;
grant execute on function public.property_fee_for_month(uuid, date) to authenticated, service_role;
grant execute on function public.property_addons_monthly(uuid) to authenticated, service_role;
grant execute on function public.property_lawn_snow(uuid) to authenticated, service_role;
grant execute on function public.standard_management_fee(text, integer) to authenticated, service_role;
