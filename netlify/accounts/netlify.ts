// Runs the account handler with the real dependencies (D150).
//
// Needs the leaderboard's SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// LEADERBOARD_HASH_SALT, plus SUPABASE_ANON_KEY (the publishable key, for
// Supabase Auth) and ACCOUNTS_ENABLED=1. ADMIN_EMAIL, when set, gets no
// player code. Until accounts are enabled, status says so and the game
// shows nothing new. No value is ever logged, only which names are missing.
import { unavailable } from "../leaderboard/http";
import { leaderboardRequest, toResponse } from "../leaderboard/netlify";
import type { NetlifyContext } from "../leaderboard/netlify";
import { newToken } from "../leaderboard/security";
import { createSupabaseStore } from "../leaderboard/supabaseStore";
import type { AccountDeps } from "./deps";
import { handleAccount } from "./handler";
import { createPlayerAuth } from "./playerAuth";
import { createSupabaseAccountStore } from "./supabaseAccountStore";

declare const process: { env: Record<string, string | undefined> };

const NEEDED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LEADERBOARD_HASH_SALT", "SUPABASE_ANON_KEY"] as const;
let deps: AccountDeps | null = null;

function configuredDeps(): AccountDeps | null {
  const missing = NEEDED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`account: not set: ${missing.join(", ")}`);
    return null;
  }
  const env = (name: (typeof NEEDED)[number]) => process.env[name]!.trim();
  deps ??= {
    enabled: process.env["ACCOUNTS_ENABLED"]?.trim() === "1",
    store: createSupabaseStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")),
    accounts: createSupabaseAccountStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")),
    auth: createPlayerAuth(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), env("SUPABASE_ANON_KEY")),
    adminEmail: process.env["ADMIN_EMAIL"]?.trim().toLowerCase() || null,
    salt: env("LEADERBOARD_HASH_SALT"),
    now: () => new Date(),
    newToken,
    log: (message) => console.error(message),
  };
  return deps;
}

export async function serveAccount(request: Request, context?: NetlifyContext): Promise<Response> {
  const ready = configuredDeps();
  if (!ready) return toResponse(unavailable());
  return toResponse(await handleAccount(await leaderboardRequest(request, context), ready));
}
