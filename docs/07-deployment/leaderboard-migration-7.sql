begin;

-- Checkervia, migration 7 (D100 to D102): the admin dashboard's database.
-- Run once in the Supabase SQL editor, after migrations 1 to 4, and before
-- the version of the site with /admin goes live (see deployment-guide.md and
-- admin-runbook.md). It is tested after the deployed draws migration 5 and
-- AI cooldown migration 6. Optional online room tables are detected by
-- their schema, independently of migration numbers. If rooms arrive later,
-- run `select admin_link_rooms();` once afterwards.
-- Never run this twice, and never edit the earlier migrations. A second run
-- stops at once (the first new column already exists).
--
-- Same security as before: Row Level Security on every table with no
-- policies, and no rights at all for anon and authenticated. Only the
-- service role (the Netlify functions) can read or write, and the admin
-- functions check the admin's sign in, second factor, allow list and rate
-- limit before they call anything here. The audit log is append only, even
-- for the service role.
--
-- Sizes: the admin's lists use keyset paging (no offset, no exact counts) on
-- indexes made for them, search uses trigram indexes, and the charts read
-- small summary tables kept up to date by triggers, so no request has to
-- read every row of a big table.

-- ---------------------------------------------------------------------------
-- 1. Players: last activity and who suspended them, and why.
-- ---------------------------------------------------------------------------

-- suspended_until is from migration 4. A permanent ban is a suspension until
-- 9999-12-31 with the kind 'permanent' (a real date, so every client can
-- read it). suspension_revised_at changes whenever a person changes the
-- suspension (sets, shortens, lifts), so a device that keeps its own copy
-- knows to take the shorter one (D102).
alter table public.players
  add column last_seen_at timestamptz,
  add column suspension_kind text check (suspension_kind in ('reports', 'admin', 'permanent')),
  add column suspension_reason text check (char_length(suspension_reason) <= 500),
  add column suspended_by uuid,
  add column suspended_at timestamptz,
  add column suspension_revised_at timestamptz;

-- Until now only the AI's reports suspended anyone, always for 30 days.
update public.players p set
  suspension_kind = case when p.suspended_until is not null then 'reports' end,
  suspended_at = case when p.suspended_until is not null then p.suspended_until - interval '30 days' end,
  last_seen_at = greatest(
    (select max(g.created_at) from public.game_results g where g.player_id = p.id),
    (select max(r.created_at) from public.player_reports r where r.player_id = p.id),
    p.username_changed_at);

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. The admin: the allow list and the audit log.
-- ---------------------------------------------------------------------------

-- The people who may use /admin: a Supabase Auth user, by id and email. The
-- functions also check ADMIN_EMAIL, so both must agree. enroll_until opens a
-- short window to set up a new authenticator (first sign in, or after a
-- lost phone); the dashboard closes it once the new one works.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  enroll_until timestamptz,
  created_at timestamptz not null default now()
);

-- Every admin action, sign in and look at a player's details. Append only:
-- no update, no delete, no truncate, for anyone (the trigger below, and the
-- service role has no right to). target_player has no foreign key, so a row
-- stays after its player is deleted; target_label keeps the username then.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null check (action ~ '^[a-z]+(\.[a-z]+)*$' and char_length(action) <= 40),
  outcome text not null check (outcome in ('ok', 'refused', 'failed')),
  reason text check (char_length(reason) <= 500),
  target_player uuid,
  target_label text check (char_length(target_label) <= 120),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000),
  ip_hash text check (char_length(ip_hash) <= 128),
  search text generated always as (lower(action || ' ' || coalesce(target_label, '') || ' ' || coalesce(reason, ''))) stored
);
create index admin_audit_player_idx on public.admin_audit (target_player, id desc) where target_player is not null;
create index admin_audit_action_idx on public.admin_audit (action, id desc);

create function public.admin_audit_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'the admin audit log is append only' using errcode = '42501';
end;
$$;
create trigger admin_audit_no_change before update or delete on public.admin_audit
  for each row execute function public.admin_audit_append_only();
create trigger admin_audit_no_truncate before truncate on public.admin_audit
  for each statement execute function public.admin_audit_append_only();

-- ---------------------------------------------------------------------------
-- 3. Moderation: report statuses and banned devices.
-- ---------------------------------------------------------------------------

-- The AI's reports for abandoned games (migration 4) get a status for the
-- reports queue. Players' reports from online rooms (migration 6) get the
-- same columns in admin_link_rooms() below.
alter table public.player_reports
  add column status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  add column reviewed_by uuid,
  add column reviewed_at timestamptz,
  add column review_note text check (char_length(review_note) <= 500);
create index player_reports_status_idx on public.player_reports (status, created_at desc);
create index player_reports_created_idx on public.player_reports (created_at);

-- A banned device: the keyed hash of a device id (as players.device_hash),
-- never the id itself. A banned device cannot make a new profile.
create table public.banned_devices (
  device_hash text primary key check (char_length(device_hash) between 16 and 128),
  player_id uuid references public.players (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  banned_by uuid not null,
  created_at timestamptz not null default now()
);
create index banned_devices_player_idx on public.banned_devices (player_id);

-- ---------------------------------------------------------------------------
-- 4. Summary tables for the lists and the charts, kept by triggers.
-- ---------------------------------------------------------------------------

-- One row per player: the counts the players table shows and sorts by.
-- wins are verified wins that are not hidden (as on the profile); games,
-- losses, draws and resigned come from the reported results; abandoned is
-- the AI's reports; room_reports the players' reports from online rooms.
create table public.player_stats (
  player_id uuid primary key references public.players (id) on delete cascade,
  wins integer not null default 0,
  wins_1 integer not null default 0,
  wins_2 integer not null default 0,
  wins_3 integer not null default 0,
  wins_4 integer not null default 0,
  games integer not null default 0,
  games_1 integer not null default 0,
  games_2 integer not null default 0,
  games_3 integer not null default 0,
  games_4 integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  resigned integer not null default 0,
  abandoned integer not null default 0,
  room_reports integer not null default 0,
  reports integer generated always as (abandoned + room_reports) stored
);

-- One row per UTC day and level (0: not about a level). Counts happen once:
-- deleting a player later does not rewrite the past, it adds a deletion.
create table public.daily_stats (
  day date not null,
  level smallint not null check (level between 0 and 4),
  registrations integer not null default 0,
  deletions integer not null default 0,
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  resigned integer not null default 0,
  abandoned integer not null default 0,
  online_games integer not null default 0,
  primary key (day, level)
);

-- One row per UTC day and flag ('' for no flag): new profiles, and games
-- played by players showing that flag at the time.
create table public.daily_country (
  day date not null,
  country text not null check (country = '' or country ~ '^[A-Z]{2}$'),
  registrations integer not null default 0,
  games integer not null default 0,
  primary key (day, country)
);

-- Who played on which day, for active players per day and week. Kept for
-- about 400 days, then deleted (count_visit cleans up now and then).
create table public.daily_active (
  day date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (day, player_id)
);
create index daily_active_player_idx on public.daily_active (player_id);

-- Adds to one day's counts.
create function public.daily_bump(
  p_day date, p_level smallint,
  d_registrations integer default 0, d_deletions integer default 0, d_games integer default 0,
  d_wins integer default 0, d_losses integer default 0, d_draws integer default 0,
  d_resigned integer default 0, d_abandoned integer default 0, d_online_games integer default 0)
returns void
language sql
set search_path = public
as $$
  insert into daily_stats as d (day, level, registrations, deletions, games, wins, losses, draws, resigned, abandoned, online_games)
  values (p_day, p_level, d_registrations, d_deletions, d_games, d_wins, d_losses, d_draws, d_resigned, d_abandoned, d_online_games)
  on conflict (day, level) do update set
    registrations = d.registrations + excluded.registrations,
    deletions = d.deletions + excluded.deletions,
    games = d.games + excluded.games,
    wins = d.wins + excluded.wins,
    losses = d.losses + excluded.losses,
    draws = d.draws + excluded.draws,
    resigned = d.resigned + excluded.resigned,
    abandoned = d.abandoned + excluded.abandoned,
    online_games = d.online_games + excluded.online_games;
$$;

create function public.country_bump(p_day date, p_country text, d_registrations integer, d_games integer)
returns void
language sql
set search_path = public
as $$
  insert into daily_country as c (day, country, registrations, games)
  values (p_day, coalesce(p_country, ''), d_registrations, d_games)
  on conflict (day, country) do update set
    registrations = c.registrations + excluded.registrations,
    games = c.games + excluded.games;
$$;

-- The UTC day of a time.
create function public.utc_day(p_at timestamptz)
returns date
language sql immutable
as $$
  select (p_at at time zone 'utc')::date;
$$;

-- Players: a stats row for each new player, and the sign ups and deletions per day.
create function public.admin_track_players()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into player_stats (player_id) values (new.id) on conflict do nothing;
    perform daily_bump(utc_day(new.created_at), 0::smallint, d_registrations => 1);
    perform country_bump(utc_day(new.created_at), new.country, 1, 0);
    return null;
  end if;
  perform daily_bump(utc_day(now()), 0::smallint, d_deletions => 1);
  return null;
end;
$$;
create trigger players_admin_stats after insert or delete on public.players
  for each row execute function public.admin_track_players();

-- Verified wins (not hidden) per player and level.
create function public.admin_track_wins()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and not old.hidden then
    update player_stats set
      wins = wins - 1,
      wins_1 = wins_1 - (old.level = 1)::integer,
      wins_2 = wins_2 - (old.level = 2)::integer,
      wins_3 = wins_3 - (old.level = 3)::integer,
      wins_4 = wins_4 - (old.level = 4)::integer
    where player_id = old.player_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not new.hidden then
    update player_stats set
      wins = wins + 1,
      wins_1 = wins_1 + (new.level = 1)::integer,
      wins_2 = wins_2 + (new.level = 2)::integer,
      wins_3 = wins_3 + (new.level = 3)::integer,
      wins_4 = wins_4 + (new.level = 4)::integer
    where player_id = new.player_id;
  end if;
  return null;
end;
$$;
create trigger wins_admin_stats after insert or delete or update of hidden, level on public.wins
  for each row execute function public.admin_track_wins();

-- One reported result's part of the counts: sign 1 adds it, -1 takes it away.
create function public.admin_result_delta(p_player uuid, p_level smallint, p_result text, p_resigned boolean, p_sign integer)
returns void
language sql
set search_path = public
as $$
  update player_stats set
    games = games + p_sign,
    games_1 = games_1 + p_sign * (p_level = 1)::integer,
    games_2 = games_2 + p_sign * (p_level = 2)::integer,
    games_3 = games_3 + p_sign * (p_level = 3)::integer,
    games_4 = games_4 + p_sign * (p_level = 4)::integer,
    losses = losses + p_sign * (p_result = 'loss')::integer,
    draws = draws + p_sign * (p_result = 'draw')::integer,
    resigned = resigned + p_sign * coalesce(p_resigned, false)::integer
  where player_id = p_player;
$$;

-- Reported results: the player's counts, the day's counts, who played that
-- day, and the player's last activity (at most every 5 minutes, to keep
-- writes low). A verified win that replaces a reported loss moves the game
-- from one column to the other. Deleting a player changes no past day.
create function public.admin_track_results()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_country text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform admin_result_delta(old.player_id, old.level, old.result, old.resigned, -1);
  end if;
  if tg_op = 'UPDATE' then
    perform daily_bump(utc_day(old.created_at), old.level,
      d_games => -1, d_wins => -(old.result = 'win')::integer, d_losses => -(old.result = 'loss')::integer,
      d_draws => -(old.result = 'draw')::integer, d_resigned => -old.resigned::integer);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform admin_result_delta(new.player_id, new.level, new.result, new.resigned, 1);
    perform daily_bump(utc_day(new.created_at), new.level,
      d_games => 1, d_wins => (new.result = 'win')::integer, d_losses => (new.result = 'loss')::integer,
      d_draws => (new.result = 'draw')::integer, d_resigned => new.resigned::integer);
  end if;
  if tg_op = 'INSERT' then
    select p.country into v_country from players p where p.id = new.player_id;
    perform country_bump(utc_day(new.created_at), v_country, 0, 1);
    insert into daily_active (day, player_id) values (utc_day(new.created_at), new.player_id) on conflict do nothing;
    update players set last_seen_at = new.created_at
    where id = new.player_id and (last_seen_at is null or last_seen_at < new.created_at - interval '5 minutes');
  end if;
  return null;
end;
$$;
create trigger game_results_admin_stats after insert or delete or update on public.game_results
  for each row execute function public.admin_track_results();

-- The AI's reports (abandoned games).
create function public.admin_track_reports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update player_stats set abandoned = abandoned - 1 where player_id = old.player_id;
    return null;
  end if;
  update player_stats set abandoned = abandoned + 1 where player_id = new.player_id;
  perform daily_bump(utc_day(new.created_at), new.level, d_abandoned => 1);
  update players set last_seen_at = new.created_at
  where id = new.player_id and (last_seen_at is null or last_seen_at < new.created_at - interval '5 minutes');
  return null;
end;
$$;
create trigger player_reports_admin_stats after insert or delete on public.player_reports
  for each row execute function public.admin_track_reports();

-- The counts so far, from the existing rows.
insert into public.player_stats (player_id, wins, wins_1, wins_2, wins_3, wins_4, games, games_1, games_2, games_3, games_4, losses, draws, resigned, abandoned)
select p.id,
  coalesce(w.wins, 0), coalesce(w.w1, 0), coalesce(w.w2, 0), coalesce(w.w3, 0), coalesce(w.w4, 0),
  coalesce(g.games, 0), coalesce(g.g1, 0), coalesce(g.g2, 0), coalesce(g.g3, 0), coalesce(g.g4, 0),
  coalesce(g.losses, 0), coalesce(g.draws, 0), coalesce(g.resigned, 0), coalesce(r.abandoned, 0)
from public.players p
left join (
  select player_id, count(*) as wins,
    count(*) filter (where level = 1) as w1, count(*) filter (where level = 2) as w2,
    count(*) filter (where level = 3) as w3, count(*) filter (where level = 4) as w4
  from public.wins where not hidden group by player_id
) w on w.player_id = p.id
left join (
  select player_id, count(*) as games,
    count(*) filter (where level = 1) as g1, count(*) filter (where level = 2) as g2,
    count(*) filter (where level = 3) as g3, count(*) filter (where level = 4) as g4,
    count(*) filter (where result = 'loss') as losses, count(*) filter (where result = 'draw') as draws,
    count(*) filter (where resigned) as resigned
  from public.game_results group by player_id
) g on g.player_id = p.id
left join (select player_id, count(*) as abandoned from public.player_reports group by player_id) r on r.player_id = p.id;

insert into public.daily_stats (day, level, registrations)
select public.utc_day(created_at), 0, count(*) from public.players group by 1;

insert into public.daily_stats (day, level, games, wins, losses, draws, resigned)
select public.utc_day(created_at), level, count(*),
  count(*) filter (where result = 'win'), count(*) filter (where result = 'loss'),
  count(*) filter (where result = 'draw'), count(*) filter (where resigned)
from public.game_results group by 1, 2;

insert into public.daily_stats as d (day, level, abandoned)
select public.utc_day(created_at), level, count(*) from public.player_reports group by 1, 2
on conflict (day, level) do update set abandoned = d.abandoned + excluded.abandoned;

insert into public.daily_country (day, country, registrations)
select public.utc_day(created_at), coalesce(country, ''), count(*) from public.players group by 1, 2;

insert into public.daily_country as c (day, country, games)
select public.utc_day(g.created_at), coalesce(p.country, ''), count(*)
from public.game_results g join public.players p on p.id = g.player_id group by 1, 2
on conflict (day, country) do update set games = c.games + excluded.games;

insert into public.daily_active (day, player_id)
select distinct public.utc_day(created_at), player_id from public.game_results
where created_at > now() - interval '400 days';

-- ---------------------------------------------------------------------------
-- 5. Visitors and the live heartbeat: no personal data, short lives.
-- ---------------------------------------------------------------------------

-- Unique devices per day. A mark is a keyed hash of the day and of a hashed
-- device id, so marks of different days cannot be linked and cannot be
-- turned back into a device. Marks are deleted after two days; the count
-- per day is all that stays.
create table public.daily_visitors (
  day date primary key,
  visitors integer not null default 0 check (visitors >= 0)
);
create table public.visitor_marks (
  day date not null,
  mark text not null check (char_length(mark) between 16 and 128),
  primary key (day, mark)
);

-- One row per device with a game on screen, refreshed every 30 seconds and
-- gone after it expires: the mode, the level and the flag the player shows.
-- Unlogged: fast, and lost if the database restarts, which is fine here.
create unlogged table public.live_sessions (
  session text primary key check (char_length(session) between 16 and 128),
  mode text not null check (mode in ('ai', 'two', 'online')),
  level smallint check (level between 1 and 4),
  country text check (country ~ '^[A-Z]{2}$'),
  started_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index live_sessions_expires_idx on public.live_sessions (expires_at);

-- Counts one device for the day, once. The rate limit is checked in the same
-- call, so one request is one database call. Old marks, old live rows and
-- old daily activity are cleaned up now and then.
create function public.count_visit(p_day date, p_mark text, p_rate_key text, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select r.allowed into v_allowed from hit_rate_limit(p_rate_key, 3600, p_limit) r;
  if not v_allowed then
    return false;
  end if;
  insert into visitor_marks (day, mark) values (p_day, p_mark) on conflict do nothing;
  if found then
    insert into daily_visitors as d (day, visitors) values (p_day, 1)
    on conflict (day) do update set visitors = d.visitors + 1;
  end if;
  if random() < 0.02 then
    delete from visitor_marks where day < p_day - 1;
    delete from daily_active where day < p_day - 400;
  end if;
  return true;
end;
$$;

-- A heartbeat: keeps this device's live row for p_ttl_seconds. A new mode or
-- level is a new game, so its start time starts again.
create function public.presence_beat(p_session text, p_mode text, p_level smallint, p_country text, p_ttl_seconds integer, p_rate_key text, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  select r.allowed into v_allowed from hit_rate_limit(p_rate_key, 60, p_limit) r;
  if not v_allowed then
    return false;
  end if;
  insert into live_sessions as l (session, mode, level, country, started_at, seen_at, expires_at)
  values (p_session, p_mode, p_level, p_country, now(), now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (session) do update set
    started_at = case when l.mode is distinct from excluded.mode or l.level is distinct from excluded.level or l.expires_at < now()
      then now() else l.started_at end,
    mode = excluded.mode, level = excluded.level, country = excluded.country,
    seen_at = now(), expires_at = excluded.expires_at;
  if random() < 0.05 then
    delete from live_sessions where expires_at < now();
  end if;
  return true;
end;
$$;

-- The game ended or the page closed: the device is no longer in a game.
create function public.presence_end(p_session text)
returns void
language sql
set search_path = public
as $$
  delete from live_sessions where session = p_session;
$$;

-- Rate limited end events use one database call, without exposing a device.
create function public.game_presence_end(p_session text, p_rate_key text, p_limit integer)
returns boolean language plpgsql set search_path = public as $$
declare v_allowed boolean;
begin
  select r.allowed into v_allowed from hit_rate_limit(p_rate_key, 60, p_limit) r;
  if not v_allowed then return false; end if;
  perform presence_end(p_session);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The suspension, for the player (replaces migration 4's two functions).
-- ---------------------------------------------------------------------------

-- The player's reports and suspension now (a past suspension reads null, so
-- an expired one lifts by itself), with its kind and the last time a person
-- changed it. The result type changes, so both functions are made again.
drop function public.add_report(uuid, uuid, smallint, text, integer, integer);
drop function public.player_conduct(uuid);

create function public.player_conduct(p_player uuid)
returns table (reports integer, total_reports bigint, suspended_until timestamptz, suspension_kind text, revised_at timestamptz)
language sql stable
set search_path = public
as $$
  select p.reports_active::integer,
    (select count(*) from player_reports r where r.player_id = p.id),
    case when p.suspended_until > now() then p.suspended_until end,
    case when p.suspended_until > now() then p.suspension_kind end,
    p.suspension_revised_at
  from players p
  where p.id = p_player;
$$;

-- As in migration 4: once per game; not suspended, the count goes up and at
-- p_limit the player is suspended for p_days (kind 'reports'); while
-- suspended (by the AI or by a person) a report only adds to the total.
create function public.add_report(p_player uuid, p_game uuid, p_level smallint, p_phase text, p_limit integer, p_days integer)
returns table (reports integer, total_reports bigint, suspended_until timestamptz, suspension_kind text, revised_at timestamptz)
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
        update players set reports_active = 0, suspended_until = now() + make_interval(days => p_days),
          suspension_kind = 'reports', suspension_reason = null, suspended_by = null, suspended_at = now()
        where id = p_player;
      else
        update players set reports_active = v_active + 1, suspended_until = null, suspension_kind = null
        where id = p_player;
      end if;
    end if;
  end if;
  return query select * from player_conduct(p_player);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Indexes for the admin's search, filters and keyset paging.
-- ---------------------------------------------------------------------------

create index players_created_idx on public.players (created_at, id);
create index players_active_idx on public.players ((coalesce(last_seen_at, created_at)), id);
create index players_country_idx on public.players (country, created_at);
create index players_suspended_idx on public.players (suspended_until) where suspended_until is not null;
create index players_hidden_idx on public.players (id) where hidden;
create index players_device_idx on public.players (device_hash);
create index player_stats_wins_idx on public.player_stats (wins, player_id);
create index player_stats_games_idx on public.player_stats (games, player_id);
create index player_stats_losses_idx on public.player_stats (losses, player_id);
create index player_stats_resigned_idx on public.player_stats (resigned, player_id);
create index player_stats_abandoned_idx on public.player_stats (abandoned, player_id);
create index player_stats_reports_idx on public.player_stats (reports, player_id);
create index game_results_player_time_idx on public.game_results (player_id, created_at desc);
create index game_results_resigned_idx on public.game_results (created_at) where resigned;
create index wins_player_time_idx on public.wins (player_id, created_at desc);

-- Trigram indexes for "contains" search. The operator class lives in the
-- schema pg_trgm was installed in (extensions on Supabase).
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index players_username_trgm on public.players using gin (username_key %I.gin_trgm_ops)', v_schema);
  execute format('create index admin_audit_search_trgm on public.admin_audit using gin (search %I.gin_trgm_ops)', v_schema);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The admin's sign in checks and the audit log.
-- ---------------------------------------------------------------------------

-- Whether this user is on the allow list (id and email both match), and
-- whether the window to set up a new authenticator is open.
create function public.admin_gate(p_user uuid, p_email text)
returns table (allowed boolean, enroll_open boolean)
language sql stable
set search_path = public
as $$
  select a.user_id is not null, coalesce(a.enroll_until > now(), false)
  from (select 1) as one
  left join admin_users a on a.user_id = p_user and a.email = lower(p_email);
$$;

create function public.admin_close_enrollment(p_user uuid)
returns void
language sql
set search_path = public
as $$
  update admin_users set enroll_until = null where user_id = p_user;
$$;

create function public.admin_log(
  p_admin uuid, p_action text, p_outcome text, p_reason text,
  p_target uuid, p_label text, p_details jsonb, p_ip_hash text)
returns bigint
language sql
set search_path = public
as $$
  insert into admin_audit (admin_id, action, outcome, reason, target_player, target_label, details, ip_hash)
  values (p_admin, p_action, p_outcome, p_reason, p_target, p_label, coalesce(p_details, '{}'::jsonb), p_ip_hash)
  returning id;
$$;

-- A "contains" pattern for LIKE, with the user's own % _ and \ escaped.
create function public.admin_like(p_text text)
returns text
language sql immutable
as $$
  select case when p_text is null or btrim(p_text) = '' then null
    else '%' || replace(replace(replace(lower(btrim(p_text)), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
$$;

-- One page of the audit log, newest first: before p_before (an id), with
-- optional search text, action (or action group such as 'player') and player.
create function public.admin_audit_page(p_search text, p_action text, p_player uuid, p_before bigint, p_limit integer)
returns table (id bigint, at timestamptz, admin_id uuid, admin_email text, action text, outcome text, reason text,
  target_player uuid, target_label text, details jsonb)
language sql stable
set search_path = public
as $$
  select a.id, a.at, a.admin_id, u.email, a.action, a.outcome, a.reason, a.target_player, a.target_label, a.details
  from admin_audit a
  left join admin_users u on u.user_id = a.admin_id
  where (admin_like(p_search) is null or a.search like admin_like(p_search) escape '\')
    and (p_action is null or a.action = p_action or a.action like p_action || '.%')
    and (p_player is null or a.target_player = p_player)
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- 9. The players table and a player's details.
-- ---------------------------------------------------------------------------

-- Whether migration 6 (online rooms) was run.
create function public.admin_has_rooms()
returns boolean
language sql stable
as $$
  select to_regclass('public.online_reports') is not null and to_regclass('public.online_matches') is not null;
$$;

-- One page of players, keyset paged on the chosen sort (and the id, so the
-- order never changes): pass the last row's sort_value and id to get the
-- next page. Filters: search (part of a username, or a whole id), status,
-- country ('none' for no flag), a level played, joined and last active
-- ranges. reporters counts different reporters (the AI counts as one).
create function public.admin_players(
  p_search text, p_status text, p_country text, p_level integer,
  p_joined_from timestamptz, p_joined_to timestamptz, p_active_from timestamptz, p_active_to timestamptz,
  p_sort text, p_desc boolean, p_after text, p_after_id uuid, p_limit integer)
returns table (
  id uuid, username text, avatar text, country text, created_at timestamptz, last_active timestamptz,
  hidden boolean, suspended_until timestamptz, suspension_kind text, device_banned boolean,
  wins integer, wins_1 integer, wins_2 integer, wins_3 integer, wins_4 integer,
  games integer, losses integer, draws integer, resigned integer, abandoned integer,
  reports integer, reporters integer, sort_value text)
language plpgsql stable
set search_path = public
as $$
declare
  v_stats boolean := p_sort in ('wins', 'games', 'losses', 'resigned', 'abandoned', 'reports');
  v_sort text := case p_sort
    when 'joined' then 'p.created_at'
    when 'active' then 'coalesce(p.last_seen_at, p.created_at)'
    when 'name' then 'p.username_key'
    when 'wins' then 's.wins' when 'games' then 's.games' when 'losses' then 's.losses'
    when 'resigned' then 's.resigned' when 'abandoned' then 's.abandoned' when 'reports' then 's.reports'
  end;
  v_type text := case when p_sort in ('joined', 'active') then 'timestamptz' when p_sort = 'name' then 'text' else 'integer' end;
  v_id text := case when v_stats then 's.player_id' else 'p.id' end;
  v_reporters text := case when admin_has_rooms()
    then '(s.abandoned > 0)::integer + (select count(distinct r.reporter_id)::integer from online_reports r where r.reported_id = p.id)'
    else '(s.abandoned > 0)::integer' end;
begin
  if v_sort is null then
    raise exception 'unknown sort' using errcode = '22023';
  end if;
  return query execute format($sql$
    select p.id, p.username, p.avatar, p.country, p.created_at, coalesce(p.last_seen_at, p.created_at),
      p.hidden, case when p.suspended_until > now() then p.suspended_until end,
      case when p.suspended_until > now() then p.suspension_kind end,
      exists (select 1 from banned_devices b where b.device_hash = p.device_hash),
      s.wins, s.wins_1, s.wins_2, s.wins_3, s.wins_4, s.games, s.losses, s.draws, s.resigned, s.abandoned,
      s.reports, %5$s, (%1$s)::text
    from players p
    join player_stats s on s.player_id = p.id
    where ($1::text is null or p.username_key like $1 escape '\' or p.id::text = lower(btrim($14)))
      and ($2::text is null
        or ($2 = 'active' and not p.hidden and (p.suspended_until is null or p.suspended_until <= now()))
        or ($2 = 'suspended' and p.suspended_until > now() and p.suspension_kind is distinct from 'permanent')
        or ($2 = 'banned' and p.suspended_until > now() and p.suspension_kind = 'permanent')
        or ($2 = 'hidden' and p.hidden)
        or ($2 = 'reported' and s.reports > 0)
        or ($2 = 'device' and exists (select 1 from banned_devices b where b.device_hash = p.device_hash)))
      and ($3::text is null or ($3 = 'none' and p.country is null) or p.country = $3)
      and ($4::integer is null
        or ($4 = 1 and s.games_1 > 0) or ($4 = 2 and s.games_2 > 0) or ($4 = 3 and s.games_3 > 0) or ($4 = 4 and s.games_4 > 0))
      and ($5::timestamptz is null or p.created_at >= $5)
      and ($6::timestamptz is null or p.created_at < $6)
      and ($7::timestamptz is null or coalesce(p.last_seen_at, p.created_at) >= $7)
      and ($8::timestamptz is null or coalesce(p.last_seen_at, p.created_at) < $8)
      and ($9::text is null or (%1$s, %4$s) %2$s ($9::%6$s, $10::uuid))
    order by %1$s %3$s, %4$s %3$s
    limit $11
  $sql$, v_sort, case when p_desc then '<' else '>' end, case when p_desc then 'desc' else 'asc' end, v_id, v_reporters, v_type)
  using admin_like(p_search), p_status, p_country, p_level, p_joined_from, p_joined_to, p_active_from, p_active_to,
    p_after, p_after_id, least(greatest(p_limit, 1), 200), null::text, null::text, coalesce(p_search, '');
end;
$$;

-- Everything stored about one player, as one JSON object, and an audit row
-- for looking (in the same step, so no look goes unrecorded). Hashes are
-- shown shortened: enough to tell devices apart, never the full value; the
-- token's hash is never shown. Lists are the newest 50 or 100; the full
-- game history pages with admin_player_games.
create function public.admin_player_detail(p_admin uuid, p_ip_hash text, p_player uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_result jsonb;
  v_rooms boolean := admin_has_rooms();
  v_against jsonb;
  v_made jsonb := '[]'::jsonb;
  v_room_devices jsonb := '[]'::jsonb;
  v_username text;
begin
  select p.username into v_username from players p where p.id = p_player;
  if not found then
    return null;
  end if;
  perform admin_log(p_admin, 'player.view', 'ok', null, p_player, v_username, '{}'::jsonb, p_ip_hash);

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into v_against from (
    select 'ai' as source, r.player_id::text || ':' || r.game_id::text as key, null::text as reporter, null::uuid as reporter_id,
      'abandoned' as reason, r.phase as detail, r.game_id::text as game, r.level, r.created_at, r.status, r.review_note
    from player_reports r where r.player_id = p_player order by r.created_at desc limit 100
  ) x;
  if v_rooms then
    execute $sql$
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select 'room' as source, r.id::text as key, rp.username as reporter, r.reporter_id, r.reason, null::text as detail,
          r.room_code as game, null::smallint as level, r.created_at, r.status, r.review_note
        from online_reports r left join players rp on rp.id = r.reporter_id
        where r.reported_id = $1 order by r.created_at desc limit 100) x
    $sql$ into v_made using p_player;
    v_against := v_against || v_made;
    execute $sql$
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select 'room' as source, r.id::text as key, tp.username as reported, r.reported_id, r.reason, r.room_code as game, r.created_at, r.status
        from online_reports r left join players tp on tp.id = r.reported_id
        where r.reporter_id = $1 order by r.created_at desc limit 100) x
    $sql$ into v_made using p_player;
    execute $sql$
      select coalesce(jsonb_agg(distinct left(o.device_hash, 12)), '[]'::jsonb) from online_rooms o where o.host_id = $1
    $sql$ into v_room_devices using p_player;
  end if;

  select jsonb_build_object(
    'player', jsonb_build_object(
      'id', p.id, 'username', p.username, 'country', p.country, 'avatar', p.avatar, 'hidden', p.hidden,
      'createdAt', p.created_at, 'usernameChangedAt', p.username_changed_at, 'lastSeenAt', p.last_seen_at,
      'reportsActive', p.reports_active,
      'suspendedUntil', case when p.suspended_until > now() then p.suspended_until end,
      'suspensionKind', case when p.suspended_until > now() then p.suspension_kind end,
      'suspensionReason', p.suspension_reason, 'suspendedBy', su.email, 'suspendedAt', p.suspended_at,
      'suspensionRevisedAt', p.suspension_revised_at,
      'device', left(p.device_hash, 12), 'ip', left(p.ip_hash, 12),
      'deviceBanned', exists (select 1 from banned_devices b where b.device_hash = p.device_hash)),
    'stats', (select to_jsonb(s) - 'player_id' from player_stats s where s.player_id = p.id),
    'devices', jsonb_build_array(left(p.device_hash, 12)) || v_room_devices,
    'reservations', (select coalesce(jsonb_agg(jsonb_build_object('username', r.username_key, 'until', r.reserved_until)), '[]'::jsonb)
      from username_reservations r where r.player_id = p.id),
    'games', (select coalesce(jsonb_agg(g order by g.created_at desc), '[]'::jsonb) from (
      select gr.game_id, gr.level, gr.result, gr.resigned, gr.created_at,
        exists (select 1 from player_reports r where r.player_id = gr.player_id and r.game_id = gr.game_id) as abandoned
      from game_results gr where gr.player_id = p.id order by gr.created_at desc limit 50) g),
    'wins', (select coalesce(jsonb_agg(w order by w.created_at desc), '[]'::jsonb) from (
      select wi.id, wi.game_id, wi.level, wi.move_count, wi.hidden, wi.created_at, wi.stats
      from wins wi where wi.player_id = p.id order by wi.created_at desc limit 50) w),
    'reportsAgainst', v_against,
    'reportsMade', case when v_rooms then v_made else '[]'::jsonb end,
    'adminHistory', (select coalesce(jsonb_agg(a order by a.id desc), '[]'::jsonb) from (
      select au.id, au.at, u.email as admin, au.action, au.outcome, au.reason, au.details
      from admin_audit au left join admin_users u on u.user_id = au.admin_id
      where au.target_player = p.id and au.action <> 'player.view'
      order by au.id desc limit 100) a),
    'rooms', v_rooms)
  into v_result
  from players p
  left join admin_users su on su.user_id = p.suspended_by
  where p.id = p_player;
  return v_result;
end;
$$;

-- A player's full game history, newest first, keyset paged on the time and game id.
create function public.admin_player_games(p_player uuid, p_before timestamptz, p_before_game uuid, p_limit integer)
returns table (game_id uuid, level smallint, result text, resigned boolean, abandoned boolean, created_at timestamptz)
language sql stable
set search_path = public
as $$
  select g.game_id, g.level, g.result, g.resigned,
    exists (select 1 from player_reports r where r.player_id = g.player_id and r.game_id = g.game_id),
    g.created_at
  from game_results g
  where g.player_id = p_player
    and (p_before is null or (g.created_at, g.game_id) < (p_before, p_before_game))
  order by g.created_at desc, g.game_id desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- 10. The overview and the charts: summary tables only.
-- ---------------------------------------------------------------------------

-- The headline numbers since a time (null: all time).
create function public.admin_overview(p_since timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_from date := case when p_since is null then null else utc_day(p_since) end;
  v_open_rooms bigint := 0;
  v_result jsonb;
begin
  if admin_has_rooms() then
    execute 'select count(*) from online_reports where status = ''open''' into v_open_rooms;
  end if;
  select jsonb_build_object(
    'registered', (select coalesce(sum(registrations - deletions), 0) from daily_stats where level = 0),
    'newPlayers', (select coalesce(sum(registrations), 0) from daily_stats where level = 0 and (v_from is null or day >= v_from)),
    'visitors', (select coalesce(sum(visitors), 0) from daily_visitors where v_from is null or day >= v_from),
    'visitorsToday', (select coalesce(sum(visitors), 0) from daily_visitors where day = utc_day(now())),
    'onlineNow', (select count(*) from live_sessions where expires_at > now()),
    'games', (select coalesce(sum(games), 0) from daily_stats where level > 0 and (v_from is null or day >= v_from)),
    'onlineGames', (select coalesce(sum(online_games), 0) from daily_stats where level = 0 and (v_from is null or day >= v_from)),
    'resigned', (select coalesce(sum(resigned), 0) from daily_stats where level > 0 and (v_from is null or day >= v_from)),
    'abandoned', (select coalesce(sum(abandoned), 0) from daily_stats where level > 0 and (v_from is null or day >= v_from)),
    'levels', (select coalesce(jsonb_agg(x order by x.level), '[]'::jsonb) from (
      select l.level, coalesce(sum(d.games), 0) as games, coalesce(sum(d.wins), 0) as wins, coalesce(sum(d.losses), 0) as losses,
        coalesce(sum(d.draws), 0) as draws, coalesce(sum(d.resigned), 0) as resigned, coalesce(sum(d.abandoned), 0) as abandoned
      from generate_series(1, 4) as l(level)
      left join daily_stats d on d.level = l.level and (v_from is null or d.day >= v_from)
      group by l.level) x),
    'openReports', (select count(*) from player_reports where status = 'open') + v_open_rooms,
    'suspended', (select count(*) from players where suspended_until > now()))
  into v_result;
  return v_result;
end;
$$;

-- One row per day from p_from to p_to (UTC days, none missing): sign ups,
-- deletions, registered players at the end of the day, unique visitors,
-- players who played, and the day's games.
create function public.admin_daily(p_from date, p_to date)
returns table (day date, registrations bigint, deletions bigint, registered bigint, visitors bigint, active bigint,
  games bigint, wins bigint, losses bigint, draws bigint, resigned bigint, abandoned bigint, online_games bigint)
language sql stable
set search_path = public
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') as g(d)
  ), base as (
    select coalesce(sum(registrations - deletions), 0) as before from daily_stats where level = 0 and day < p_from
  ), zero as (
    select s.day, sum(s.registrations) as registrations, sum(s.deletions) as deletions, sum(s.online_games) as online_games
    from daily_stats s where s.level = 0 and s.day between p_from and p_to group by s.day
  ), levels as (
    select s.day, sum(s.games) as games, sum(s.wins) as wins, sum(s.losses) as losses, sum(s.draws) as draws,
      sum(s.resigned) as resigned, sum(s.abandoned) as abandoned
    from daily_stats s where s.level > 0 and s.day between p_from and p_to group by s.day
  ), act as (
    select a.day, count(*) as active from daily_active a where a.day between p_from and p_to group by a.day
  )
  select d.day,
    coalesce(z.registrations, 0), coalesce(z.deletions, 0),
    (select before from base) + sum(coalesce(z.registrations, 0) - coalesce(z.deletions, 0)) over (order by d.day),
    coalesce(v.visitors, 0)::bigint, coalesce(a.active, 0),
    coalesce(l.games, 0), coalesce(l.wins, 0), coalesce(l.losses, 0), coalesce(l.draws, 0),
    coalesce(l.resigned, 0), coalesce(l.abandoned, 0), coalesce(z.online_games, 0)
  from days d
  left join zero z on z.day = d.day
  left join levels l on l.day = d.day
  left join daily_visitors v on v.day = d.day
  left join act a on a.day = d.day
  order by d.day;
$$;

-- The day's games per level, for the wins and losses by level charts.
create function public.admin_daily_levels(p_from date, p_to date)
returns table (day date, level smallint, games integer, wins integer, losses integer, draws integer, resigned integer, abandoned integer)
language sql stable
set search_path = public
as $$
  select s.day, s.level, s.games, s.wins, s.losses, s.draws, s.resigned, s.abandoned
  from daily_stats s
  where s.level > 0 and s.day between p_from and p_to
  order by s.day, s.level;
$$;

-- Different players who played in each week (Monday to Sunday, UTC).
create function public.admin_weekly_active(p_from date, p_to date)
returns table (week date, active bigint)
language sql stable
set search_path = public
as $$
  select date_trunc('week', a.day)::date, count(distinct a.player_id)
  from daily_active a
  where a.day between p_from and p_to
  group by 1
  order by 1;
$$;

-- Each flag ('' for none): players showing it now, sign ups and games since
-- p_since (null: all time), and devices in a game now.
create function public.admin_countries(p_since timestamptz)
returns table (country text, players bigint, signups bigint, games bigint, online_now bigint)
language sql stable
set search_path = public
as $$
  with now_players as (
    select coalesce(p.country, '') as country, count(*) as players from players p group by 1
  ), period as (
    select c.country, sum(c.registrations) as signups, sum(c.games) as games
    from daily_country c where p_since is null or c.day >= utc_day(p_since) group by c.country
  ), live as (
    select coalesce(l.country, '') as country, count(*) as online_now from live_sessions l where l.expires_at > now() group by 1
  ), flags as (
    select country from now_players union select country from period union select country from live
  )
  select f.country, coalesce(n.players, 0), coalesce(p.signups, 0), coalesce(p.games, 0), coalesce(l.online_now, 0)
  from flags f
  left join now_players n on n.country = f.country
  left join period p on p.country = f.country
  left join live l on l.country = f.country
  order by coalesce(n.players, 0) desc, coalesce(p.games, 0) desc, f.country;
$$;

-- The real ranking (as the public leaderboard, leaderboard_ranked), with
-- each player's games at that level in the period, for the win rate.
create function public.admin_rankings(p_level integer, p_since timestamptz, p_limit integer)
returns table (rank bigint, player_id uuid, username text, country text, avatar text, wins bigint, best_moves integer, games bigint)
language sql stable
set search_path = public
as $$
  select r.rank, r.player_id, r.username, r.country, r.avatar, r.wins, r.best_moves,
    (select count(*) from game_results g where g.player_id = r.player_id and g.level = p_level
      and (p_since is null or g.created_at >= p_since))
  from leaderboard_ranked(p_level, p_since) r
  order by r.rank
  limit least(greatest(p_limit, 1), 100);
$$;

-- The players with the most verified wins over every level, all time.
create function public.admin_top_winners(p_limit integer)
returns table (player_id uuid, username text, country text, avatar text, hidden boolean, wins integer, games integer,
  wins_1 integer, wins_2 integer, wins_3 integer, wins_4 integer)
language sql stable
set search_path = public
as $$
  select p.id, p.username, p.country, p.avatar, p.hidden, s.wins, s.games, s.wins_1, s.wins_2, s.wins_3, s.wins_4
  from player_stats s join players p on p.id = s.player_id
  where s.wins > 0
  order by s.wins desc, s.player_id desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- The players who resign most since p_since (null: all time), with their
-- abandoned games beside (never counted as resignations, D87).
create function public.admin_resigners(p_since timestamptz, p_limit integer)
returns table (player_id uuid, username text, country text, avatar text, resigned bigint, abandoned bigint, games bigint)
language sql stable
set search_path = public
as $$
  with counted as (
    select s.player_id, s.resigned::bigint as resigned, s.abandoned::bigint as abandoned, s.games::bigint as games
    from player_stats s where p_since is null and s.resigned > 0
    union all
    select g.player_id, count(*), 0, 0
    from game_results g where p_since is not null and g.resigned and g.created_at >= p_since
    group by g.player_id
  ), top as (
    select * from counted order by resigned desc, player_id desc limit least(greatest(p_limit, 1), 100)
  )
  select t.player_id, p.username, p.country, p.avatar, t.resigned,
    case when p_since is null then t.abandoned
      else (select count(*) from player_reports r where r.player_id = t.player_id and r.created_at >= p_since) end,
    case when p_since is null then t.games
      else (select count(*) from game_results g where g.player_id = t.player_id and g.created_at >= p_since) end
  from top t join players p on p.id = t.player_id
  order by t.resigned desc, t.player_id desc;
$$;

-- ---------------------------------------------------------------------------
-- 11. Reports: the queue, grouped by player, and their statuses.
-- ---------------------------------------------------------------------------

-- Every report, from both sources, as one list (newest first), keyset paged
-- on the time and key. Sources: 'ai' (abandoned games, migration 4) and
-- 'room' (players' reports in online rooms, migration 6, when run).
create function public.admin_reports(p_status text, p_source text, p_player uuid, p_before timestamptz, p_before_key text, p_limit integer)
returns table (source text, key text, reported_id uuid, reported text, reporter_id uuid, reporter text,
  reason text, detail text, game text, level smallint, created_at timestamptz, status text, review_note text)
language plpgsql stable
set search_path = public
as $$
declare
  v_room text := '';
begin
  if admin_has_rooms() and (p_source is null or p_source = 'room') then
    v_room := $sql$
      union all
      select 'room', r.id::text, r.reported_id, tp.username, r.reporter_id, rp.username, r.reason, null::text,
        r.room_code, null::smallint, r.created_at, r.status, r.review_note
      from online_reports r
      join players tp on tp.id = r.reported_id
      left join players rp on rp.id = r.reporter_id
      where ($1::text is null or r.status = $1) and ($2::uuid is null or r.reported_id = $2)
        and ($3::timestamptz is null or (r.created_at, r.id::text) < ($3, $4))
    $sql$;
  end if;
  return query execute format($sql$
    select * from (
      select 'ai'::text, r.player_id::text || ':' || r.game_id::text, r.player_id, p.username, null::uuid, 'AI'::text,
        'abandoned'::text, r.phase, r.game_id::text, r.level, r.created_at, r.status, r.review_note
      from player_reports r
      join players p on p.id = r.player_id
      where $6::text is distinct from 'room'
        and ($1::text is null or r.status = $1) and ($2::uuid is null or r.player_id = $2)
        and ($3::timestamptz is null or (r.created_at, r.player_id::text || ':' || r.game_id::text) < ($3, $4))
      %s
    ) x
    order by 11 desc, 2 desc
    limit $5
  $sql$, v_room)
  using p_status, p_player, p_before, p_before_key, least(greatest(p_limit, 1), 200), p_source;
end;
$$;

-- Reports grouped by the reported player, most reports first: how many,
-- from how many different reporters (the AI counts as one), how many still
-- open, and the latest. Only players with a report in the chosen status.
create function public.admin_report_groups(p_status text, p_limit integer)
returns table (player_id uuid, username text, country text, avatar text, reports bigint, reporters bigint,
  open bigint, last_at timestamptz, suspended_until timestamptz, hidden boolean)
language plpgsql stable
set search_path = public
as $$
declare
  v_room text := '';
begin
  if admin_has_rooms() then
    v_room := 'union all select r.reported_id, r.reporter_id::text, r.status, r.created_at from online_reports r';
  end if;
  return query execute format($sql$
    with all_reports as (
      select r.player_id as reported, 'ai'::text as reporter, r.status, r.created_at from player_reports r
      %s
    ), grouped as (
      select a.reported, count(*) as reports, count(distinct a.reporter) as reporters,
        count(*) filter (where a.status = 'open') as open, max(a.created_at) as last_at
      from all_reports a
      group by a.reported
      having $1::text is null or count(*) filter (where a.status = $1) > 0
    )
    select g.reported, p.username, p.country, p.avatar, g.reports, g.reporters, g.open, g.last_at,
      case when p.suspended_until > now() then p.suspended_until end, p.hidden
    from grouped g join players p on p.id = g.reported
    order by g.open desc, g.reporters desc, g.reports desc, g.last_at desc
    limit $2
  $sql$, v_room)
  using p_status, least(greatest(p_limit, 1), 200);
end;
$$;

-- Sets one report's status, with the audit row in the same step.
create function public.admin_set_report_status(p_admin uuid, p_ip_hash text, p_source text, p_key text, p_status text, p_note text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_player uuid;
  v_label text;
begin
  if p_status not in ('open', 'reviewed', 'dismissed', 'actioned') then
    raise exception 'bad status' using errcode = '22023';
  end if;
  if p_source = 'ai' then
    update player_reports r set status = p_status, reviewed_by = p_admin, reviewed_at = now(), review_note = p_note
    where r.player_id::text || ':' || r.game_id::text = p_key
    returning r.player_id into v_player;
  elsif p_source = 'room' and admin_has_rooms() then
    execute 'update online_reports set status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3 where id::text = $4 returning reported_id'
      into v_player using p_status, p_admin, p_note, p_key;
  end if;
  if v_player is null then
    return false;
  end if;
  select username into v_label from players where id = v_player;
  perform admin_log(p_admin, 'report.' || p_status, 'ok', p_note, v_player, v_label,
    jsonb_build_object('source', p_source, 'report', p_key), p_ip_hash);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Admin actions on a player. Each one writes its audit row in the same
-- step, with the reason, so an action never goes unrecorded.
-- ---------------------------------------------------------------------------

-- Suspends until p_until, or for ever (p_permanent: until 9999-12-31, kind
-- 'permanent'). Also used to extend or shorten. Nothing else changes: wins,
-- stats and the profile stay, so lifting it restores everything.
create function public.admin_suspend(p_admin uuid, p_ip_hash text, p_player uuid, p_until timestamptz, p_permanent boolean, p_action text, p_reason text)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_until timestamptz := case when p_permanent then '9999-12-31 00:00:00+00'::timestamptz else p_until end;
  v_before timestamptz;
  v_label text;
begin
  if v_until is null or v_until <= now() then
    raise exception 'the end must be in the future' using errcode = '22023';
  end if;
  select case when suspended_until > now() then suspended_until end, username into v_before, v_label
  from players where id = p_player for update;
  if not found then
    return null;
  end if;
  update players set
    suspended_until = v_until,
    suspension_kind = case when p_permanent then 'permanent' else 'admin' end,
    suspension_reason = p_reason, suspended_by = p_admin,
    suspended_at = case when v_before is null then now() else suspended_at end,
    suspension_revised_at = now()
  where id = p_player;
  perform admin_log(p_admin, p_action, 'ok', p_reason, p_player, v_label,
    jsonb_build_object('until', v_until, 'before', v_before, 'permanent', p_permanent), p_ip_hash);
  return v_until;
end;
$$;

-- Lifts a suspension (from the AI's reports or a person) now.
create function public.admin_unsuspend(p_admin uuid, p_ip_hash text, p_player uuid, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_before timestamptz;
  v_label text;
begin
  select suspended_until, username into v_before, v_label from players where id = p_player for update;
  if not found then
    return false;
  end if;
  update players set suspended_until = null, suspension_kind = null, suspension_revised_at = now() where id = p_player;
  perform admin_log(p_admin, 'player.unsuspend', 'ok', p_reason, p_player, v_label,
    jsonb_build_object('before', v_before), p_ip_hash);
  return true;
end;
$$;

-- Bans (or unbans) the device the player made their profile on.
create function public.admin_device_ban(p_admin uuid, p_ip_hash text, p_player uuid, p_ban boolean, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_device text;
  v_label text;
begin
  select device_hash, username into v_device, v_label from players where id = p_player;
  if not found then
    return false;
  end if;
  if p_ban then
    insert into banned_devices (device_hash, player_id, reason, banned_by) values (v_device, p_player, p_reason, p_admin)
    on conflict (device_hash) do update set reason = excluded.reason, banned_by = excluded.banned_by, player_id = excluded.player_id;
  else
    delete from banned_devices where device_hash = v_device;
  end if;
  perform admin_log(p_admin, case when p_ban then 'device.ban' else 'device.unban' end, 'ok', p_reason, p_player, v_label,
    jsonb_build_object('device', left(v_device, 12)), p_ip_hash);
  return true;
end;
$$;

-- Hides a player everywhere public (the username stays taken), or shows them again.
create function public.admin_hide_player(p_admin uuid, p_ip_hash text, p_player uuid, p_hidden boolean, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_label text;
begin
  update players set hidden = p_hidden where id = p_player returning username into v_label;
  if not found then
    return false;
  end if;
  perform admin_log(p_admin, case when p_hidden then 'player.hide' else 'player.unhide' end, 'ok', p_reason, p_player, v_label, '{}'::jsonb, p_ip_hash);
  return true;
end;
$$;

-- Hides one win from the ranking, or counts it again.
create function public.admin_hide_win(p_admin uuid, p_ip_hash text, p_win uuid, p_hidden boolean, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_player uuid;
  v_label text;
  v_level smallint;
begin
  update wins set hidden = p_hidden where id = p_win returning player_id, level into v_player, v_level;
  if not found then
    return false;
  end if;
  select username into v_label from players where id = v_player;
  perform admin_log(p_admin, case when p_hidden then 'win.hide' else 'win.unhide' end, 'ok', p_reason, v_player, v_label,
    jsonb_build_object('win', p_win, 'level', v_level), p_ip_hash);
  return true;
end;
$$;

-- A forced rename: no 7 day wait, and the old name is not kept for the
-- player (it broke the rules). The player may choose a new name at once.
-- 'taken' when the name is used or reserved for someone else.
create function public.admin_force_rename(p_admin uuid, p_ip_hash text, p_player uuid, p_username text, p_username_key text, p_reason text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_old text;
begin
  select username into v_old from players where id = p_player for update;
  if not found then
    return 'notFound';
  end if;
  begin
    update players set username = p_username, username_key = p_username_key, username_changed_at = null where id = p_player;
  exception when unique_violation then
    return 'taken';
  end;
  delete from username_reservations where player_id = p_player and username_key = lower(v_old);
  perform admin_log(p_admin, 'player.rename', 'ok', p_reason, p_player, p_username,
    jsonb_build_object('from', v_old, 'to', p_username), p_ip_hash);
  return 'renamed';
end;
$$;

-- Resets the avatar (to the neutral person) or the flag (to none).
create function public.admin_reset_profile(p_admin uuid, p_ip_hash text, p_player uuid, p_field text, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_label text;
  v_before text;
begin
  if p_field = 'avatar' then
    select avatar into v_before from players where id = p_player;
    update players set avatar = null where id = p_player returning username into v_label;
  elsif p_field = 'country' then
    select country into v_before from players where id = p_player;
    update players set country = null where id = p_player returning username into v_label;
  else
    raise exception 'bad field' using errcode = '22023';
  end if;
  if v_label is null then
    return false;
  end if;
  perform admin_log(p_admin, 'player.reset' || p_field, 'ok', p_reason, p_player, v_label,
    jsonb_build_object('before', v_before), p_ip_hash);
  return true;
end;
$$;

-- Deletes a player and everything that belongs to them (wins, results,
-- reports, reserved names, stats, daily activity; their online rooms too,
-- through migration 6's foreign keys). The audit row stays, with the
-- username, as the record that it was done.
create function public.admin_delete_player(p_admin uuid, p_ip_hash text, p_player uuid, p_reason text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_label text;
begin
  select username into v_label from players where id = p_player for update;
  if not found then
    return false;
  end if;
  perform admin_log(p_admin, 'player.delete', 'ok', p_reason, p_player, v_label, '{}'::jsonb, p_ip_hash);
  delete from players where id = p_player;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Live: who is in a game now, and replays of finished or reported games.
-- ---------------------------------------------------------------------------

-- Devices in a game now (by mode, level and flag) and, with migration 6,
-- the online room games in progress: the two players, the start, the move
-- count. Never the board of a live game.
create function public.admin_live()
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_rooms jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if admin_has_rooms() then
    execute $sql$
      select coalesce(jsonb_agg(x order by x.started_at desc), '[]'::jsonb) from (
        select m.id, m.number, m.starts_at as started_at, m.move_count,
          jsonb_build_object('id', b.id, 'username', b.username, 'country', b.country, 'avatar', b.avatar) as black,
          jsonb_build_object('id', w.id, 'username', w.username, 'country', w.country, 'avatar', w.avatar) as white
        from online_matches m
        join online_rooms r on r.id = m.room_id
        join players b on b.id = m.black_id
        join players w on w.id = m.white_id
        where not m.finished and r.closed_at is null and r.used_at > now() - interval '10 minutes'
        order by m.starts_at desc
        limit 200) x
    $sql$ into v_rooms;
  end if;
  select jsonb_build_object(
    'online', (select count(*) from live_sessions where expires_at > now()),
    'modes', (select coalesce(jsonb_object_agg(mode, n), '{}'::jsonb) from (
      select mode, count(*) as n from live_sessions where expires_at > now() group by mode) m),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
      select level, count(*) as n from live_sessions where expires_at > now() and mode = 'ai' and level is not null group by level) l),
    'countries', (select coalesce(jsonb_agg(c order by c.n desc, c.country), '[]'::jsonb) from (
      select coalesce(country, '') as country, count(*) as n,
        count(*) filter (where mode = 'ai') as ai, count(*) filter (where mode = 'two') as two, count(*) filter (where mode = 'online') as online
      from live_sessions where expires_at > now() group by 1) c),
    'roomGames', v_rooms,
    'rooms', admin_has_rooms())
  into v_result;
  return v_result;
end;
$$;

-- The moves of a game, read only, and only when it is over or was reported:
-- a verified win ('win', always finished), or an online room game ('match')
-- that is finished or was reported. Writes an audit row. Null otherwise.
create function public.admin_replay(p_admin uuid, p_ip_hash text, p_kind text, p_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_result jsonb;
  v_player uuid;
begin
  if p_kind = 'win' then
    select jsonb_build_object('kind', 'win', 'moves', w.moves, 'level', w.level, 'moveCount', w.move_count,
        'createdAt', w.created_at, 'player', p.username), w.player_id
    into v_result, v_player
    from wins w join players p on p.id = w.player_id where w.id = p_id;
  elsif p_kind = 'match' and admin_has_rooms() then
    execute $sql$
      select jsonb_build_object('kind', 'match', 'moves', m.moves, 'moveCount', m.move_count, 'startedAt', m.starts_at,
          'finishedAt', m.finished_at, 'reason', m.reason, 'black', b.username, 'white', w.username,
          'winner', case when m.winner_id = m.black_id then 'black' when m.winner_id = m.white_id then 'white' end), m.black_id
      from online_matches m
      join online_rooms r on r.id = m.room_id
      join players b on b.id = m.black_id
      join players w on w.id = m.white_id
      where m.id = $1
        and (m.finished or exists (select 1 from online_reports o where o.room_code = r.code))
    $sql$ into v_result, v_player using p_id;
  end if;
  if v_result is not null then
    perform admin_log(p_admin, 'game.replay', 'ok', null, v_player, null, jsonb_build_object('kind', p_kind, 'id', p_id), p_ip_hash);
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Online rooms (migration 6): report statuses and counts. Safe to run
-- again; does nothing before migration 6. Run once more by hand if
-- migration 6 is run after this migration: select admin_link_rooms();
-- ---------------------------------------------------------------------------

create function public.admin_track_room_reports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update player_stats set room_reports = room_reports - 1 where player_id = old.reported_id;
  else
    update player_stats set room_reports = room_reports + 1 where player_id = new.reported_id;
  end if;
  return null;
end;
$$;

create function public.admin_track_online_games()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.finished and not old.finished then
    perform daily_bump(utc_day(coalesce(new.finished_at, now())), 0::smallint, d_online_games => 1);
  end if;
  return null;
end;
$$;

create function public.admin_link_rooms()
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if not admin_has_rooms() then
    return false;
  end if;
  alter table online_reports add column if not exists status text not null default 'open';
  alter table online_reports add column if not exists reviewed_by uuid;
  alter table online_reports add column if not exists review_note text;
  if not exists (select 1 from pg_constraint where conname = 'online_reports_admin_status_check') then
    alter table online_reports add constraint online_reports_admin_status_check
      check (status in ('open', 'reviewed', 'dismissed', 'actioned') and char_length(review_note) <= 500);
  end if;
  create index if not exists online_reports_reported_idx on online_reports (reported_id, created_at desc);
  create index if not exists online_reports_status_idx on online_reports (status, created_at desc);
  create or replace trigger online_reports_admin_stats after insert or delete on online_reports
    for each row execute function admin_track_room_reports();
  create or replace trigger online_matches_admin_stats after update of finished on online_matches
    for each row execute function admin_track_online_games();
  update player_stats s set room_reports = coalesce((select count(*) from online_reports r where r.reported_id = s.player_id), 0)
  where s.room_reports is distinct from coalesce((select count(*) from online_reports r where r.reported_id = s.player_id), 0);
  return true;
end;
$$;

select public.admin_link_rooms();

-- ---------------------------------------------------------------------------
-- 15. Rights: Row Level Security everywhere, nothing for the public roles,
-- and only the service role may call the functions. The audit log cannot
-- be changed or emptied by the service role.
-- ---------------------------------------------------------------------------

alter table public.admin_users enable row level security;
alter table public.admin_audit enable row level security;
alter table public.banned_devices enable row level security;
alter table public.player_stats enable row level security;
alter table public.daily_stats enable row level security;
alter table public.daily_country enable row level security;
alter table public.daily_active enable row level security;
alter table public.daily_visitors enable row level security;
alter table public.visitor_marks enable row level security;
alter table public.live_sessions enable row level security;
revoke all on table public.admin_users, public.admin_audit, public.banned_devices, public.player_stats, public.daily_stats,
  public.daily_country, public.daily_active, public.daily_visitors, public.visitor_marks, public.live_sessions
  from anon, authenticated;
revoke update, delete, truncate on table public.admin_audit from service_role;

-- Every function this migration made (and the two it made again): no one
-- but the service role may run them.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'admin_audit_append_only', 'daily_bump', 'country_bump', 'utc_day', 'admin_track_players', 'admin_track_wins',
      'admin_result_delta', 'admin_track_results', 'admin_track_reports', 'count_visit', 'presence_beat', 'presence_end', 'game_presence_end',
      'player_conduct', 'add_report', 'admin_gate', 'admin_close_enrollment', 'admin_log', 'admin_like', 'admin_audit_page',
      'admin_has_rooms', 'admin_players', 'admin_player_detail', 'admin_player_games', 'admin_overview', 'admin_daily',
      'admin_daily_levels', 'admin_weekly_active', 'admin_countries', 'admin_rankings', 'admin_top_winners', 'admin_resigners',
      'admin_reports', 'admin_report_groups', 'admin_set_report_status', 'admin_suspend', 'admin_unsuspend', 'admin_device_ban',
      'admin_hide_player', 'admin_hide_win', 'admin_force_rename', 'admin_reset_profile', 'admin_delete_player', 'admin_live',
      'admin_replay', 'admin_track_room_reports', 'admin_track_online_games', 'admin_link_rooms')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end;
$$;

commit;
