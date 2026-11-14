-- Checkervia leaderboard, migration 2 (D61, D62): avatars, username changes
-- and reserved old usernames.
-- Run once in the Supabase SQL editor, after leaderboard-migration.sql, and
-- before the version of the site that needs it goes live (see
-- deployment-guide.md). Never run it twice, and never edit migration 1.
--
-- Same security as migration 1: Row Level Security on, no policies, no
-- grants for anon and authenticated; only the service role (the Netlify
-- functions) can read or write.

-- Players: an avatar id and the time of the last rename.
-- The server checks the avatar against its list of allowed ids; the check
-- here only keeps the shape. No category (gender, age group) is stored.
alter table public.players
  add column avatar text check (avatar ~ '^a[0-9]{2}$'),
  add column username_changed_at timestamptz;

-- Old usernames, reserved for the player who gave them up for 30 days, so
-- nobody else can take a name the moment it is changed.
create table public.username_reservations (
  username_key text primary key check (username_key = lower(username_key)),
  player_id uuid not null references public.players (id) on delete cascade,
  reserved_until timestamptz not null
);
create index username_reservations_until_idx on public.username_reservations (reserved_until);

alter table public.username_reservations enable row level security;
revoke all on table public.username_reservations from anon, authenticated;

-- A new or changed username may not be a name reserved for someone else.
-- Raised as a unique violation, which the functions already read as "taken".
create or replace function public.players_reserved_names()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from username_reservations r
    where r.username_key = new.username_key and r.player_id <> new.id and r.reserved_until > now()
  ) then
    raise exception 'username reserved' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger players_reserved_names
  before insert or update of username_key on public.players
  for each row execute function public.players_reserved_names();

-- Renames a player in one step (the rules in D61):
-- tooSoon when the last rename was less than p_wait_days ago (with the time
-- the next one is allowed); taken when the name is used by another player
-- or reserved for one; renamed otherwise, after reserving the old name for
-- this player for p_reserve_days. Wins and stats stay with the player id.
create or replace function public.rename_player(p_player uuid, p_username text, p_username_key text, p_wait_days integer, p_reserve_days integer)
returns table (outcome text, next_change_at timestamptz)
language plpgsql volatile
set search_path = public
as $$
declare
  v_old_key text;
  v_changed timestamptz;
begin
  select p.username_key, p.username_changed_at into v_old_key, v_changed
  from players p where p.id = p_player for update;
  if not found then
    raise exception 'no player' using errcode = 'P0002';
  end if;

  if v_changed is not null and v_changed + make_interval(days => p_wait_days) > now() then
    return query select 'tooSoon'::text, v_changed + make_interval(days => p_wait_days);
    return;
  end if;

  if exists (select 1 from players p where p.username_key = p_username_key and p.id <> p_player)
     or exists (select 1 from username_reservations r where r.username_key = p_username_key and r.player_id <> p_player and r.reserved_until > now()) then
    return query select 'taken'::text, null::timestamptz;
    return;
  end if;

  -- The new name's own old reservation, or an expired one, is used up.
  delete from username_reservations r where r.username_key = p_username_key;
  if v_old_key <> p_username_key then
    insert into username_reservations as r (username_key, player_id, reserved_until)
    values (v_old_key, p_player, now() + make_interval(days => p_reserve_days))
    on conflict (username_key) do update set player_id = excluded.player_id, reserved_until = excluded.reserved_until;
  end if;

  update players p set username = p_username, username_key = p_username_key, username_changed_at = now() where p.id = p_player;
  -- Expired reservations are cleaned up now and then.
  if random() < 0.05 then
    delete from username_reservations r where r.reserved_until < now();
  end if;
  return query select 'renamed'::text, now() + make_interval(days => p_wait_days);
exception
  when unique_violation then
    -- Someone took the name at the same moment.
    return query select 'taken'::text, null::timestamptz;
end;
$$;

-- The ranking now includes the avatar. Its result type changes, so the
-- function is dropped and made again (the same ranking rules as migration 1).
drop function public.leaderboard_ranked(integer, timestamptz);
create function public.leaderboard_ranked(p_level integer, p_since timestamptz)
returns table (rank bigint, player_id uuid, username text, country text, avatar text, wins bigint, best_moves integer, reached_at timestamptz)
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
         c.player_id, p.username, p.country, p.avatar, c.wins, c.best_moves, c.reached_at
  from counted c
  join players p on p.id = c.player_id
  order by rank;
$$;

-- Only the service role may call the functions.
revoke execute on function public.leaderboard_ranked(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.rename_player(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.players_reserved_names() from public, anon, authenticated;
grant execute on function public.leaderboard_ranked(integer, timestamptz) to service_role;
grant execute on function public.rename_player(uuid, text, text, integer, integer) to service_role;
