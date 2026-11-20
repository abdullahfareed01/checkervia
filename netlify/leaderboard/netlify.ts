// Turns a Netlify request into a LeaderboardRequest, runs the handler with
// the real dependencies and turns its answer into a Response. Each function
// in netlify/functions is one line that calls serve() with its handler.
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LEADERBOARD_HASH_SALT.
// Until they are set every function answers 503, and the screens show their
// calm "not available" panel.
import { DEVICE_HEADER } from "../../src/leaderboard/protocol";
import { unavailable } from "./http";
import type { LeaderboardHandler, LeaderboardRequest, LeaderboardResponse } from "./http";
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

function configuredStore(): LeaderboardStore | null {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  store ??= createSupabaseStore(url, key);
  return store;
}

export function toResponse(result: LeaderboardResponse): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  const retryAfter = (result.body as { retryAfter?: unknown } | null)?.retryAfter;
  if (result.status === 429 && typeof retryAfter === "number") headers["retry-after"] = String(retryAfter);
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

export async function serve(request: Request, context: NetlifyContext | undefined, handler: LeaderboardHandler): Promise<Response> {
  const configured = configuredStore();
  const salt = process.env["LEADERBOARD_HASH_SALT"];
  if (!configured || !salt) {
    console.error("leaderboard: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or LEADERBOARD_HASH_SALT is not set");
    return toResponse(unavailable());
  }

  const result = await handler(await leaderboardRequest(request, context), { store: configured, salt, now: () => new Date(), newToken, log: (message) => console.error(message) });
  return toResponse(result);
}

/** The parts of a Netlify request a handler may use. */
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
