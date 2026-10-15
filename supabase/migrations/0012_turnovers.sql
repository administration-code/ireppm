-- IRep Property Management: unit turnovers and inspections (back office, step 6).
-- A turnover tracks a unit from notice to move-out to make-ready to listed to leased,
-- with an Ontario-aware checklist. Run AFTER 0011. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Turnovers: one open turnover per unit.
-- ---------------------------------------------------------------------------
create table if not exists public.turnovers (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  ended_tenancy_id uuid references public.tenancies (id) on delete set null,
  new_tenancy_id uuid references public.tenancies (id) on delete set null,
  status text not null default 'notice'
    check (status in ('notice', 'make_ready', 'ready', 'listed', 'leased', 'cancelled')),
  move_out_date date,
  target_ready_date date,
  ready_on date,
  leased_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists turnovers_one_open_per_unit
  on public.turnovers (unit_id) where status not in ('leased', 'cancelled');
create index if not exists turnovers_status_idx on public.turnovers (status);
drop trigger if exists turnovers_touch on public.turnovers;
create trigger turnovers_touch before update on public.turnovers
  for each row execute function public.touch_updated_at();

create table if not exists public.turnover_tasks (
  id uuid primary key default gen_random_uuid(),
  turnover_id uuid not null references public.turnovers (id) on delete cascade,
  stage text not null check (stage in ('notice', 'move_out', 'make_ready', 'leasing')),
  title text not null,
  help text,
  sort_order integer not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  not_needed boolean not null default false,
  due_date date,
  assigned_to text,
  maintenance_request_id uuid references public.maintenance_requests (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists turnover_tasks_turnover_idx on public.turnover_tasks (turnover_id);
drop trigger if exists turnover_tasks_touch on public.turnover_tasks;
create trigger turnover_tasks_touch before update on public.turnover_tasks
  for each row execute function public.touch_updated_at();

create or replace function public.turnover_task_done_at()
returns trigger language plpgsql as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := coalesce(new.done_at, now()); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end;
$$;
drop trigger if exists turnover_tasks_done_at on public.turnover_tasks;
create trigger turnover_tasks_done_at before insert or update of done on public.turnover_tasks
  for each row execute function public.turnover_task_done_at();

-- The standard checklist. p_from_stage skips earlier stages (e.g. a unit that's already empty).
create or replace function public.add_turnover_checklist(p_turnover_id uuid, p_from_stage text default 'notice')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  stages text[] := array['notice', 'move_out', 'make_ready', 'leasing'];
  start_at integer := coalesce(array_position(stages, p_from_stage), 1);
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only'; end if;
  if exists (select 1 from public.turnover_tasks where turnover_id = p_turnover_id) then return 0; end if;
  insert into public.turnover_tasks (turnover_id, stage, sort_order, title, help)
  select p_turnover_id, v.stage, v.ord, v.title, v.help
  from (values
    ('notice', 10, 'Notice to end is in writing',
     'An N9 (tenant) or N11 (agreement) signed and on file, or the landlord''s N-form served. Log it under Notices.'),
    ('notice', 20, 'Tell the landlord the unit is coming vacant', null),
    ('notice', 30, 'Agree the move-out date and time',
     'Ask for a forwarding address for the move-out letter and any refund.'),
    ('notice', 40, 'Start advertising and showings',
     'After notice to end, showings are allowed 8 a.m.–8 p.m.; make a reasonable effort to tell the tenant first (RTA s. 26(3)).'),
    ('move_out', 10, 'Move-out inspection with photos',
     'Walk through room by room with the tenant if possible. Record it under Inspections.'),
    ('move_out', 20, 'Collect all keys, fobs and remotes',
     'Refund any key deposit when keys come back.'),
    ('move_out', 30, 'Last month''s rent and interest',
     'Apply the last month''s rent deposit to the final month, and make sure interest owing on it has been paid (RTA s. 106).'),
    ('move_out', 40, 'Settle the final rent balance',
     'Record any arrears owing. Former-tenant claims go to the LTB (form L10) or Small Claims Court.'),
    ('move_out', 50, 'Utilities transferred out of the tenant''s name', null),
    ('make_ready', 10, 'Cleaning', null),
    ('make_ready', 20, 'Repairs', 'Create a maintenance request for each job so it shows on the landlord''s statement.'),
    ('make_ready', 30, 'Painting / touch-ups', null),
    ('make_ready', 40, 'Re-key or change locks', null),
    ('make_ready', 50, 'Smoke and CO alarms tested', null),
    ('make_ready', 60, 'Listing photos taken', null),
    ('leasing', 10, 'Listing published on the website', null),
    ('leasing', 20, 'Showings and applications reviewed', null),
    ('leasing', 30, 'Lease signed (Ontario Standard Lease)', null),
    ('leasing', 40, 'First month and last month''s rent received', null),
    ('leasing', 50, 'Move-in inspection with photos and keys handed over', null)
  ) v(stage, ord, title, help)
  where array_position(stages, v.stage) >= start_at;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.add_turnover_checklist(uuid, text) from public, anon;
grant execute on function public.add_turnover_checklist(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Automation from tenancies.
--    Notice given (or tenancy ended)  -> open a turnover with the checklist.
--    A new upcoming/active tenancy on the unit -> close the turnover as leased.
-- ---------------------------------------------------------------------------
create or replace function public.tenancy_turnover_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_id uuid;
begin
  if new.status in ('notice', 'ended')
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.move_out_date is distinct from new.move_out_date) then
    select id into t_id from public.turnovers
     where unit_id = new.unit_id and status not in ('leased', 'cancelled') limit 1;
    if t_id is null then
      insert into public.turnovers (unit_id, ended_tenancy_id, status, move_out_date)
      values (new.unit_id, new.id,
              case when new.status = 'ended' then 'make_ready' else 'notice' end,
              coalesce(new.move_out_date, new.end_date))
      returning id into t_id;
      perform public.add_turnover_checklist(t_id, case when new.status = 'ended' then 'move_out' else 'notice' end);
    else
      update public.turnovers
         set move_out_date = coalesce(new.move_out_date, move_out_date),
             ended_tenancy_id = coalesce(ended_tenancy_id, new.id),
             status = case when new.status = 'ended' and status = 'notice' then 'make_ready' else status end
       where id = t_id;
    end if;
  end if;

  if new.status in ('upcoming', 'active')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.turnovers
       set status = 'leased', new_tenancy_id = new.id, leased_on = coalesce(leased_on, current_date)
     where unit_id = new.unit_id and status not in ('leased', 'cancelled')
       and (ended_tenancy_id is null or ended_tenancy_id <> new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.tenancy_turnover_sync() from public, anon, authenticated;

drop trigger if exists tenancies_turnover_sync on public.tenancies;
create trigger tenancies_turnover_sync after insert or update of status, move_out_date on public.tenancies
  for each row execute function public.tenancy_turnover_sync();

-- A turnover marked ready or listed puts the unit back to "vacant" (if nobody lives there).
create or replace function public.turnover_unit_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ready' and new.ready_on is null then new.ready_on := current_date; end if;
  if new.status in ('ready', 'listed') then
    update public.units set status = 'vacant'
     where id = new.unit_id and status in ('turnover', 'offline')
       and not exists (select 1 from public.tenancies t where t.unit_id = new.unit_id and t.status in ('active', 'notice'));
  end if;
  return new;
end;
$$;
revoke execute on function public.turnover_unit_status() from public, anon, authenticated;
drop trigger if exists turnovers_unit_status on public.turnovers;
create trigger turnovers_unit_status before insert or update of status on public.turnovers
  for each row execute function public.turnover_unit_status();

-- ---------------------------------------------------------------------------
-- 3. Inspections (move-in, move-out, periodic) with room-by-room notes.
--    Photos go in the private 'inspection-photos' bucket (staff only).
-- ---------------------------------------------------------------------------
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  tenancy_id uuid references public.tenancies (id) on delete set null,
  turnover_id uuid references public.turnovers (id) on delete set null,
  kind text not null check (kind in ('move_in', 'move_out', 'periodic')),
  inspected_on date not null default current_date,
  inspected_by text,
  tenant_present boolean,
  overall_condition text check (overall_condition in ('excellent', 'good', 'fair', 'poor')),
  rooms jsonb not null default '[]'::jsonb,     -- [{ room, condition, notes, photos: [{path, name}] }]
  keys_returned integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspections_unit_idx on public.inspections (unit_id);
drop trigger if exists inspections_touch on public.inspections;
create trigger inspections_touch before update on public.inspections
  for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 52428800,
        array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false;

drop policy if exists "inspection-photos: staff all" on storage.objects;
create policy "inspection-photos: staff all" on storage.objects
  for all using (bucket_id = 'inspection-photos' and public.is_staff())
  with check (bucket_id = 'inspection-photos' and public.is_staff());

-- ---------------------------------------------------------------------------
-- 4. Access: staff only.
-- ---------------------------------------------------------------------------
alter table public.turnovers enable row level security;
alter table public.turnover_tasks enable row level security;
alter table public.inspections enable row level security;

drop policy if exists "turnovers: staff all" on public.turnovers;
create policy "turnovers: staff all" on public.turnovers
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "turnover_tasks: staff all" on public.turnover_tasks;
create policy "turnover_tasks: staff all" on public.turnover_tasks
  for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "inspections: staff all" on public.inspections;
create policy "inspections: staff all" on public.inspections
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5. Start turnovers for today's situation:
--    tenancies on notice, and managed units that are already empty.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  t_id uuid;
begin
  for r in
    select t.id as tenancy_id, t.unit_id, t.move_out_date
      from public.tenancies t
     where t.status = 'notice'
       and not exists (select 1 from public.turnovers x where x.unit_id = t.unit_id and x.status not in ('leased', 'cancelled'))
  loop
    insert into public.turnovers (unit_id, ended_tenancy_id, status, move_out_date)
    values (r.unit_id, r.tenancy_id, 'notice', r.move_out_date) returning id into t_id;
    perform public.add_turnover_checklist(t_id, 'notice');
  end loop;

  for r in
    select u.id as unit_id, u.listing_id, u.notes
      from public.units u
     where u.status in ('vacant', 'turnover')
       and not exists (select 1 from public.tenancies t where t.unit_id = u.id and t.status in ('active', 'notice', 'upcoming'))
       and not exists (select 1 from public.turnovers x where x.unit_id = u.id and x.status not in ('leased', 'cancelled'))
  loop
    insert into public.turnovers (unit_id, status, notes)
    values (r.unit_id, 'make_ready', 'Already vacant when turnovers were set up (Oct 2026).') returning id into t_id;
    perform public.add_turnover_checklist(t_id, 'make_ready');
  end loop;
end $$;
