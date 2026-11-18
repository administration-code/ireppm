-- 0068: bills IRep pays on a landlord's behalf at their request (e.g. Abell Pest Control).
-- Saving one adds a deduction to that landlord's statement for the month chosen, described as
-- "Paid on your behalf: <payee> ...". Deleting it removes the statement line.
-- The bank withdrawal itself is categorized "Contractor or repair" in Reconciliation.

create table if not exists public.landlord_expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  payee text not null check (length(trim(payee)) > 0),
  description text,
  invoice_ref text,
  bill_date date,
  amount numeric(10, 2) not null check (amount > 0),
  statement_period date not null check (extract(day from statement_period) = 1),
  statement_item_id uuid references public.statement_items (id) on delete set null,
  status text not null default 'to_pay' check (status in ('to_pay', 'paid')),
  paid_on date,
  method text check (method is null or method in ('etransfer', 'cheque', 'card', 'online_banking', 'other')),
  reference text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (status = 'to_pay' or paid_on is not null)
);
create index if not exists landlord_expenses_property_idx on public.landlord_expenses (property_id, statement_period desc);

alter table public.landlord_expenses enable row level security;
drop policy if exists "landlord_expenses: staff all" on public.landlord_expenses;
create policy "landlord_expenses: staff all" on public.landlord_expenses
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.landlord_expenses from anon;

create or replace function public.landlord_expenses_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
  item uuid;
begin
  if tg_op = 'DELETE' then
    if old.statement_item_id is not null then
      delete from public.statement_items where id = old.statement_item_id;
    end if;
    return old;
  end if;

  label := 'Paid on your behalf: ' || trim(new.payee)
    || coalesce(' – ' || nullif(trim(new.description), ''), '')
    || coalesce(' (invoice ' || nullif(trim(new.invoice_ref), '') || ')', '');

  if tg_op = 'UPDATE' then
    if new.property_id is distinct from old.property_id or new.amount is distinct from old.amount
       or new.statement_period is distinct from old.statement_period then
      raise exception 'The property, amount and statement month can''t be changed. Delete it and record it again.';
    end if;
    if label is distinct from (select description from public.statement_items where id = new.statement_item_id) then
      update public.statement_items set description = label where id = new.statement_item_id;
    end if;
    return new;
  end if;

  -- INSERT
  insert into public.statement_items (property_id, period, kind, description, amount)
  values (new.property_id, new.statement_period, 'expense', label, -new.amount)
  returning id into item;
  new.statement_item_id := item;
  return new;
end;
$$;
revoke execute on function public.landlord_expenses_rules() from public, anon, authenticated;

drop trigger if exists landlord_expenses_rules on public.landlord_expenses;
create trigger landlord_expenses_rules before insert or update on public.landlord_expenses
  for each row execute function public.landlord_expenses_rules();
drop trigger if exists landlord_expenses_rules_delete on public.landlord_expenses;
create trigger landlord_expenses_rules_delete after delete on public.landlord_expenses
  for each row execute function public.landlord_expenses_rules();
