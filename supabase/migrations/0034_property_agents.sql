-- IRep Property Management: agents (contractors and showing agents) assigned to properties, and
-- an agent portal. Agents are the people on the Partners list; they sign in with the email on
-- their partner record.
--   * property_agents: who does showings / maintenance / lawn and snow at each property.
--   * Showing requests go to the property's showing agent(s), with a private link to approve,
--     decline or suggest a time; if none is assigned, to the default showings contact.
-- Run AFTER 0033. Safe to re-run.

create table if not exists public.property_agents (
  property_id uuid not null references public.properties (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  role text not null check (role in ('showings', 'maintenance', 'lawn_snow')),
  created_at timestamptz not null default now(),
  primary key (property_id, partner_id, role)
);
create index if not exists property_agents_partner_idx on public.property_agents (partner_id);
alter table public.property_agents enable row level security;
drop policy if exists "property_agents: staff all" on public.property_agents;
create policy "property_agents: staff all" on public.property_agents
  for all using (public.is_staff()) with check (public.is_staff());

-- The partner record for the signed-in person (matched on email).
create or replace function public.my_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.partners p
   where p.active and p.email is not null
     and lower(trim(p.email)) = lower((select email from auth.users where id = auth.uid()))
   limit 1
$$;
revoke execute on function public.my_partner_id() from public, anon;
grant execute on function public.my_partner_id() to authenticated;

-- The property a listing belongs to (through its unit).
create or replace function public.listing_property_id(p_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.property_id from public.units u where u.listing_id = p_listing_id limit 1
$$;
grant execute on function public.listing_property_id(uuid) to authenticated, service_role;

-- Everything an agent needs: their properties, showings at those properties (with the private
-- respond link) and maintenance jobs assigned to them.
create or replace function public.agent_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := public.my_partner_id();
begin
  if me is null then return null; end if;
  return jsonb_build_object(
    'partner', (select jsonb_build_object('id', id, 'name', name, 'company', company) from public.partners where id = me),
    'properties', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'address', p.address, 'city', p.city,
                                   'roles', (select jsonb_agg(pa2.role) from public.property_agents pa2 where pa2.property_id = p.id and pa2.partner_id = me))
                                   order by p.address)
                              from public.properties p
                             where exists (select 1 from public.property_agents pa where pa.property_id = p.id and pa.partner_id = me)), '[]'::jsonb),
    'showings', coalesce((select jsonb_agg(jsonb_build_object(
                                   'id', s.id, 'status', s.status, 'preferred_date', s.preferred_date, 'preferred_time', s.preferred_time,
                                   'proposed_date', s.proposed_date, 'proposed_time', s.proposed_time, 'notes', s.notes,
                                   'place', concat_ws(', ', l.address, l.unit), 'renter', pr.full_name, 'renter_phone', pr.phone,
                                   'token', tk.token, 'vacant', public.listing_is_vacant(s.listing_id))
                                   order by s.preferred_date, s.created_at)
                              from public.showing_requests s
                              join public.listings l on l.id = s.listing_id
                              left join public.profiles pr on pr.id = s.user_id
                              left join public.showing_action_tokens tk on tk.showing_id = s.id
                             where s.status in ('requested', 'rescheduled', 'confirmed')
                               and s.preferred_date >= current_date - 1
                               and exists (select 1 from public.property_agents pa
                                            where pa.partner_id = me and pa.role = 'showings'
                                              and pa.property_id = public.listing_property_id(s.listing_id))), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'status', m.status, 'urgency', m.urgency,
                                   'scheduled_for', m.scheduled_for, 'place', concat_ws(', ', p.address, u.label),
                                   'access_notes', m.access_notes, 'permission_to_enter', m.permission_to_enter)
                                   order by m.created_at desc)
                              from public.maintenance_requests m
                              join public.units u on u.id = m.unit_id
                              join public.properties p on p.id = u.property_id
                             where m.partner_id = me and m.status not in ('completed', 'cancelled')), '[]'::jsonb));
end;
$$;
revoke execute on function public.agent_portal() from public, anon;
grant execute on function public.agent_portal() to authenticated;
