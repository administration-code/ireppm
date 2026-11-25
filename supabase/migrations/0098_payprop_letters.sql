-- 0098: PayProp welcome letters per tenant. A tenancy can have several (one per tenant or sub-unit,
-- e.g. 1746 Buckingham Upper: Kaylee = Unit 1A, Deekshath + Keerthana = Unit 1B).
--   for_all = true: the letter is for everyone on the tenancy. Otherwise tenant_ids lists the
--   tenancy_tenants it's for (empty = not assigned yet: staff choose before it can be emailed).
-- Existing letters are copied in. Letter files that were uploaded but later lost their link (a second
-- upload on the same tenancy replaced the first) come back as "not assigned yet".
-- tenancies.payprop_letter_* stay, pointing at the newest letter, for older screens.
-- Run AFTER 0097. Safe to re-run.

create table if not exists public.payprop_letters (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  path text not null unique,
  file_name text,
  label text,
  for_all boolean not null default true,
  tenant_ids uuid[] not null default '{}',
  sent_at timestamptz,
  sent_to text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists payprop_letters_tenancy on public.payprop_letters (tenancy_id);
alter table public.payprop_letters enable row level security;
drop policy if exists "payprop_letters: staff all" on public.payprop_letters;
create policy "payprop_letters: staff all" on public.payprop_letters for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.payprop_letters from anon;

-- Letters already linked to a tenancy.
insert into public.payprop_letters (tenancy_id, path, file_name, sent_at, created_at)
select t.id, t.payprop_letter_path, t.payprop_letter_name, t.payprop_letter_sent_at, coalesce(o.created_at, now())
from public.tenancies t
left join storage.objects o on o.bucket_id = 'tenancy-documents' and o.name = t.payprop_letter_path
where t.payprop_letter_path is not null
on conflict (path) do nothing;

-- Letter files in a tenancy's folder that nothing points to any more.
insert into public.payprop_letters (tenancy_id, path, for_all, created_at)
select t.id, o.name, false, o.created_at
from storage.objects o
join public.tenancies t on t.id::text = split_part(o.name, '/', 1)
where o.bucket_id = 'tenancy-documents' and split_part(o.name, '/', 2) like 'payprop-welcome-letter-%'
on conflict (path) do nothing;

-- Where a tenancy now has more than one letter, a letter named after a tenant (PayProp names them
-- "WelcomeLetter-FirstLast-…") is for that tenant only.
with multi as (
  select tenancy_id from public.payprop_letters group by tenancy_id having count(*) > 1
), named as (
  select l.id, array_agg(tt.id) ids
  from public.payprop_letters l
  join multi m on m.tenancy_id = l.tenancy_id
  join public.tenancy_tenants tt on tt.tenancy_id = l.tenancy_id
  where l.file_name is not null
    and position(
      lower(regexp_replace(split_part(tt.full_name, ' ', 1) || reverse(split_part(reverse(tt.full_name), ' ', 1)), '[^a-zA-Z]', '', 'g'))
      in lower(regexp_replace(l.file_name, '[^a-zA-Z]', '', 'g'))
    ) > 0
  group by l.id
)
update public.payprop_letters l set for_all = false, tenant_ids = n.ids
from named n where n.id = l.id and l.for_all and cardinality(l.tenant_ids) = 0;
