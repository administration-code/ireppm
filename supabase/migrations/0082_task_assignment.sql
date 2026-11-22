-- 0082: assign tasks to a staff member (Rishi, Chuck, Rosie), and a "PM contract dispute" task type.
-- Run AFTER 0081. Safe to re-run.
alter table public.staff_tasks add column if not exists assigned_to uuid references public.profiles (id) on delete set null;
alter table public.staff_tasks add column if not exists assigned_by uuid references public.profiles (id) on delete set null;
alter table public.staff_tasks add column if not exists assigned_at timestamptz;
create index if not exists staff_tasks_assigned_idx on public.staff_tasks (assigned_to, status);
alter table public.staff_tasks drop constraint if exists staff_tasks_kind_check;
alter table public.staff_tasks add constraint staff_tasks_kind_check
  check (kind in ('needs_setup', 'lmr_topup', 'amendment', 'follow_up', 'draft_email', 'ai', 'dispute', 'other'));

-- Staff can see who the other staff are (to assign tasks).
create or replace function public.staff_members()
returns table (id uuid, full_name text, email text, role text)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.full_name, p.email, p.role from public.profiles p
   where p.role in ('staff', 'admin') and public.is_staff()
   order by p.role desc, p.full_name
$fn$;
revoke execute on function public.staff_members() from public, anon;
grant execute on function public.staff_members() to authenticated;
