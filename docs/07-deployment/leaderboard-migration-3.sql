-- Checkervia leaderboard, migration 3 (D75): the AI's record.
-- Run once in the Supabase SQL editor, after leaderboard-migration.sql and
-- leaderboard-migration-2.sql, and before the version of the site that
-- needs it goes live (see deployment-guide.md). Never run it twice, and
-- never edit migrations 1 or 2. A second run stops at once (the column
-- already exists).
--
-- Same security as before: Row Level Security on, no policies, no grants
-- for anon and authenticated; only the service role (the Netlify functions)
-- can read or write.

-- Whether a lost game was a resignation. Only a loss can be one.
alter table public.game_results
  add column resigned boolean not null default false,
  add constraint game_results_resigned_is_loss check (not resigned or result = 'loss');

-- The AI's record over every player's reported games (hidden players left
-- out), one row per level that has games: games, the AI's wins (the
-- players' losses), its losses (the players' wins) and the players'
-- resignations. Totals only: no names.
create or replace function public.ai_record()
returns table (level smallint, games bigint, ai_wins bigint, ai_losses bigint, resigned bigint)
language sql stable
set search_path = public
as $$
  select g.level,
    count(*),
    count(*) filter (where g.result = 'loss'),
    count(*) filter (where g.result = 'win'),
    count(*) filter (where g.resigned)
  from game_results g
  join players p on p.id = g.player_id
  where not p.hidden
  group by g.level
  order by g.level;
$$;

revoke execute on function public.ai_record() from public, anon, authenticated;
grant execute on function public.ai_record() to service_role;
