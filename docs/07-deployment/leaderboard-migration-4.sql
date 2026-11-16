-- Checkervia leaderboard, migration 4 (D85): reports for abandoned games
-- and the 30 day suspension.
-- Run once in the Supabase SQL editor, after migrations 1, 2 and 3, and
-- before the version of the site that needs it goes live (see
-- deployment-guide.md). Never run it twice, and never edit migrations 1 to
-- 3. A second run stops at once (the table already exists).
--
-- Until it is run the site still works: reports are kept on the device,
-- report-abandon answers 503 (the browser sends the reports again later),
-- and every other function reads "no reports, not suspended".
--
-- Same security as before: Row Level Security on, no policies, no grants
-- for anon and authenticated; only the service role (the Netlify functions)
-- can read or write.

-- One row per abandoned game the AI reported: which game, at which level,
-- and whether it was abandoned before the player's first move.
create table public.player_reports (
  player_id uuid not null references public.players (id) on delete cascade,
  game_id uuid not null,
  level smallint not null check (level between 1 and 4),
  phase text not null check (phase in ('start', 'middle')),
  created_at timestamptz not null default now(),
  primary key (player_id, game_id)
);
alter table public.player_reports enable row level security;
revoke all on table public.player_reports from anon, authenticated;

-- The reports towards the next suspension, and the suspension's end.
alter table public.players
  add column reports_active smallint not null default 0 check (reports_active >= 0),
  add column suspended_until timestamptz;

-- The player's reports and suspension now (a past suspension reads null).
create or replace function public.player_conduct(p_player uuid)
returns table (reports integer, total_reports bigint, suspended_until timestamptz)
language sql stable
set search_path = public
as $$
  select p.reports_active::integer,
    (select count(*) from player_reports r where r.player_id = p.id),
    case when p.suspended_until > now() then p.suspended_until end
  from players p
  where p.id = p_player;
$$;

-- Records a report once per game, in one step. Not suspended: the count
-- goes up, and at p_limit the player is suspended for p_days and the count
-- starts again from zero. While suspended a report only adds to the total.
create or replace function public.add_report(p_player uuid, p_game uuid, p_level smallint, p_phase text, p_limit integer, p_days integer)
returns table (reports integer, total_reports bigint, suspended_until timestamptz)
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_until timestamptz;
begin
  insert into player_reports (player_id, game_id, level, phase)
  values (p_player, p_game, p_level, p_phase)
  on conflict (player_id, game_id) do nothing;
  if found then
    select p.reports_active, p.suspended_until into v_active, v_until
    from players p where p.id = p_player for update;
    if v_until is null or v_until <= now() then
      if v_active + 1 >= p_limit then
        update players set reports_active = 0, suspended_until = now() + make_interval(days => p_days) where id = p_player;
      else
        update players set reports_active = v_active + 1, suspended_until = null where id = p_player;
      end if;
    end if;
  end if;
  return query select * from player_conduct(p_player);
end;
$$;

revoke execute on function public.player_conduct(uuid) from public, anon, authenticated;
revoke execute on function public.add_report(uuid, uuid, smallint, text, integer, integer) from public, anon, authenticated;
grant execute on function public.player_conduct(uuid) to service_role;
grant execute on function public.add_report(uuid, uuid, smallint, text, integer, integer) to service_role;
