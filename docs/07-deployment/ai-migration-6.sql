-- Run once in Supabase SQL Editor after migrations 1–5. No game tables change.
begin;

create table if not exists public.ai_provider_cooldowns (
  provider text primary key check (provider ~ '^[a-z0-9-]{1,48}$'),
  cooldown_until timestamptz not null,
  last_error_code text not null check (length(last_error_code) <= 32),
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_cooldowns enable row level security;
revoke all on public.ai_provider_cooldowns from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_cooldowns to service_role;

-- Concurrent functions must not shorten a cooldown written by another instance.
create or replace function public.set_ai_provider_cooldown(p_provider text, p_until timestamptz, p_code text)
returns void language sql security invoker set search_path = public
as $$
  insert into public.ai_provider_cooldowns(provider, cooldown_until, last_error_code, updated_at)
  values (p_provider, p_until, p_code, now())
  on conflict (provider) do update set
    cooldown_until = greatest(ai_provider_cooldowns.cooldown_until, excluded.cooldown_until),
    last_error_code = case when excluded.cooldown_until >= ai_provider_cooldowns.cooldown_until then excluded.last_error_code else ai_provider_cooldowns.last_error_code end,
    updated_at = now();
$$;
revoke all on function public.set_ai_provider_cooldown(text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_ai_provider_cooldown(text, timestamptz, text) to service_role;

commit;
