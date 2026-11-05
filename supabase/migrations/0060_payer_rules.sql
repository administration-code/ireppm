-- IRep Property Management: rules for e-Transfer senders who pay for someone else.
--   payer_rules: by the sender's name as it appears on the e-Transfer, either
--     * 'tenancy': always apply their payments to this tenancy (e.g. Arinze pays Akash's rent), or
--     * 'ignore':  don't count their payments toward any of our tenancies (e.g. Akash pays Arinze's
--                  rent at a property we don't manage); the payment is kept as "not rent" with the
--                  staff note, so the deposit still shows in the books.
--   Rules apply to new payments as they come in, before name matching. Staff only; the note is
--   never shown to landlords or tenants.
-- Run AFTER 0059. Safe to re-run.

create table if not exists public.payer_rules (
  id uuid primary key default gen_random_uuid(),
  payer_name text not null,
  action text not null check (action in ('tenancy', 'ignore')),
  tenancy_id uuid references public.tenancies (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  check (action = 'ignore' or tenancy_id is not null)
);
alter table public.payer_rules enable row level security;
drop policy if exists "payer_rules: staff all" on public.payer_rules;
create policy "payer_rules: staff all" on public.payer_rules
  for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.payer_rules from anon;

create or replace function public.payments_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  pr record;
  auto_period boolean := false;
  i integer := 0;
begin
  if tg_op = 'INSERT' and new.tenancy_id is null and new.status = 'unmatched' and new.payer_name is not null then
    -- Sender rules first: someone who pays for someone else.
    select * into pr from public.payer_rules r
     where public.payer_key(r.payer_name) = public.payer_key(new.payer_name)
     order by r.created_at desc limit 1;
    if found and pr.action = 'ignore' then
      new.status := 'ignored';
      new.notes := concat_ws(' ', nullif(new.notes, ''), coalesce(pr.note, 'Sender rule: not rent for a property we manage.'));
    elsif found and pr.action = 'tenancy' then
      new.tenancy_id := pr.tenancy_id;
    else
      select * into m from public.match_payer(new.payer_name);
      new.tenancy_id := m.match_id;
      new.suggested_tenancy_id := coalesce(new.suggested_tenancy_id, m.suggest_id);
    end if;
  end if;

  -- The rent month: payments from the 25th on count toward next month (paying early).
  if new.period is null and new.kind = 'rent' then
    auto_period := true;
    new.period := case when extract(day from new.received_on) >= 25
                       then (date_trunc('month', new.received_on) + interval '1 month')::date
                       else date_trunc('month', new.received_on)::date end;
  end if;

  -- If that month is already paid in full, it's rent for the next month.
  if auto_period and new.tenancy_id is not null and new.method not in ('last_month_applied', 'paid_to_owner') then
    while i < 3 and public.rent_month_paid(new.tenancy_id, new.period, new.id) loop
      new.period := (new.period + interval '1 month')::date;
      i := i + 1;
    end loop;
  end if;

  if new.status in ('split', 'ignored') then
    null;
  elsif new.tenancy_id is not null then
    new.status := 'matched';
  else
    new.status := 'unmatched';
  end if;
  return new;
end;
$$;
revoke execute on function public.payments_rules() from public, anon, authenticated;

-- Akash Sunilkumar pays Arinze's rent (220 Bridge, not managed by IRep); Arinze pays Akash's.
insert into public.payer_rules (payer_name, action, note)
select 'AKASH SUNILKUMAR', 'ignore', 'Akash pays Arinze''s rent at 220 Bridge (not an IRep property). Not rent for Akash.'
 where not exists (select 1 from public.payer_rules where public.payer_key(payer_name) = public.payer_key('AKASH SUNILKUMAR'));
insert into public.payer_rules (payer_name, action, tenancy_id, note)
select 'ARINZE IFEANYIDUMEBI ACHU', 'tenancy', '6477f142-fa42-45e6-b0c3-29024b083c30', 'Arinze pays Akash''s rent (523 Caron, Room 4).'
 where not exists (select 1 from public.payer_rules where public.payer_key(payer_name) = public.payer_key('ARINZE IFEANYIDUMEBI ACHU'));
