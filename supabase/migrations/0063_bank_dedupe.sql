-- 0063: bank lines from the two Scotiabank export formats count as the same line.
-- The Excel export writes "WITHDRAWAL Hayley Warren INTERAC E TRANSFER" and the CSV export writes
-- "WITHDRAWAL~~Hayley Warren~~~INTERAC E TRANSFER", so importing October's CSV after the Jan-Oct 16 Excel
-- file added Oct 1-16 a second time. This removes those repeats (keeping any match the repeat had),
-- makes the import ignore the ~ and extra spaces from now on, and re-runs the automatic matching.

-- 1. Pair each repeat from the November 6 imports with the line already there.
create temp table bank_repeats on commit drop as
with norm as (
  select t.id, t.account_id, t.posted_on, t.amount, t.status, i.imported_at,
         lower(regexp_replace(trim(regexp_replace(t.description, '~', ' ', 'g')), '\s+', ' ', 'g')) as nd
    from public.bank_transactions t join public.bank_imports i on i.id = t.import_id
   where t.posted_on between '2026-10-01' and '2026-10-16'
), newr as (
  select *, row_number() over (partition by account_id, posted_on, amount, nd order by id) as rn
    from norm where imported_at >= '2026-11-06'
), oldr as (
  select *, row_number() over (partition by account_id, posted_on, amount, nd order by id) as rn
    from norm where imported_at < '2026-11-06'
)
select n.id as repeat_id, o.id as keep_id
  from newr n join oldr o using (account_id, posted_on, amount, nd, rn);

-- 2. If the repeat got matched and the original has no match, move the match to the original.
update public.bank_transaction_links l set bank_transaction_id = r.keep_id
  from bank_repeats r
 where l.bank_transaction_id = r.repeat_id
   and not exists (select 1 from public.bank_transaction_links x where x.bank_transaction_id = r.keep_id);
update public.bank_transactions t set status = 'matched', category = null
 where t.id in (select keep_id from bank_repeats)
   and exists (select 1 from public.bank_transaction_links x where x.bank_transaction_id = t.id)
   and t.status <> 'matched';

-- 3. Remove the repeats (and any match they still hold).
delete from public.bank_transactions where id in (select repeat_id from bank_repeats);

-- 4. One fingerprint format for both exports (months already locked are left as they are).
create or replace function public.bank_fingerprint_text(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(regexp_replace(coalesce(p, ''), '~', ' ', 'g')), '\s+', ' ', 'g'))
$$;

update public.bank_transactions set fingerprint = 'tmp|' || id::text where not public.is_period_locked(posted_on);
update public.bank_transactions t set fingerprint = f.fp
  from (
    select id, posted_on::text || '|' || amount::text || '|' || public.bank_fingerprint_text(description) || '|' ||
           row_number() over (partition by account_id, posted_on, amount, public.bank_fingerprint_text(description) order by created_at, id) as fp
      from public.bank_transactions
  ) f
 where f.id = t.id and not public.is_period_locked(t.posted_on);

create or replace function public.import_bank_rows(p_account_id uuid, p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  imp uuid;
  r jsonb;
  added integer := 0;
  skipped integer := 0;
  seen jsonb := '{}'::jsonb;
  base text;
  nth integer;
  fp text;
  d date;
  amt numeric;
begin
  if not public.is_staff() and auth.uid() is not null then raise exception 'Staff only'; end if;
  insert into public.bank_imports (account_id, file_name, imported_by)
  values (p_account_id, p_file_name, auth.uid()) returning id into imp;

  for r in select * from jsonb_array_elements(p_rows) loop
    d := (r->>'posted_on')::date;
    amt := round((r->>'amount')::numeric, 2);
    if d is null or amt is null or amt = 0 then skipped := skipped + 1; continue; end if;
    base := d::text || '|' || amt::text || '|' || public.bank_fingerprint_text(r->>'description');
    nth := coalesce((seen->>base)::integer, 0) + 1;
    seen := seen || jsonb_build_object(base, nth);
    fp := base || '|' || nth;
    if public.is_period_locked(d) then skipped := skipped + 1; continue; end if;
    insert into public.bank_transactions (account_id, import_id, posted_on, description, amount, running_balance, fingerprint)
    values (p_account_id, imp, d, coalesce(r->>'description', ''), amt, nullif(r->>'running_balance', '')::numeric, fp)
    on conflict (account_id, fingerprint) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;

  update public.bank_imports
     set rows_added = added, rows_skipped = skipped,
         first_date = (select min(posted_on) from public.bank_transactions where import_id = imp),
         last_date = (select max(posted_on) from public.bank_transactions where import_id = imp)
   where id = imp;
  return jsonb_build_object('import_id', imp, 'added', added, 'skipped', skipped,
                            'matched', public.auto_match_bank_lines(p_account_id));
end;
$function$;

-- 5. Fix the import counts and re-run the automatic matching for both accounts.
update public.bank_imports i
   set rows_added = (select count(*) from public.bank_transactions t where t.import_id = i.id),
       first_date = (select min(posted_on) from public.bank_transactions t where t.import_id = i.id)
 where i.imported_at >= '2026-11-06';
select public.auto_match_bank_lines(id) from public.bank_accounts;
