-- 0087: phone notifications from the IRep app (free web push), starting with Chuck.
--   * push_subscriptions: one row per phone or browser that turned notifications on. Saved and used by the
--     server only; people can see and remove their own.
-- Run AFTER 0086. Safe to re-run.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text
);
create index if not exists push_subscriptions_partner_idx on public.push_subscriptions (partner_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: own read" on public.push_subscriptions;
create policy "push_subscriptions: own read" on public.push_subscriptions for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "push_subscriptions: own delete" on public.push_subscriptions;
create policy "push_subscriptions: own delete" on public.push_subscriptions for delete using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon;
