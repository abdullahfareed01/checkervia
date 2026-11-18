import { createClient } from "@supabase/supabase-js";
import { handleTraffic } from "../telemetry/handler";
import type { TrafficStore } from "../telemetry/handler";
import { withKeyHeaders } from "../leaderboard/supabaseStore";
declare const process: { env: Record<string, string | undefined> };
let store: TrafficStore | undefined;
export default async (request: Request, context?: { ip?: string }): Promise<Response> => {
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_SERVICE_ROLE_KEY"], salt = process.env["LEADERBOARD_HASH_SALT"];
  if (!url || !key || !salt) return new Response(null, { status: 503, headers: { "cache-control": "no-store", "retry-after": "300" } });
  if (!store) {
    const fetcher = withKeyHeaders((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(3000) }), key.trim());
    const db = createClient(url.trim(), key.trim(), { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
    store = { async call(name, params) { const { data, error } = await db.rpc(name, params); if (error) throw new Error("storage unavailable"); return data === true; } };
  }
  return handleTraffic(request, context?.ip ?? request.headers.get("x-nf-client-connection-ip") ?? "unknown", { store, salt, now: () => new Date() });
};
