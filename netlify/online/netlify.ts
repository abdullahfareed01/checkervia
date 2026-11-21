// The online room functions' wrapper: the leaderboard's (the same settings,
// request and response) plus the room store on the same Supabase project,
// and the one round steps of migration 10 (D153), which fall back to the
// earlier steps while the database does not have them.
import { unavailable } from "../leaderboard/http";
import { leaderboardDeps, leaderboardRequest, supabaseConfig, toResponse } from "../leaderboard/netlify";
import type { NetlifyContext } from "../leaderboard/netlify";
import type { OnlineHandler } from "./http";
import type { OneRoundStore, OnlineStore } from "./store";
import { createSupabaseOneRound, createSupabaseOnlineStore } from "./supabaseStore";

let online: OnlineStore | null = null;
let oneRound: OneRoundStore | null = null;

export async function serveOnline(request: Request, context: NetlifyContext | undefined, handler: OnlineHandler): Promise<Response> {
  const deps = leaderboardDeps();
  const config = supabaseConfig();
  if (!deps || !config) return toResponse(unavailable());
  online ??= createSupabaseOnlineStore(config.url, config.key);
  oneRound ??= createSupabaseOneRound(config.url, config.key);
  const randomBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));
  return toResponse(await handler(await leaderboardRequest(request, context), { ...deps, online, oneRound, randomBytes }));
}
