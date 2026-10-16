-- IRep Property Management: renters can withdraw an application and apply again.
-- Before: one application per renter per listing, ever. Now: one OPEN application
-- (submitted, reviewing or approved) per renter per listing; after a withdrawal or a
-- decline they can apply to the same listing again. Run AFTER 0016. Safe to re-run.

alter table public.applications drop constraint if exists applications_user_id_listing_id_key;
create unique index if not exists applications_one_open_per_listing
  on public.applications (user_id, listing_id)
  where status in ('submitted', 'reviewing', 'approved');

-- A renter withdraws their own application while it's still being considered.
create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.applications
     set status = 'withdrawn'
   where id = p_application_id
     and user_id = auth.uid()
     and status in ('submitted', 'reviewing');
  if not found then
    raise exception 'This application can''t be withdrawn.';
  end if;
end;
$$;
revoke execute on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;
