import type { Env, Provider } from "./providers";
import { within } from "./deadline";
// Cross-region cold connections need more than a 125ms write window. These
// bounds still consume the same overall chain budget, never extra turn time.
export const COOLDOWN_READ_TIMEOUT_MS = 500;
export const COOLDOWN_WRITE_TIMEOUT_MS = 750;
export interface Cooldown { provider: string; cooldownUntil: number; lastErrorCode: string; updatedAt: number }
export interface CooldownStore {
  read(budgetMs?: number): Promise<ReadonlyMap<string, Cooldown>>;
  cool(value: Cooldown, budgetMs?: number): Promise<void>;
}

export function createCooldownStore(env: Env, send: typeof fetch, now: () => number = Date.now): CooldownStore {
  const memory = new Map<string, Cooldown>();
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const merge = (row: Cooldown) => {
    if (row.cooldownUntil > now() && row.cooldownUntil > (memory.get(row.provider)?.cooldownUntil ?? 0)) memory.set(row.provider, row);
  };
  const headers: Record<string, string> = { apikey: key ?? "", "Content-Type": "application/json" };
  // New Supabase keys are not JWTs. Sending one as a Bearer token makes
  // PostgREST reject a valid secret; only legacy keys use that fallback.
  if (key && !key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
  return {
    async read(budgetMs = COOLDOWN_READ_TIMEOUT_MS) {
      for (const [id, row] of memory) if (row.cooldownUntil <= now()) memory.delete(id);
      if (url && key && budgetMs > 0) {
        try {
          await within(Math.min(COOLDOWN_READ_TIMEOUT_MS, budgetMs), async signal => {
            const response = await send(`${url}/rest/v1/ai_provider_cooldowns?select=provider,cooldown_until,last_error_code,updated_at`, { headers, signal });
            if (!response.ok) return;
            const rows: unknown = await response.json();
            if (Array.isArray(rows)) for (const r of rows) {
              if (r && typeof r.provider === "string" && /^[a-z0-9-]{1,48}$/.test(r.provider) && typeof r.last_error_code === "string") {
                const until = Date.parse(r.cooldown_until), updated = Date.parse(r.updated_at);
                if (Number.isFinite(until) && Number.isFinite(updated)) merge({ provider: r.provider, cooldownUntil: until, lastErrorCode: r.last_error_code, updatedAt: updated });
              }
            }
          });
        } catch { /* Shared state is best effort. Local cooldowns still apply. */ }
      }
      return new Map(memory);
    },
    async cool(row, budgetMs = COOLDOWN_WRITE_TIMEOUT_MS) {
      merge(row);
      if (!url || !key || budgetMs <= 0) return;
      try {
        await within(Math.min(COOLDOWN_WRITE_TIMEOUT_MS, budgetMs), async signal => {
          await send(`${url}/rest/v1/rpc/set_ai_provider_cooldown`, {
            method: "POST", headers, signal,
            body: JSON.stringify({ p_provider: row.provider, p_until: new Date(row.cooldownUntil).toISOString(), p_code: row.lastErrorCode }),
          });
        });
      } catch { /* Never turn a database outage into a failed game. */ }
    },
  };
}

export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function nextPacificMidnight(now: number): number {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = formatter.format(now);
  // Midnight is the first instant in the next local date. Binary search
  // handles 23/25 hour DST days without hardcoding an offset.
  let lo = now, hi = now + 26 * 60 * 60 * 1000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (formatter.format(mid) === day) lo = mid; else hi = mid;
  }
  return hi;
}

function resetInstant(raw: string | null, now: number): number | undefined {
  if (!raw) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return n >= 1e12 ? n : n >= 1e9 ? n * 1000 : now + n * 1000;
  }
  if (/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/.test(raw)) {
    let ms = 0;
    for (const match of raw.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)) ms += Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]!] ?? 0);
    return now + ms;
  }
  const date = Date.parse(raw);
  return Number.isFinite(date) ? date : undefined;
}

export function cooldownUntil(p: Provider, headers: Headers, body: unknown, now: number): number {
  const explicit: number[] = [];
  const add = (raw: string | null) => { const value = resetInstant(raw, now); if (value !== undefined && Number.isFinite(value) && value > now && value <= 8.64e15) explicit.push(value); };
  const retry = headers.get("retry-after");
  if (retry !== null) {
    // Retry-After numeric values are always seconds, even very large ones.
    const n = Number(retry);
    if (retry.trim() && Number.isFinite(n) && n >= 0) {
      const until = now + Math.max(1, n * 1000);
      if (Number.isFinite(until) && until <= 8.64e15) explicit.push(until);
    } else add(retry);
  }
  for (const suffix of ["requests", "tokens", "requests-day", "tokens-day"]) {
    const remaining = headers.get(`x-ratelimit-remaining-${suffix}`);
    if (remaining !== null && Number(remaining) <= 0) add(headers.get(`x-ratelimit-reset-${suffix}`));
  }
  // Generic resets are meaningful on a limit response even without remaining.
  add(headers.get("ratelimit-reset"));
  add(headers.get("x-ratelimit-reset"));
  if (!explicit.length) {
    for (const suffix of ["requests-day", "tokens-day", "requests", "tokens"]) {
      if (headers.get(`x-ratelimit-remaining-${suffix}`) === null) add(headers.get(`x-ratelimit-reset-${suffix}`));
    }
  }
  const inspect = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 6) return;
    for (const [key, v] of Object.entries(value).slice(0, 50)) {
      if (/^(resets_at|reset_at|reset_time|retryAfter|retry_after|retryDelay)$/i.test(key) && (typeof v === "string" || typeof v === "number")) add(String(v));
      else if (typeof v === "object") inspect(v, depth + 1);
    }
  };
  inspect(body, 0);
  if (explicit.length) return Math.max(...explicit);
  const description = JSON.stringify(body ?? "").slice(0, 20000);
  const daily = /daily|per[ _-]?day|\brpd\b|\btpd\b|neurons|free.*day/i.test(description);
  const minute = /per[ _-]?minute|\brpm\b|\btpm\b/i.test(description);
  if (minute && !daily) return now + 5 * 60000;
  if (p.reset === "pacific-day") return nextPacificMidnight(now);
  if (p.reset === "utc-day" || daily) return nextUtcMidnight(now);
  return now + 5 * 60000;
}
