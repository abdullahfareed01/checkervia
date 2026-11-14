-- Checkervia leaderboard, migration 1 (D56).
-- Run once in the Supabase SQL editor of a new project (see deployment-guide.md).
-- Safe to read top to bottom: tables, indexes, security, then functions.
--
-- Only the Netlify functions talk to this database, with the service role key.
-- Row Level Security is on for every table with no policies, and the anon and
-- authenticated roles have no grants, so the public API keys can read nothing.
--
-- Moderation: set hidden = true on a player (hides them everywhere, keeps the
-- username taken) or on a single win (removes it from the ranking).

-- Players: one row per claimed username. No email, no age, no raw IP.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null
    check (char_length(username) between 3 and 16 and username ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  -- Usernames are unique without case: this is lower(username).
  username_key text not null unique check (username_key = lower(username)),
  country text check (country ~ '^[A-Z]{2}$'),
  -- SHA 256 of the secret token the device keeps. The token is never stored.
  token_hash text not null unique,
  -- Keyed hashes (HMAC with LEADERBOARD_HASH_SALT), for rate limits only.
  device_hash text not null,
  ip_hash text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Wins: only wins the server replayed through the engine.
create table public.wins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  game_id uuid not null unique,
  level smallint not null check (level between 1 and 4),
  moves jsonb not null,
  moves_hash text not null,
  move_count integer not null check (move_count > 0),
  stats jsonb not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  -- The same game sent again under a new game id is a duplicate.
  unique (player_id, level, moves_hash)
);

-- Rank queries filter by level and time, then group by player.
create index wins_rank_idx on public.wins (level, created_at) include (player_id, move_count) where not hidden;
create index wins_player_idx on public.wins (player_id, level);

-- Game results: games played and losses, as reported by the browser
-- (a verified win also writes its row here, as a win).
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  game_id uuid not null,
  level smallint not null check (level between 1 and 4),
  result text not null check (result in ('win', 'loss')),
  created_at timestamptz not null default now(),
  unique (player_id, game_id)
);
create index game_results_player_idx on public.game_results (player_id, level, result);

-- Rate limits: hits per key per fixed window. Keys hold hashes only.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.players enable row level security;
alter table public.wins enable row level security;
alter table public.game_results enable row level security;
alter table public.rate_limits enable row level security;
revoke all on table public.players, public.wins, public.game_results, public.rate_limits from anon, authenticated;

-- The ranking for one level since a time (null: all time). Mirrors
-- src/leaderboard/ranking.ts: most wins, then fewest moves in the best win,
-- then who reached that number of wins first, then the id.
create or replace function public.leaderboard_ranked(p_level integer, p_since timestamptz)
returns table (rank bigint, player_id uuid, username text, country text, wins bigint, best_moves integer, reached_at timestamptz)
language sql stable
set search_path = public
as $$
  with counted as (
    select w.player_id, count(*) as wins, min(w.move_count) as best_moves, max(w.created_at) as reached_at
    from wins w
    join players p on p.id = w.player_id and not p.hidden
    where w.level = p_level and not w.hidden and (p_since is null or w.created_at >= p_since)
    group by w.player_id
  )
  select row_number() over (order by c.wins desc, c.best_moves asc, c.reached_at asc, c.player_id asc) as rank,
         c.player_id, p.username, p.country, c.wins, c.best_moves, c.reached_at
  from counted c
  join players p on p.id = c.player_id
  order by rank;
$$;

-- One player's counts for each level, Easy (1) to Strongest (4).
create or replace function public.player_level_stats(p_player uuid)
returns table (level integer, wins bigint, best_moves integer, losses bigint, games bigint)
language sql stable
set search_path = public
as $$
  select l.level,
    (select count(*) from wins w where w.player_id = p_player and w.level = l.level and not w.hidden),
    (select min(w.move_count) from wins w where w.player_id = p_player and w.level = l.level and not w.hidden),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level and g.result = 'loss'),
    (select count(*) from game_results g where g.player_id = p_player and g.level = l.level)
  from generate_series(1, 4) as l(level);
$$;

-- Counts one request for a key in its fixed window and says whether it may
-- go ahead. Refused requests count too. Old windows are cleaned up now and then.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile
set search_path = public
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select
    v_hits <= p_limit,
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

-- Only the service role may call the functions.
revoke execute on function public.leaderboard_ranked(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.player_level_stats(uuid) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.leaderboard_ranked(integer, timestamptz) to service_role;
grant execute on function public.player_level_stats(uuid) to service_role;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
