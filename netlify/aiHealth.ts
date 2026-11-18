// Metadata checks make no model request and return only a readiness boolean.
// Endpoints: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key
// and https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits.
import type { HandlerEnv } from "./aiMoveHandler";

export const HEALTH_CACHE_MS = 30_000;
export const HEALTH_PROVIDER_TIMEOUT_MS = 3_000;

async function readiness(env: HandlerEnv, send: typeof fetch): Promise<boolean> {
  if (!env.OPENROUTER_API_KEY || !env.LLM_MODEL) return false;
  const headers = { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` };
  const signal = AbortSignal.timeout(HEALTH_PROVIDER_TIMEOUT_MS);
  try {
    const [keyResponse, creditsResponse] = await Promise.all(["key", "credits"].map((path) =>
      send(`https://openrouter.ai/api/v1/${path}`, { method: "GET", headers, signal }),
    ));
    if (!keyResponse!.ok || !creditsResponse!.ok) return false;
    const key: unknown = await keyResponse!.json();
    const credits: unknown = await creditsResponse!.json();
    const remaining = (key as { data?: { limit_remaining?: unknown } } | null)?.data?.limit_remaining;
    const account = (credits as { data?: { total_credits?: unknown; total_usage?: unknown } } | null)?.data;
    // null is an uncapped key; missing or malformed values are not proof of readiness.
    const keyReady = remaining === null || (typeof remaining === "number" && Number.isFinite(remaining) && remaining > 0);
    return keyReady && typeof account?.total_credits === "number" && Number.isFinite(account.total_credits)
      && typeof account.total_usage === "number" && Number.isFinite(account.total_usage)
      && account.total_credits > account.total_usage;
  } catch {
    return false;
  }
}

/** One cache per function instance, shared by concurrent health requests. */
export function createAiHealthCheck(send: typeof fetch, now: () => number = Date.now): (env: HandlerEnv) => Promise<boolean> {
  let cached: { key: string | undefined; model: string | undefined; expires: number; answer: Promise<boolean> } | undefined;
  return (env) => {
    if (!cached || cached.key !== env.OPENROUTER_API_KEY || cached.model !== env.LLM_MODEL || cached.expires <= now()) {
      cached = { key: env.OPENROUTER_API_KEY, model: env.LLM_MODEL, expires: now() + HEALTH_CACHE_MS, answer: readiness(env, send) };
    }
    return cached.answer;
  };
}
