// Read-only schema probes. Never print keys or fetch player records.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const local = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const env = { ...local, ...process.env };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env.");
  process.exit(1);
}
const headers = { apikey: key };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
const nobody = "00000000-0000-4000-8000-000000000000";
const probes = [
  ["1: core results", "/game_results?select=id,player_id,game_id,level,result&limit=0"],
  ["2: avatars and renames", "/players?select=avatar,username_changed_at&limit=0"],
  ["2: reserved names", "/username_reservations?select=username_key&limit=0"],
  ["3: resignations", "/game_results?select=resigned&limit=0"],
  ["3: profile resignations", `/rpc/player_level_stats?p_player=${nobody}&select=resigned&limit=0`],
  ["4: conduct columns", "/players?select=reports_active,suspended_until&limit=0"],
  ["4: reports", "/player_reports?select=game_id&limit=0"],
  ["4: conduct function", `/rpc/player_conduct?p_player=${nobody}&limit=0`],
  ["5: AI draws", "/rpc/ai_record?select=draws&limit=0"],
  ["5: profile draws", `/rpc/player_level_stats?p_player=${nobody}&select=draws&limit=0`],
  ["6: AI provider cooldowns", "/ai_provider_cooldowns?select=provider,cooldown_until,last_error_code,updated_at&limit=0"],
];

const results = await Promise.all(probes.map(async ([name, path]) => {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    return { check: name, ok: response.ok, status: response.status, code: response.ok ? "" : String(body.code ?? "unknown") };
  } catch {
    return { check: name, ok: false, status: "network error", code: "" };
  }
}));
console.table(results);
if (results.some((result) => !result.ok)) process.exitCode = 1;
console.log("These probes check columns and read functions. Use Supabase SQL or MCP to verify constraints, RLS, grants and migration history.");
