-- 0070: monthly expenses paid for a landlord (e.g. Oxio internet, $75 a month).
-- Each month from first_month to last_month (or until stopped) the daily job adds that month's
-- Additional Expense, which puts the "Paid on your behalf" deduction on the statement.
-- Staff then mark it paid and attach the bill as usual. Run AFTER 0068 and 0069.

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  payee text not null check (length(trim(payee)) > 0),
  description text,
  amount numeric(10, 2) not null check (amount > 0),
  first_month date not null check (extract(day from first_month) = 1),
  last_month date check (last_month is null or (extract(day from last_month) = 1 and last_month >= first_month)),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists recurring_expenses_property_idx on public.recurring_expenses (property_id);

alter table public.recurring_expenses enable row level security;
drop policy if exists "recurring_expenses: staff all" on public.recurring_expenses;
create policy "recurring_expenses: staff all" on public.recurring_expenses
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.recurring_expenses from anon;

alter table public.landlord_expenses add column if not exists recurring_id uuid
  references public.recurring_expenses (id) on delete set null;
create unique index if not exists landlord_expenses_recurring_month_idx
  on public.landlord_expenses (recurring_id, statement_period) where recurring_id is not null;

-- Adds each active monthly expense for the month of p_month (once; safe to run every day).
-- Skips months whose books are locked. Returns how many were added.
create or replace function public.ensure_recurring_expenses(p_month date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/Toronto')::date))::date;
  n integer := 0;
  r record;
begin
  if not (public.is_staff() or auth.uid() is null) then
    raise exception 'Staff only.';
  end if;
  if public.is_period_locked(m) then
    return 0;
  end if;
  for r in
    select * from public.recurring_expenses x
     where x.first_month <= m and (x.last_month is null or x.last_month >= m)
       and not exists (select 1 from public.landlord_expenses e where e.recurring_id = x.id and e.statement_period = m)
  loop
    insert into public.landlord_expenses (property_id, payee, description, amount, statement_period, recurring_id, note)
    values (r.property_id, r.payee, coalesce(nullif(trim(r.description), ''), 'monthly') || ', ' || to_char(m, 'FMMonth YYYY'),
            r.amount, m, r.id, 'Added automatically from a monthly expense.');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.ensure_recurring_expenses(date) from public, anon;
grant execute on function public.ensure_recurring_expenses(date) to authenticated, service_role;

-- Chirag's Oxio internet at 523 Caron Ave: $75 a month from December 2026
-- (November and earlier were entered by hand on the statements).
insert into public.recurring_expenses (property_id, payee, description, amount, first_month, note)
select '3fff935c-9a16-4850-a43d-42a6182ee2c9', 'Oxio', 'Internet', 75, '2026-12-01',
       'Flat $75 a month. Earlier months entered by hand on the October and November statements.'
 where not exists (select 1 from public.recurring_expenses
                    where property_id = '3fff935c-9a16-4850-a43d-42a6182ee2c9' and payee = 'Oxio');
