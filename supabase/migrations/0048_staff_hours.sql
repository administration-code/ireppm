-- 0048: staff hours. Staff log the hours they work each day (with notes); an admin approves or
-- sends back each entry. Monthly totals are worked out on the Staff Hours page.
create table if not exists public.staff_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  work_date date not null default current_date,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_hours_staff_date_idx on public.staff_hours (staff_id, work_date);
create index if not exists staff_hours_date_idx on public.staff_hours (work_date);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff() and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Staff can't approve their own time, and an approved entry can't be changed except by an admin.
create or replace function public.staff_hours_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if public.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  if old.status = 'approved' then
    raise exception 'This entry is approved and locked. Ask an admin to change it.';
  end if;
  -- An edit by the staff member puts the entry back up for approval.
  new.staff_id := old.staff_id;
  new.status := 'submitted';
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;
drop trigger if exists staff_hours_guard on public.staff_hours;
create trigger staff_hours_guard before update on public.staff_hours
  for each row execute function public.staff_hours_guard();

alter table public.staff_hours enable row level security;

drop policy if exists "hours read" on public.staff_hours;
create policy "hours read" on public.staff_hours
  for select using (public.is_admin() or (public.is_staff() and staff_id = auth.uid()));

drop policy if exists "hours add own" on public.staff_hours;
create policy "hours add own" on public.staff_hours
  for insert with check (public.is_staff() and staff_id = auth.uid() and status = 'submitted');

drop policy if exists "hours edit" on public.staff_hours;
create policy "hours edit" on public.staff_hours
  for update using (public.is_admin() or (public.is_staff() and staff_id = auth.uid() and status <> 'approved'))
  with check (public.is_admin() or (public.is_staff() and staff_id = auth.uid()));

drop policy if exists "hours delete" on public.staff_hours;
create policy "hours delete" on public.staff_hours
  for delete using (public.is_admin() or (public.is_staff() and staff_id = auth.uid() and status <> 'approved'));
