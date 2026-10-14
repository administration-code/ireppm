-- Fix: the role guard also blocked admins changing roles from the Supabase dashboard
-- (no signed-in user there). Only block role changes coming from the website itself.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not public.is_staff() then
    new.role = old.role;
  end if;
  return new;
end;
$$;

-- Hardening from the Supabase security advisor.
alter function public.touch_updated_at() set search_path = public;

-- Trigger-only functions should not be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
-- is_staff() stays callable: the access rules on every table use it.
