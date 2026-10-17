-- The signed-in landlord's owner id, so the owner portal can open their year-end report.
-- Owners can't read public.owners directly (staff-only RLS).
create or replace function public.my_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.owners where profile_id = auth.uid() order by id limit 1;
$$;
revoke execute on function public.my_owner_id() from public, anon;
grant execute on function public.my_owner_id() to authenticated, service_role;
