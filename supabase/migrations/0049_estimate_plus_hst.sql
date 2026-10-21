-- Maintenance: mark an estimate as "+ HST" (quotes that don't include tax yet).
-- The owner-approval threshold then compares the estimate with HST added.

alter table public.maintenance_requests
  add column if not exists estimate_plus_hst boolean not null default false;

create or replace function public.maintenance_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold numeric;
  hst numeric;
  est numeric;
begin
  if tg_op = 'INSERT' and auth.uid() is not null and not public.is_staff() then
    if new.tenancy_id is null or not public.is_tenant_of(new.tenancy_id)
       or not exists (select 1 from public.tenancies t
                      where t.id = new.tenancy_id and t.unit_id = new.unit_id
                        and t.status in ('upcoming', 'active', 'notice')) then
      raise exception 'You can only report maintenance for your own home.';
    end if;
    new.submitted_by := auth.uid();
    new.source := 'tenant_portal';
    new.status := 'new';
    new.partner_id := null;
    new.scheduled_for := null;
    new.entry_notice_served_at := null;
    new.estimated_cost := null;
    new.estimate_plus_hst := false;
    new.actual_cost := null;
    new.owner_approval := 'not_needed';
    new.owner_decision_at := null;
    new.charge_to := null;
    new.tenant_update := null;
    new.staff_notes := null;
    new.completed_at := null;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  if new.owner_approval in ('approved', 'declined')
     and (tg_op = 'INSERT' or old.owner_approval is distinct from new.owner_approval) then
    new.owner_decision_at := coalesce(new.owner_decision_at, now());
  end if;

  select amount into threshold from public.service_rates where key = 'owner_approval_threshold';
  select amount into hst from public.service_rates where key = 'hst';
  est := coalesce(new.estimated_cost, 0)
         * case when new.estimate_plus_hst then 1 + coalesce(hst, 13) / 100 else 1 end;
  if new.owner_approval = 'not_needed' and new.urgency <> 'emergency'
     and threshold is not null and est > threshold then
    new.owner_approval := 'pending';
  end if;

  return new;
end;
$$;
