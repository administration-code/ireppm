-- 0099: staff can hand a task to Chuck (or another partner with a portal sign-in).
--   staff_tasks.partner_id: the partner doing it. partner_note / partner_done_at: what they said when done.
-- Run AFTER 0098. Safe to re-run.

alter table public.staff_tasks add column if not exists partner_id uuid references public.partners(id) on delete set null;
alter table public.staff_tasks add column if not exists partner_note text;
alter table public.staff_tasks add column if not exists partner_done_at timestamptz;
create index if not exists staff_tasks_partner_open on public.staff_tasks (partner_id) where status in ('open', 'waiting');
