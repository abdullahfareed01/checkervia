-- Checkervia, migration 10 (D153): one database round for the busiest
-- online room requests. Functions only: no table, column, index, policy or
-- data changes.
--
-- Needs migration 1 (players, rate_limits, hit_rate_limit) and the rooms
-- migration (leaderboard-migration-6.sql). Works with or without migration 9
-- (saved progress): a key from a login on another device (player_tokens) is
-- looked for only when that table exists.
--
-- Safe while the live game is running, and safe to run again (it only
-- creates or replaces its two functions). Until it is run, the functions of
-- the site use their earlier steps (D151); once it is run they use these.
--
-- Same security as every function here: it runs with the caller's rights,
-- and only the service role (the Netlify functions) may call it; anon and
-- authenticated may not. Every check (the rate limit answer, the player,
-- membership, the turn, the move's legality) is still made by the Netlify
-- function on what these return. They only do in one call what the
-- function would otherwise do in several.

begin;

-- The start of a room request: counts the request against each rate limit
-- counter (p_keys with p_limits, in one window), finds the player of the
-- token (the profile's first key, else a key from another device), reads the
-- room with its players and only its latest game, and stores the player's
-- sign of life, but only when every counter allows the request, the player
-- exists and is not hidden, they are in the room, and the room has not
-- expired (no use, presence included, for p_idle_hours). The room is
-- answered as it was before the sign of life. The answer:
-- { counters: [{ allowed, retry_after_seconds }], player: {...} or null,
--   room: {...} or null, touched: true or false }.
create or replace function public.online_room_poll(
  p_code text,
  p_token_hash text,
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer,
  p_now timestamptz,
  p_away boolean,
  p_idle_hours integer
)
returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare
  v_counters jsonb := '[]'::jsonb;
  v_allowed boolean := true;
  v_hit record;
  v_player jsonb;
  v_player_id uuid;
  v_hidden boolean;
  v_room jsonb;
  v_room_id uuid;
  v_last_use timestamptz;
  v_touched boolean := false;
begin
  if coalesce(array_length(p_keys, 1), 0) <> coalesce(array_length(p_limits, 1), 0) then
    raise exception 'online_room_poll: every counter needs a limit' using errcode = '22023';
  end if;

  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    select r.allowed, r.retry_after_seconds into v_hit from hit_rate_limit(p_keys[i], p_window_seconds, p_limits[i]) r;
    v_counters := v_counters || jsonb_build_array(jsonb_build_object('allowed', v_hit.allowed, 'retry_after_seconds', v_hit.retry_after_seconds));
    v_allowed := v_allowed and v_hit.allowed;
  end loop;

  if p_token_hash is not null then
    select jsonb_build_object('id', p.id, 'username', p.username, 'username_key', p.username_key, 'country', p.country,
             'avatar', p.avatar, 'hidden', p.hidden, 'username_changed_at', p.username_changed_at),
           p.id, p.hidden
      into v_player, v_player_id, v_hidden
      from players p
     where p.token_hash = p_token_hash;
    if v_player is null and to_regclass('public.player_tokens') is not null then
      execute
        'select jsonb_build_object(''id'', p.id, ''username'', p.username, ''username_key'', p.username_key, ''country'', p.country,
                ''avatar'', p.avatar, ''hidden'', p.hidden, ''username_changed_at'', p.username_changed_at), p.id, p.hidden
           from player_tokens t join players p on p.id = t.player_id
          where t.token_hash = $1'
        into v_player, v_player_id, v_hidden
        using p_token_hash;
    end if;
  end if;

  select r.id,
         jsonb_build_object(
           'id', r.id, 'code', r.code, 'host_id', r.host_id, 'device_hash', r.device_hash,
           'created_at', r.created_at, 'used_at', r.used_at, 'closed_at', r.closed_at, 'rematch_by', r.rematch_by,
           'online_members', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'player_id', m.player_id, 'seat', m.seat, 'username', m.username, 'avatar', m.avatar,
                      'country', m.country, 'seen_at', m.seen_at, 'away', m.away, 'left_at', m.left_at) order by m.seat)
               from online_members m
              where m.room_id = r.id), '[]'::jsonb),
           'online_matches', coalesce((
             select jsonb_agg(latest.game)
               from (select jsonb_build_object(
                              'id', g.id, 'number', g.number, 'black_id', g.black_id, 'white_id', g.white_id,
                              'moves', g.moves, 'starts_at', g.starts_at, 'finished', g.finished,
                              'winner_id', g.winner_id, 'reason', g.reason) as game
                       from online_matches g
                      where g.room_id = r.id
                      order by g.number desc
                      limit 1) latest), '[]'::jsonb)),
         greatest(r.used_at, (select max(m.seen_at) from online_members m where m.room_id = r.id))
    into v_room_id, v_room, v_last_use
    from online_rooms r
   where r.code = p_code;

  if v_allowed
     and v_player_id is not null
     and not v_hidden
     and v_room_id is not null
     and v_last_use >= p_now - make_interval(hours => p_idle_hours)
     and exists (select 1 from online_members m where m.room_id = v_room_id and m.player_id = v_player_id) then
    update online_members set seen_at = p_now, away = p_away where room_id = v_room_id and player_id = v_player_id;
    v_touched := true;
  end if;

  return jsonb_build_object('counters', v_counters, 'player', v_player, 'room', v_room, 'touched', v_touched);
end;
$$;

-- One more move in a game, and the room's last use, in one step: the game
-- is updated only while it still has p_expected moves, is not finished, and
-- is a game of p_room; the room is updated only when the game was. A
-- finishing move sets the result. Answers true when the move was stored.
create or replace function public.online_save_move(
  p_match uuid,
  p_room uuid,
  p_expected integer,
  p_moves jsonb,
  p_finished boolean,
  p_winner uuid,
  p_reason text,
  p_at timestamptz
)
returns boolean
language plpgsql volatile
set search_path = public
as $$
begin
  update online_matches
     set moves = p_moves,
         move_count = jsonb_array_length(p_moves),
         finished = p_finished,
         winner_id = case when p_finished then p_winner else winner_id end,
         reason = case when p_finished then p_reason else reason end,
         finished_at = case when p_finished then p_at else finished_at end
   where id = p_match
     and room_id = p_room
     and move_count = p_expected
     and finished = false;
  if not found then
    return false;
  end if;
  update online_rooms set used_at = p_at where id = p_room;
  return true;
end;
$$;

revoke execute on function public.online_room_poll(text, text, text[], integer[], integer, timestamptz, boolean, integer) from public, anon, authenticated;
revoke execute on function public.online_save_move(uuid, uuid, integer, jsonb, boolean, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.online_room_poll(text, text, text[], integer[], integer, timestamptz, boolean, integer) to service_role;
grant execute on function public.online_save_move(uuid, uuid, integer, jsonb, boolean, uuid, text, timestamptz) to service_role;

commit;
