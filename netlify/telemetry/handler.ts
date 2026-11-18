import { DEVICE_HEADER, DEVICE_ID_PATTERN } from "../../src/leaderboard/protocol";
import { isCountryCode } from "../../src/leaderboard/countries";
import { PRESENCE_HEADER, PRESENCE_TTL_SECONDS } from "../../src/telemetry/protocol";
import { saltedHash } from "../leaderboard/security";
export interface TrafficStore { call(name: string, params: Record<string, unknown>): Promise<boolean> }
export interface TrafficDeps { store: TrafficStore; salt: string; now: () => Date }
const answer = (status: number, retry?: number) => new Response(null, { status, headers: {
  "cache-control": "no-store", "x-content-type-options": "nosniff", ...(retry ? { "retry-after": String(retry) } : {}),
} });
/** One atomic, rate-limited database call per event; never blocks gameplay. */
export async function handleTraffic(request: Request, ip: string, deps: TrafficDeps): Promise<Response> {
  if (request.method !== "POST") return answer(405);
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get(PRESENCE_HEADER) !== "1" || (site && site !== "same-origin")) return answer(403);
  const origin = request.headers.get("origin");
  try { if (origin && new URL(origin).origin !== new URL(request.url).origin) return answer(403); } catch { return answer(403); }
  const device = request.headers.get(DEVICE_HEADER);
  if (!device || !DEVICE_ID_PATTERN.test(device)) return answer(400);
  let data: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 1024) return answer(413);
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return answer(400);
    data = raw as Record<string, unknown>;
  } catch { return answer(400); }
  const action = data["action"];
  if (typeof action !== "string" || !["visit", "beat", "end"].includes(action)) return answer(400);
  const allowed = action === "beat" ? ["action", "mode", "level", "country"] : ["action"];
  if (!Object.keys(data).every((key) => allowed.includes(key))) return answer(400);
  if (action === "beat") {
    const mode = data["mode"], level = data["level"], country = data["country"];
    if ((mode !== "ai" && mode !== "two") || (mode === "ai" ? ![1, 2, 3, 4].includes(level as number) : level !== null) || (country !== null && !isCountryCode(country))) return answer(400);
  }
  try {
    const ipHash = await saltedHash(deps.salt, "ip", ip);
    const session = await saltedHash(deps.salt, "device", `presence:${device}`);
    let accepted: boolean;
    if (action === "visit") {
      const day = deps.now().toISOString().slice(0, 10);
      const mark = await saltedHash(deps.salt, "device", `visit:${day}:${device}`);
      accepted = await deps.store.call("count_visit", { p_day: day, p_mark: mark, p_rate_key: `visit:${ipHash}`, p_limit: 1000 });
    } else if (action === "end") {
      accepted = await deps.store.call("game_presence_end", { p_session: session, p_rate_key: `presence:${ipHash}`, p_limit: 120 });
    } else {
      accepted = await deps.store.call("presence_beat", { p_session: session, p_mode: data["mode"], p_level: data["level"],
        p_country: data["country"], p_ttl_seconds: PRESENCE_TTL_SECONDS, p_rate_key: `presence:${ipHash}`, p_limit: 120 });
    }
    return accepted ? answer(204) : answer(429, action === "visit" ? 3600 : 60);
  } catch { return answer(503, 300); }
}
