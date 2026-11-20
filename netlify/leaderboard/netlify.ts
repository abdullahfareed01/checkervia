// Turns a Netlify request into a LeaderboardRequest, runs the handler with
// the real dependencies and turns its answer into a Response. Each function
// in netlify/functions is one line that calls serve() with its handler (the
// online room functions call serveOnline(), which adds the room store).
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LEADERBOARD_HASH_SALT.
// Until they are set every function answers 503, and the screens show their
// calm "not available" panel.
import { DEVICE_HEADER } from "../../src/leaderboard/protocol";
import { unavailable } from "./http";
import type { LeaderboardDeps, LeaderboardHandler, LeaderboardRequest, LeaderboardResponse } from "./http";
import { newToken } from "./security";
import type { LeaderboardStore } from "./store";
import { createSupabaseStore } from "./supabaseStore";

// Minimal declarations so we do not need @types/node or @netlify/functions.
declare const process: { env: Record<string, string | undefined> };
export interface NetlifyContext {
  readonly ip?: string;
}

// One client per function instance, made on first use.
let store: LeaderboardStore | null = null;

/** The Supabase address and secret key, or null when they are not set. */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return url && key ? { url, key } : null;
}

function configuredStore(): LeaderboardStore | null {
  const config = supabaseConfig();
  if (!config) return null;
  store ??= createSupabaseStore(config.url, config.key);
  return store;
}

export function toResponse(result: LeaderboardResponse): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  const retryAfter = (result.body as { retryAfter?: unknown } | null)?.retryAfter;
  if (result.status === 429 && typeof retryAfter === "number") headers["retry-after"] = String(retryAfter);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

/** The parts of a Netlify request the handlers read. */
export async function leaderboardRequest(request: Request, context: NetlifyContext | undefined): Promise<LeaderboardRequest> {
  return {
    method: request.method,
    body: request.method === "POST" ? await request.text() : "",
    query: new URL(request.url).searchParams,
    authorization: request.headers.get("authorization"),
    deviceId: request.headers.get(DEVICE_HEADER),
    // Set by Netlify itself, so a visitor cannot choose it. No country is
    // taken from the request: the player always chooses their flag (D61).
    ip: context?.ip ?? request.headers.get("x-nf-client-connection-ip") ?? "unknown",
  };
}

/** The shared dependencies, or null (and a log line) when the settings are missing. */
export function leaderboardDeps(): LeaderboardDeps | null {
  const configured = configuredStore();
  const salt = process.env["LEADERBOARD_HASH_SALT"];
  if (!configured || !salt) {
    console.error("leaderboard: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or LEADERBOARD_HASH_SALT is not set");
    return null;
  }
  return { store: configured, salt, now: () => new Date(), newToken, log: (message) => console.error(message) };
}

export async function serve(request: Request, context: NetlifyContext | undefined, handler: LeaderboardHandler): Promise<Response> {
  const deps = leaderboardDeps();
  if (!deps) return toResponse(unavailable());
  return toResponse(await handler(await leaderboardRequest(request, context), deps));
}
