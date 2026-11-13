// What every leaderboard handler shares: the request it gets (free of
// Netlify types, so tests can build one), its dependencies, clean error
// responses, body parsing with a size limit, the token check and the rate
// limits.
//
// Rules: errors are short and generic; tokens, device ids and IP addresses
// are never logged or returned (only the token, once, by claimUsername);
// storage errors are logged by their code only.
import { isCountryCode } from "../../src/leaderboard/countries";
import { DEVICE_ID_PATTERN } from "../../src/leaderboard/protocol";
import type { CountryChoice, ErrorResponse } from "../../src/leaderboard/protocol";
import { bearerToken, saltedHash, sha256Hex } from "./security";
import type { LeaderboardStore, PlayerRecord } from "./store";

export interface LeaderboardRequest {
  readonly method: string;
  readonly body: string;
  readonly query: URLSearchParams;
  readonly authorization: string | null;
  readonly deviceId: string | null;
  // Set by Netlify itself, so a visitor cannot choose them.
  readonly ip: string;
  readonly geoCountry: string | null;
}

export interface LeaderboardDeps {
  readonly store: LeaderboardStore;
  readonly salt: string;
  readonly now: () => Date;
  readonly newToken: () => string;
  readonly log: (message: string) => void;
}

export interface LeaderboardResponse {
  readonly status: number;
  readonly body: unknown;
}

export type LeaderboardHandler = (request: LeaderboardRequest, deps: LeaderboardDeps) => Promise<LeaderboardResponse>;

export const ok = (body: unknown, status = 200): LeaderboardResponse => ({ status, body });

export function fail(status: number, code: string, error: string, retryAfter?: number): LeaderboardResponse {
  const body: ErrorResponse = retryAfter === undefined ? { error, code } : { error, code, retryAfter };
  return { status, body };
}

export const invalid = () => fail(400, "invalid", "Invalid request.");
export const unavailable = () => fail(503, "unavailable", "The leaderboard is not available right now.");

/** The JSON object in the body, with only the allowed keys, or null. */
export function parseBody(raw: string, maxChars: number, keys: readonly string[]): Record<string, unknown> | null {
  if (raw.length === 0 || raw.length > maxChars) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return Object.keys(record).every((key) => keys.includes(key)) ? record : null;
}

export function isCountryChoice(value: unknown): value is CountryChoice {
  return value === null || value === "auto" || isCountryCode(value);
}

/** The country to store for a choice: "auto" takes the one Netlify saw, if it is in our list. */
export function resolveCountry(choice: CountryChoice, geoCountry: string | null): string | null {
  if (choice === "auto") return isCountryCode(geoCountry) ? geoCountry : null;
  return choice;
}

export interface Limit {
  readonly windowSeconds: number;
  readonly perDevice?: number; // requests per window from one device
  readonly perIp: number; // requests per window from one IP address
}

/**
 * Counts the request against the device's and the IP's limits for `action`.
 * Returns a 429 response when either is used up, else null.
 */
export async function checkRateLimits(
  action: string,
  limit: Limit,
  request: LeaderboardRequest,
  deps: LeaderboardDeps,
): Promise<LeaderboardResponse | null> {
  const checks = [deps.store.hitRateLimit(`${action}:ip:${await saltedHash(deps.salt, "ip", request.ip)}`, limit.windowSeconds, limit.perIp)];
  if (limit.perDevice !== undefined && request.deviceId !== null) {
    const device = await saltedHash(deps.salt, "device", request.deviceId);
    checks.push(deps.store.hitRateLimit(`${action}:device:${device}`, limit.windowSeconds, limit.perDevice));
  }
  const refused = (await Promise.all(checks)).filter((result) => !result.allowed);
  if (refused.length === 0) return null;
  const retryAfter = Math.max(...refused.map((result) => result.retryAfterSeconds));
  return fail(429, "rateLimited", "Too many requests. Please wait a moment.", retryAfter);
}

/** The device id header, if it has the right shape. */
export const validDevice = (request: LeaderboardRequest) => request.deviceId !== null && DEVICE_ID_PATTERN.test(request.deviceId);

/** The player who owns the bearer token, or null (no token, a malformed one, or an unknown or hidden player). */
export async function playerFromToken(request: LeaderboardRequest, store: LeaderboardStore): Promise<PlayerRecord | null> {
  const token = bearerToken(request.authorization);
  if (token === null) return null;
  const player = await store.playerByTokenHash(await sha256Hex(token));
  return player && !player.hidden ? player : null;
}

export const notSignedIn = () => fail(401, "noProfile", "No leaderboard profile on this device.");

/**
 * Runs a handler body and turns any storage failure into a calm 503. Only
 * the error's code is logged, never its message (which can quote values).
 */
export async function guarded(name: string, deps: LeaderboardDeps, run: () => Promise<LeaderboardResponse>): Promise<LeaderboardResponse> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    deps.log(`leaderboard ${name}: storage error${typeof code === "string" ? ` ${code.slice(0, 20)}` : ""}`);
    return unavailable();
  }
}
