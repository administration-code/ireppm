-- Staff email alerts: new showing requests, applications and landlord inquiries
-- call https://ireppm.ca/api/notify (see src/app/api/notify/route.js).
-- Already applied on 2026-10-14. The shared secret lives in Supabase Vault as
-- 'notify_webhook_secret' and must match NOTIFY_WEBHOOK_SECRET in Vercel.
-- To change it: select vault.update_secret((select id from vault.secrets where name='notify_webhook_secret'), '<new secret>');

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_staff_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  perform net.http_post(
    url := 'https://ireppm.ca/api/notify',
    body := jsonb_build_object('type', 'INSERT', 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', to_jsonb(NEW)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    timeout_milliseconds := 5000
  );
  return NEW;
exception when others then
  raise warning 'notify_staff_webhook failed: %', sqlerrm;
  return NEW;
end;
$$;

revoke execute on function public.notify_staff_webhook() from public, anon, authenticated;

drop trigger if exists notify_staff_showing on public.showing_requests;
create trigger notify_staff_showing after insert on public.showing_requests
  for each row execute function public.notify_staff_webhook();
drop trigger if exists notify_staff_application on public.applications;
create trigger notify_staff_application after insert on public.applications
  for each row execute function public.notify_staff_webhook();
drop trigger if exists notify_staff_inquiry on public.landlord_inquiries;
create trigger notify_staff_inquiry after insert on public.landlord_inquiries
  for each row execute function public.notify_staff_webhook();
