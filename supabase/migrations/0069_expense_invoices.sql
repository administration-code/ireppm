-- 0069: keep the bill (PDF or photo) with each Additional Expense, and let the landlord
-- see their own expenses and open the bill from their owner portal.

alter table public.landlord_expenses add column if not exists invoice_path text;
alter table public.landlord_expenses add column if not exists invoice_name text;

-- Landlords see the expenses on their own properties, without staff notes.
create or replace function public.owner_expenses()
returns table (id uuid, address text, payee text, description text, invoice_ref text, bill_date date,
               amount numeric, statement_period date, status text, paid_on date, has_bill boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, p.address, e.payee, e.description, e.invoice_ref, e.bill_date, e.amount, e.statement_period,
         e.status, e.paid_on, e.invoice_path is not null
    from public.landlord_expenses e
    join public.properties p on p.id = e.property_id
   where public.is_owner_account(p.owner_id)
   order by e.statement_period desc, e.created_at desc;
$$;
revoke execute on function public.owner_expenses() from public, anon;
grant execute on function public.owner_expenses() to authenticated;

-- Private bucket. Files are stored as <expense id>/<file name>. Staff upload; anyone else only
-- gets a short-lived link through /api/expenses/file (staff, or the property's landlord).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landlord-expenses', 'landlord-expenses', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false;
drop policy if exists "landlord-expenses: staff all" on storage.objects;
create policy "landlord-expenses: staff all" on storage.objects
  for all using (bucket_id = 'landlord-expenses' and public.is_staff())
  with check (bucket_id = 'landlord-expenses' and public.is_staff());
