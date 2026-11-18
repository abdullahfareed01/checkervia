// What the admin functions share (D100): the request they get (free of
// Netlify types, so tests can build one), their dependencies, short error
// answers, body parsing with a size limit, the same site checks and the
// rate limits. Tokens, passwords, codes and cookies are never logged.
import { ADMIN_MARKER_HEADER, ADMIN_MARKER_VALUE } from "../../src/admin/protocol";
import type { AdminError } from "../../src/admin/protocol";
import { saltedHash } from "../leaderboard/security";
import type { AuthApi } from "./gotrue";
import type { AdminStore } from "./store";

export interface AdminRequest {
  readonly method: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>; // lower case names
  readonly ip: string; // set by Netlify, so a visitor cannot choose it
}

export interface AdminDeps {
  readonly store: AdminStore;
  readonly auth: AuthApi;
  readonly adminEmail: string; // ADMIN_EMAIL
  readonly salt: string; // LEADERBOARD_HASH_SALT, for the IP's keyed hash
  readonly now: () => Date;
  readonly log: (message: string) => void;
}

export interface AdminResponse {
  readonly status: number;
  readonly body: unknown;
  readonly setCookie?: string;
}

export const ok = (body: unknown, extra: Partial<AdminResponse> = {}): AdminResponse => ({ status: 200, body, ...extra });

export function fail(status: number, code: string, error: string, extra: Partial<AdminError> & { setCookie?: string } = {}): AdminResponse {
  const { setCookie, ...rest } = extra;
  const body: AdminError = { error, code, ...rest };
  return setCookie ? { status, body, setCookie } : { status, body };
}

export const invalid = () => fail(400, "invalid", "Invalid request.");
export const unavailable = () => fail(503, "unavailable", "The admin service is not available right now.");
export const noSession = (setCookie?: string) => fail(401, "noSession", "Please sign in again.", setCookie ? { setCookie } : {});
export const notAdmin = () => fail(403, "notAdmin", "This account may not use the admin dashboard.");

/** The JSON object in the body, with only the allowed keys, or null. */
export function parseBody(raw: string, maxChars: number, keys: readonly string[]): Record<string, unknown> | null {
  if (raw.length === 0 || raw.length > maxChars) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return Object.keys(data).every((key) => keys.includes(key)) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The request came from our own page: it carries the admin header (which a
 * page on another site cannot add without the browser asking first), and
 * the browser's own Origin and Sec-Fetch-Site headers, when sent, say the
 * same site.
 */
export function fromOwnPage(request: AdminRequest): boolean {
  if (request.headers[ADMIN_MARKER_HEADER] !== ADMIN_MARKER_VALUE) return false;
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return false;
  const origin = request.headers["origin"];
  const host = request.headers["host"];
  if (origin !== undefined && host !== undefined) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export const ipHashOf = (request: AdminRequest, deps: AdminDeps) => saltedHash(deps.salt, "ip", request.ip);

export interface AdminLimit {
  readonly windowSeconds: number;
  readonly perIp: number;
  readonly perUser?: number;
}

/** Counts one request against the limit for `name`; a 429 answer when it is used up, else null. */
export async function rateLimited(name: string, limit: AdminLimit, keys: { ipHash: string; userId?: string }, deps: AdminDeps): Promise<AdminResponse | null> {
  const checks = [deps.store.hitRateLimit(`admin:${name}:ip:${keys.ipHash}`, limit.windowSeconds, limit.perIp)];
  if (limit.perUser !== undefined && keys.userId) checks.push(deps.store.hitRateLimit(`admin:${name}:user:${keys.userId}`, limit.windowSeconds, limit.perUser));
  const refused = (await Promise.all(checks)).filter((result) => !result.allowed);
  if (refused.length === 0) return null;
  const retryAfter = Math.max(...refused.map((result) => result.retryAfterSeconds));
  return fail(429, "rateLimited", "Too many attempts. Please wait a moment.", { retryAfter });
}

/** Runs a handler and turns any storage failure into a calm 503, logging only the error's code. */
export async function guarded(name: string, deps: AdminDeps, run: () => Promise<AdminResponse>): Promise<AdminResponse> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    deps.log(`admin ${name}: storage error${typeof code === "string" ? ` ${code.slice(0, 20)}` : ""}`);
    return unavailable();
  }
}
