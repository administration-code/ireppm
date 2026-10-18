-- 0042: showings can be booked for an exact 30-minute start time ("10:30 am") as well as a window.
create or replace function public.showing_window_start(p_date date, p_window text)
returns timestamptz
language sql
immutable
as $$
  select (p_date + case
            when p_window ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
              make_time((split_part(trim(p_window), ':', 1)::int % 12)
                        + case when p_window ~* 'pm' then 12 else 0 end,
                        substring(p_window from ':(\d{2})')::int, 0)
            when p_window ilike 'morning%' then time '09:00'
            when p_window ilike 'evening%' then time '17:00'
            else time '12:00' end) at time zone 'America/Toronto'
$$;
grant execute on function public.showing_window_start(date, text) to anon, authenticated, service_role;
