-- 0088: a practice property so Chuck can try things in the Agent Portal without touching real tenants,
-- landlords or money: log a request, mark a job done, log cash, put a vacancy up.
--   * properties.is_practice: marks it. Staff can clear everything logged there with one button
--     (Chuck Onboarding page), and the portal shows "PRACTICE" on it.
--   * 1 Practice St (TEST): an Upper unit with a practice tenant (no rent charged, no email, so nobody is
--     emailed) and an empty Lower unit for vacancy practice. Chuck does maintenance and showings there.
-- Run AFTER 0087. Safe to re-run.

alter table public.properties add column if not exists is_practice boolean not null default false;

insert into public.owners (id, name, notes)
values ('00000000-0000-4000-8000-00000000a001', 'IRep Practice (test landlord)', 'Not a real landlord: for practising in the Agent Portal.')
on conflict (id) do nothing;

insert into public.properties (id, address, city, owner_id, is_practice)
values ('00000000-0000-4000-8000-00000000a002', '1 Practice St (TEST)', 'Windsor', '00000000-0000-4000-8000-00000000a001', true)
on conflict (id) do update set is_practice = true;

insert into public.units (id, property_id, label)
values ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000a002', 'Upper'),
       ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000a002', 'Lower')
on conflict (id) do nothing;

insert into public.tenancies (id, unit_id, status, start_date, rent, collects_rent, notes)
values ('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-00000000a003', 'active', '2026-10-01', 0, false,
        'Practice tenancy for the Agent Portal. Not real.')
on conflict (id) do nothing;

insert into public.tenancy_tenants (tenancy_id, full_name, is_primary)
select '00000000-0000-4000-8000-00000000a005', 'Practice Tenant', true
where not exists (select 1 from public.tenancy_tenants where tenancy_id = '00000000-0000-4000-8000-00000000a005');

insert into public.property_agents (property_id, partner_id, role)
select '00000000-0000-4000-8000-00000000a002', 'bee3f28a-a809-4a19-86d2-a0647e3fb576', r
from unnest(array['maintenance', 'showings']) r
where not exists (select 1 from public.property_agents pa where pa.property_id = '00000000-0000-4000-8000-00000000a002'
                  and pa.partner_id = 'bee3f28a-a809-4a19-86d2-a0647e3fb576' and pa.role = r);
