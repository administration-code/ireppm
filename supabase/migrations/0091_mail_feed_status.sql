-- 0091: which mailbox the e-Transfer reader is using, shown in Settings.
--   Each copy of scripts/interac-feed.gs reports in every 5 minutes with its mailbox and role:
--   'primary' (administration@ireppm.ca, where payment@ireppm.ca's Interac notices now go) or
--   'legacy' (ireppm@ireprealty.com, read through Dec 31, 2026 only to flag and remind old-address senders).
--   A test e-Transfer with "IREP TEST" in its message is logged here instead of being recorded as rent.
-- Run AFTER 0090. Safe to re-run.

create table if not exists public.mail_feed_status (
  mailbox text primary key,
  feed text not null default 'interac',
  role text not null default 'primary' check (role in ('primary', 'legacy')),
  version text,
  last_seen_at timestamptz,
  last_item_at timestamptz,
  items_total integer not null default 0,
  last_test_at timestamptz,
  last_test_amount numeric(10, 2),
  last_test_from text,
  updated_at timestamptz not null default now()
);
alter table public.mail_feed_status enable row level security;
drop policy if exists "mail_feed_status: staff read" on public.mail_feed_status;
create policy "mail_feed_status: staff read" on public.mail_feed_status for select using (public.is_staff());
revoke all on public.mail_feed_status from anon;
