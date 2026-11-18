-- A stand-in for migration 6's room tables (online rooms, D90 to D95), copied
-- from the online rooms work as it was on 16 Nov 2026, before it was merged.
-- tests/admin/pg.ts uses docs/07-deployment/leaderboard-migration-6.sql
-- instead as soon as that file exists in this branch.
create table public.online_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  host_id uuid not null references public.players (id) on delete cascade,
  device_hash text not null check (char_length(device_hash) <= 128),
  created_at timestamptz not null,
  used_at timestamptz not null,
  closed_at timestamptz,
  rematch_by uuid references public.players (id) on delete set null
);
create index online_rooms_open_host on public.online_rooms (host_id) where closed_at is null;
create index online_rooms_open_device on public.online_rooms (device_hash) where closed_at is null;
create index online_rooms_used on public.online_rooms (used_at);

-- The two players of a room (seat 0 made it), with what the other player
-- sees of them, copied when they joined, and their last sign of life.
create table public.online_members (
  room_id uuid not null references public.online_rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  seat smallint not null check (seat in (0, 1)),
  username text not null check (char_length(username) between 1 and 32),
  avatar text check (char_length(avatar) <= 16),
  country text check (country ~ '^[A-Z]{2}$'),
  seen_at timestamptz not null,
  away boolean not null default false,
  left_at timestamptz,
  primary key (room_id, player_id),
  unique (room_id, seat)
);
create index online_members_player on public.online_members (player_id);

-- Each game in a room: the colours, every move (start square then landing
-- squares, each 0 to 63; checked by the functions with the rules engine
-- before it is stored), and how it ended. move_count lets a move be stored
-- only if no other move came first.
create table public.online_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.online_rooms (id) on delete cascade,
  number integer not null check (number >= 1),
  black_id uuid not null references public.players (id) on delete cascade,
  white_id uuid not null references public.players (id) on delete cascade,
  moves jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 600),
  move_count integer not null default 0,
  starts_at timestamptz not null,
  finished boolean not null default false,
  winner_id uuid references public.players (id) on delete set null,
  reason text check (reason in ('board', 'resign', 'forfeit', 'left')),
  finished_at timestamptz,
  unique (room_id, number),
  check (black_id <> white_id),
  check (move_count = jsonb_array_length(moves)),
  check (finished = (reason is not null))
);

-- Emote reactions, sent from a fixed list (no free text).
create table public.online_emotes (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.online_rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  emote text not null check (emote ~ '^[a-z]{2,16}$'),
  created_at timestamptz not null
);
create index online_emotes_room on public.online_emotes (room_id, id);

-- A player's report of their opponent, kept for a person to look at. One
-- per reporter, opponent and room. The room code stays after the room is
-- deleted, so the report can still be read.
create table public.online_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.players (id) on delete cascade,
  reported_id uuid not null references public.players (id) on delete cascade,
  room_code text not null check (room_code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  reason text not null check (reason in ('spam', 'stalling', 'name', 'other')),
  created_at timestamptz not null,
  reviewed_at timestamptz,
  unique (reporter_id, reported_id, room_code),
  check (reporter_id <> reported_id)
);
create index online_reports_created on public.online_reports (created_at);

-- Blocks: a blocked player cannot join the blocker's rooms (nor the other
-- way round), and their reactions are not shown.
