-- 0085: Chuck starts vacancies from the Agent Portal, and link-only listings.
--   * listings.visibility: 'public' shows on ireppm.ca's property search as before; 'link' doesn't, but anyone
--     with the link can open it and apply (for vacancies marketed on Facebook).
--   * listings.created_by_partner: the partner who started it from the Agent Portal.
-- Partners still never write listings directly: the Agent Portal goes through the server (/api/agent/vacancies),
-- which only allows units at properties where the partner does showings.
-- Run AFTER 0084. Safe to re-run.

alter table public.listings add column if not exists visibility text not null default 'public';
alter table public.listings drop constraint if exists listings_visibility_check;
alter table public.listings add constraint listings_visibility_check check (visibility in ('public', 'link'));
alter table public.listings add column if not exists created_by_partner uuid references public.partners (id) on delete set null;
