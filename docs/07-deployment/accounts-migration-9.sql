begin;

-- Checkervia, migration 9 (D150): optional email login, so a player can save
-- their progress and log in again on another device. Run once, after
-- migrations 1 to 8. Never run it twice: a second run stops at once (the
-- first table already exists), and the transaction leaves nothing behind.
--
-- The email address itself lives only in Supabase Auth (auth.users). These
-- tables keep a keyed hash of it (for "one email, one profile" and the rate
-- limits) and a masked hint such as "a•••@g•••.com" for the profile screen.
--
-- Same security as every earlier migration: Row Level Security with no
-- policies, and no rights for anon and authenticated. Only the service role
-- (the Netlify functions) can read or write. Players never get a Supabase
-- session: the function checks the code, reads the user id and signs that
-- session out at once.

-- ---------------------------------------------------------------------------
-- 1. Which profile an email (Supabase Auth user) is linked to: one each way.
-- ---------------------------------------------------------------------------
create table public.player_accounts (
  player_id uuid primary key references public.players (id) on delete cascade,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email_hash text not null unique check (char_length(email_hash) = 64),
  email_hint text not null check (char_length(email_hint) between 3 and 80),
  linked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Extra device keys: a login on another device gets its own key, so the
--    first device keeps working. Only the SHA 256 of each key is kept.
-- ---------------------------------------------------------------------------
create table public.player_tokens (
  token_hash text primary key check (char_length(token_hash) = 64),
  player_id uuid not null references public.players (id) on delete cascade,
  device_hash text not null,
  created_at timestamptz not null default now()
);
create index player_tokens_player on public.player_tokens (player_id);

-- ---------------------------------------------------------------------------
-- 3. Saved shop collection and settings of a linked profile. Small and
--    bounded; never proof of paid ownership (D96).
-- ---------------------------------------------------------------------------
create table public.player_saves (
  player_id uuid primary key references public.players (id) on delete cascade,
  collection jsonb not null check (jsonb_typeof(collection) = 'object' and octet_length(collection::text) <= 8192),
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 8192),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. The latest code request per email: when it was sent, wrong attempts,
--    and whether our function made the Auth user for it (so one that is
--    never verified can be removed again).
-- ---------------------------------------------------------------------------
create table public.account_codes (
  email_hash text primary key check (char_length(email_hash) = 64),
  auth_user_id uuid,
  created_user boolean not null default false,
  requested_at timestamptz not null default now(),
  wrong_attempts integer not null default 0 check (wrong_attempts >= 0),
  used boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 5. Auth users to delete (with their email) through the Auth admin API.
--    A trigger fills it whenever a link goes, by any path: the player
--    removing their email, an admin deleting the profile, a cascade.
-- ---------------------------------------------------------------------------
create table public.account_erasures (
  auth_user_id uuid primary key,
  queued_at timestamptz not null default now()
);

create function public.account_queue_erasure()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into account_erasures (auth_user_id) values (old.auth_user_id) on conflict do nothing;
  return old;
end;
$$;

create trigger player_accounts_erase
after delete on public.player_accounts
for each row execute function public.account_queue_erasure();

-- Links a profile to an email in one step. 'profileLinked' when the profile
-- already has an email, 'emailTaken' when the email belongs to another
-- profile; nothing changes then.
create function public.account_link(p_player uuid, p_auth_user uuid, p_email_hash text, p_email_hint text)
returns text
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from player_accounts where player_id = p_player) then
    return 'profileLinked';
  end if;
  if exists (select 1 from player_accounts where auth_user_id = p_auth_user or email_hash = p_email_hash) then
    return 'emailTaken';
  end if;
  insert into player_accounts (player_id, auth_user_id, email_hash, email_hint) values (p_player, p_auth_user, p_email_hash, p_email_hint);
  delete from account_erasures where auth_user_id = p_auth_user;
  return 'linked';
exception when unique_violation then
  return 'emailTaken';
end;
$$;

-- Codes our function made an Auth user for, never verified within a day:
-- queue those users for deletion and forget the request.
create function public.account_queue_stale_codes(p_before timestamptz)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  with stale as (
    delete from account_codes c
    where c.requested_at < p_before
    returning c.auth_user_id, c.created_user
  ), queued as (
    insert into account_erasures (auth_user_id)
    select s.auth_user_id from stale s
    where s.created_user and s.auth_user_id is not null
      and not exists (select 1 from player_accounts a where a.auth_user_id = s.auth_user_id)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from queued;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Security: browser roles get nothing; only the service role may act.
-- ---------------------------------------------------------------------------
alter table public.player_accounts enable row level security;
alter table public.player_tokens enable row level security;
alter table public.player_saves enable row level security;
alter table public.account_codes enable row level security;
alter table public.account_erasures enable row level security;
revoke all on table public.player_accounts, public.player_tokens, public.player_saves, public.account_codes, public.account_erasures
  from anon, authenticated;

revoke execute on function public.account_queue_erasure() from public, anon, authenticated;
revoke execute on function public.account_link(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.account_queue_stale_codes(timestamptz) from public, anon, authenticated;
grant execute on function public.account_link(uuid, uuid, text, text) to service_role;
grant execute on function public.account_queue_stale_codes(timestamptz) to service_role;

commit;
