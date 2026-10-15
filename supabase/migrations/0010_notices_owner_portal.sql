-- IRep Property Management: N-form log, landlord portal and month-end letters (back office, step 5).
-- Run AFTER 0009. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Notices (Ontario LTB forms) served on tenants.
-- ---------------------------------------------------------------------------
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete cascade,
  form text not null check (form in ('N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'N11', 'N12', 'N13', 'other')),
  title text,                                  -- for 'other', or a short label
  served_on date not null,
  service_method text check (service_method in ('in_person', 'mail', 'email', 'mail_slot', 'courier', 'other')),
  served_by text,
  effective_date date,                         -- N1: increase date; N4/N5/N12/N13: termination date
  amount numeric(10, 2),                       -- N4: arrears owing; N1: new rent
  status text not null default 'served'
    check (status in ('served', 'resolved', 'withdrawn', 'filed_ltb', 'order_issued', 'void')),
  ltb_file_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notices_tenancy_idx on public.notices (tenancy_id);
create index if not exists notices_served_idx on public.notices (served_on);
drop trigger if exists notices_touch on public.notices;
create trigger notices_touch before update on public.notices
  for each row execute function public.touch_updated_at();

alter table public.notices enable row level security;
drop policy if exists "notices: staff all" on public.notices;
create policy "notices: staff all" on public.notices
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. Landlord accounts: link owners to their website account by email
--    (same idea as tenants; sign-in is by magic link or Google, so verified).
-- ---------------------------------------------------------------------------
alter table public.owners add column if not exists profile_id uuid references public.profiles (id) on delete set null;
create index if not exists owners_profile_idx on public.owners (profile_id);

create or replace function public.link_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null then
    update public.owners set profile_id = new.id
     where profile_id is null and email is not null
       and lower(trim(email)) = lower(trim(new.email));
  end if;
  return new;
end;
$$;
revoke execute on function public.link_owner_profile() from public, anon, authenticated;
drop trigger if exists profiles_link_owner on public.profiles;
create trigger profiles_link_owner after insert or update of email on public.profiles
  for each row execute function public.link_owner_profile();

create or replace function public.link_owner_on_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and (tg_op = 'INSERT' or old.email is distinct from new.email) then
    select id into new.profile_id from public.profiles
     where email is not null and lower(trim(email)) = lower(trim(new.email)) limit 1;
  end if;
  return new;
end;
$$;
revoke execute on function public.link_owner_on_save() from public, anon, authenticated;
drop trigger if exists owners_link_profile on public.owners;
create trigger owners_link_profile before insert or update of email on public.owners
  for each row execute function public.link_owner_on_save();

update public.owners o set profile_id = p.id
  from public.profiles p
 where o.profile_id is null and o.email is not null and p.email is not null
   and lower(trim(o.email)) = lower(trim(p.email));

-- Is the signed-in user the owner of this owner record?
create or replace function public.is_owner_account(o_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where id = o_id and profile_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. Month-end letter data: everything about an owner's properties for a month,
--    as one JSON document. Staff can build any owner's; an owner only their own.
-- ---------------------------------------------------------------------------
create or replace function public.owner_letter_data(p_owner_id uuid, p_period date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_period)::date;
  m_end date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  result jsonb;
begin
  if not (public.is_staff() or public.is_owner_account(p_owner_id) or auth.uid() is null) then
    raise exception 'Not allowed';
  end if;

  select jsonb_build_object(
    'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email),
    'period', m,
    'properties', coalesce((
      select jsonb_agg(prop order by prop->>'address')
      from (
        select jsonb_build_object(
          'property_id', pr.id,
          'address', pr.address, 'city', pr.city, 'postal_code', pr.postal_code,
          'statement', (select to_jsonb(s) - 'property_id' from public.owner_statement_totals s
                         where s.property_id = pr.id and s.period = m),
          'rent', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', l.unit_label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = l.tenancy_id
                                 order by is_primary desc, created_at limit 1),
                     'received_on', l.received_on, 'rent_period', l.rent_period, 'amount', l.amount,
                     'kind', l.kind, 'method', l.method, 'counts', l.counts_toward_statement)
                   order by l.unit_label, l.received_on)
              from public.owner_statement_payments l
             where l.property_id = pr.id and l.period = m), '[]'::jsonb),
          'items', coalesce((
            select jsonb_agg(jsonb_build_object('kind', i.kind, 'description', i.description, 'amount', i.amount)
                   order by i.created_at)
              from public.statement_items i where i.property_id = pr.id and i.period = m), '[]'::jsonb),
          'payouts', coalesce((
            select jsonb_agg(jsonb_build_object('paid_on', po.paid_on, 'amount', po.amount, 'method', po.method)
                   order by po.paid_on)
              from public.owner_payouts po where po.property_id = pr.id and po.period = m), '[]'::jsonb),
          'arrears', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                                 order by is_primary desc, created_at limit 1),
                     'balance', b.balance) order by b.balance desc)
              from public.tenancies t
              join public.units u on u.id = t.unit_id
              join public.tenancy_balances b on b.tenancy_id = t.id
             where u.property_id = pr.id and b.balance > 0), '[]'::jsonb),
          'notices', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label,
                     'tenant', (select full_name from public.tenancy_tenants tt where tt.tenancy_id = t.id
                                 order by is_primary desc, created_at limit 1),
                     'form', n.form, 'title', n.title, 'served_on', n.served_on,
                     'effective_date', n.effective_date, 'amount', n.amount, 'status', n.status)
                   order by n.served_on)
              from public.notices n
              join public.tenancies t on t.id = n.tenancy_id
              join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and n.served_on between m and m_end and n.status <> 'void'), '[]'::jsonb),
          'new_tenancies', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'start_date', t.start_date, 'end_date', t.end_date, 'rent', t.rent,
                     'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at)
                                   from public.tenancy_tenants tt where tt.tenancy_id = t.id))
                   order by t.start_date)
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.start_date between m and m_end
               and not t.start_date_estimated), '[]'::jsonb),
          'ended_tenancies', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'move_out_date', coalesce(t.move_out_date, t.end_date),
                     'tenants', (select jsonb_agg(full_name order by is_primary desc, created_at)
                                   from public.tenancy_tenants tt where tt.tenancy_id = t.id))
                   order by coalesce(t.move_out_date, t.end_date))
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.status in ('notice', 'ended')
               and coalesce(t.move_out_date, t.end_date) between m and m_end), '[]'::jsonb),
          'upcoming_move_outs', coalesce((
            select jsonb_agg(jsonb_build_object('unit', u.label, 'move_out_date', t.move_out_date) order by t.move_out_date)
              from public.tenancies t join public.units u on u.id = t.unit_id
             where u.property_id = pr.id and t.status = 'notice' and t.move_out_date > m_end), '[]'::jsonb),
          'work_orders', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'unit', u.label, 'title', mr.title, 'category', mr.category, 'status', mr.status,
                     'reported_on', (mr.created_at at time zone 'America/Toronto')::date,
                     'completed_on', (mr.completed_at at time zone 'America/Toronto')::date,
                     'cost', case when mr.charge_to = 'owner' then mr.actual_cost end,
                     'charge_to', mr.charge_to)
                   order by mr.created_at)
              from public.maintenance_requests mr join public.units u on u.id = mr.unit_id
             where u.property_id = pr.id and mr.status <> 'cancelled'
               and ((mr.created_at at time zone 'America/Toronto')::date between m and m_end
                    or (mr.completed_at at time zone 'America/Toronto')::date between m and m_end
                    or (mr.status not in ('completed', 'cancelled') and (mr.created_at at time zone 'America/Toronto')::date <= m_end))),
            '[]'::jsonb),
          'vacant_units', coalesce((
            select jsonb_agg(u.label order by u.label) from public.units u
             where u.property_id = pr.id and u.status in ('vacant', 'turnover') and u.management_type = 'managed'), '[]'::jsonb)
        ) as prop
        from public.properties pr
        where pr.owner_id = o.id and not pr.archived
      ) x), '[]'::jsonb)
  ) into result
  from public.owners o where o.id = p_owner_id;

  return result;
end;
$$;
revoke execute on function public.owner_letter_data(uuid, date) from public, anon;
grant execute on function public.owner_letter_data(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Month-end letters: drafted on the 1st, reviewed by staff, then sent.
--    data is a snapshot of owner_letter_data at drafting (refreshable until sent).
-- ---------------------------------------------------------------------------
create table if not exists public.owner_letters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  status text not null default 'draft' check (status in ('draft', 'sent')),
  data jsonb not null,
  staff_note text,                              -- optional personal note shown at the top of the letter
  sent_at timestamptz,
  sent_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, period)
);
drop trigger if exists owner_letters_touch on public.owner_letters;
create trigger owner_letters_touch before update on public.owner_letters
  for each row execute function public.touch_updated_at();

-- Create (or refresh, while still a draft) the letters for a month. Returns how many.
create or replace function public.draft_owner_letters(p_period date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_period)::date;
  n integer := 0;
  o record;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Staff only';
  end if;
  for o in
    select distinct ow.id from public.owners ow
      join public.properties pr on pr.owner_id = ow.id and not pr.archived
  loop
    insert into public.owner_letters (owner_id, period, data)
    values (o.id, m, public.owner_letter_data(o.id, m))
    on conflict (owner_id, period) do update
      set data = excluded.data
      where public.owner_letters.status = 'draft';
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.draft_owner_letters(date) from public, anon;
grant execute on function public.draft_owner_letters(date) to authenticated, service_role;

alter table public.owner_letters enable row level security;
drop policy if exists "owner_letters: staff all" on public.owner_letters;
create policy "owner_letters: staff all" on public.owner_letters
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "owner_letters: owner reads sent" on public.owner_letters;
create policy "owner_letters: owner reads sent" on public.owner_letters
  for select using (status = 'sent' and public.is_owner_account(owner_id));

-- Landlords see their own properties' basics (no tenant details) in the portal.
create or replace view public.my_owned_properties
with (security_invoker = false) as
  select pr.id, pr.address, pr.city, pr.postal_code, pr.monthly_fee, pr.agreement_renewal,
         (select count(*) from public.units u where u.property_id = pr.id and u.management_type = 'managed') as units,
         (select count(*) from public.units u where u.property_id = pr.id and u.management_type = 'managed' and u.status = 'occupied') as occupied
    from public.properties pr
    join public.owners o on o.id = pr.owner_id
   where o.profile_id = auth.uid() and not pr.archived;
revoke all on public.my_owned_properties from anon;
grant select on public.my_owned_properties to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Known notices from the tracker.
-- ---------------------------------------------------------------------------
insert into public.notices (tenancy_id, form, served_on, amount, notes)
select t.id, 'N4', '2026-09-08', 2100, 'August 2026 rent. Imported from tracker.'
  from public.tenancies t where t.legacy_lease_id = '3882-Upper-202607'
   and not exists (select 1 from public.notices n where n.tenancy_id = t.id and n.form = 'N4' and n.served_on = '2026-09-08');
