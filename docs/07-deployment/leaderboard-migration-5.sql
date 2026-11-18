-- Checkervia leaderboard, migration 5 (D89): draws.
-- A game against the AI can now end in a draw (the same position a third
-- time, or 40 moves by each side without a capture or a new King). Draws
-- are reported like wins and losses, for the profile's counts and the AI's
-- record. A draw is never a win, so the leaderboard itself does not change.
-- Run once in the Supabase SQL editor, after migrations 1 to 4, and before
-- the version of the site that needs it goes live (see deployment-guide.md).
-- Never run it twice, and never edit migrations 1 to 4. A second run stops
-- at once (the constraint already has the new name).
--
-- Until it is run the site still works: a draw report is refused (the
-- browser ignores a failed report), and every count reads 0 draws.
--
-- Same security as before: Row Level Security on, no policies, no grants
-- for anon and authenticated; only the service role (the Netlify functions)
-- can read or write.

-- Keep the constraint and both function signatures together if a statement fails.
begin;

-- A result may now be a draw too (a draw is never a resignation: the
-- check from migration 3 already allows only a loss to be one).
alter table public.game_results drop constraint game_results_result_check;
alter table public.game_results
  add constraint game_results_result_with_draws check (result in ('win', 'loss', 'draw'));

-- The AI's record now also counts the draws. Its result type changes, so
-- the function is dropped and made again (the same counts as migration 3).
drop function public.ai_record();
create function public.ai_record()
returns table (level smallint, games bigint, ai_wins bigint, ai_losses bigint, resigned bigint, draws bigint)
language sql stable
set search_path = public
as $$
  select g.level,
    count(*),
    count(*) filter (where g.result = 'loss'),
    count(*) filter (where g.result = 'win'),
    count(*) filter (where g.resigned),
    count(*) filter (where g.result = 'draw')
  from game_results g
  join players p on p.id = g.player_id
  where not p.hidden
  group by g.level
  order by g.level;
$$;

-- One player's counts for each level now also say how many games were
-- drawn. Its result type changes, so the function is dropped and made again
-- (the same counts as migration 3).
drop function public.player_level_stats(uuid);
create function public.player_level_stats(p_player uuid)
returns table (level integer, wins bigint, best_moves integer, losses bigint, games bigint, resigned bigint, draws bigint)
language sql stable
set search_path = public
as $$
  select l.level,
    (select count(*) from wins w where w.player_id = p_player and w.level = l.level and not w.hidden),
    (select min(w.move_count) from wins w where w.player_id = p_player and w.level = l.level and not w.hidden),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level and g.result = 'loss'),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level and g.resigned),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level and g.result = 'draw')
  from generate_series(1, 4) as l(level);
$$;

revoke execute on function public.ai_record() from public, anon, authenticated;
revoke execute on function public.player_level_stats(uuid) from public, anon, authenticated;
grant execute on function public.ai_record() to service_role;
grant execute on function public.player_level_stats(uuid) to service_role;

commit;
