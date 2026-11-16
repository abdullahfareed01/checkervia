// The online room functions' wrapper: the leaderboard's (the same settings,
// request and response) plus the room store on the same Supabase project.
import { unavailable } from "../leaderboard/http";
import { leaderboardDeps, leaderboardRequest, supabaseConfig, toResponse } from "../leaderboard/netlify";
import type { NetlifyContext } from "../leaderboard/netlify";
import type { OnlineHandler } from "./http";
import type { OnlineStore } from "./store";
import { createSupabaseOnlineStore } from "./supabaseStore";

let online: OnlineStore | null = null;

export async function serveOnline(request: Request, context: NetlifyContext | undefined, handler: OnlineHandler): Promise<Response> {
  const deps = leaderboardDeps();
  const config = supabaseConfig();
  if (!deps || !config) return toResponse(unavailable());
  online ??= createSupabaseOnlineStore(config.url, config.key);
  const randomBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));
  return toResponse(await handler(await leaderboardRequest(request, context), { ...deps, online, randomBytes }));
}
