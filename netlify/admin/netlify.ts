// Turns a Netlify request into an AdminRequest, runs the admin handler with
// the real dependencies and returns its answer with strict headers: no
// caching, no indexing, no framing, no sniffing, and the refresh cookie when
// there is one. Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_ANON_KEY (the publishable key, for Supabase Auth), ADMIN_EMAIL
// and LEADERBOARD_HASH_SALT; until they are all set every admin function
// answers 503 and the log names the missing ones (never their values).
import { unavailable } from "./http";
import type { AdminDeps, AdminRequest, AdminResponse } from "./http";
import { createAuthApi } from "./gotrue";
import { createSupabaseAdminStore } from "./supabaseAdminStore";

declare const process: { env: Record<string, string | undefined> };
interface NetlifyContext {
  readonly ip?: string;
}

const NEEDED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "ADMIN_EMAIL", "LEADERBOARD_HASH_SALT"] as const;

export const ADMIN_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
};

let deps: AdminDeps | null = null;

function configuredDeps(): AdminDeps | null {
  const missing = NEEDED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(`admin: not set: ${missing.join(", ")}`);
    return null;
  }
  const env = (name: (typeof NEEDED)[number]) => process.env[name]!.trim();
  deps ??= {
    store: createSupabaseAdminStore(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY")),
    auth: createAuthApi(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY")),
    adminEmail: env("ADMIN_EMAIL").toLowerCase(),
    salt: env("LEADERBOARD_HASH_SALT"),
    now: () => new Date(),
    log: (message) => console.error(message),
  };
  return deps;
}

export function toResponse(result: AdminResponse): Response {
  const headers = new Headers(ADMIN_RESPONSE_HEADERS);
  if (result.setCookie) headers.set("set-cookie", result.setCookie);
  const retryAfter = (result.body as { retryAfter?: unknown } | null)?.retryAfter;
  if (result.status === 429 && typeof retryAfter === "number") headers.set("retry-after", String(retryAfter));
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

export async function adminRequest(request: Request, context: NetlifyContext | undefined): Promise<AdminRequest> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return {
    method: request.method,
    // Read at most a little more than any handler accepts.
    body: request.method === "POST" ? (await request.text()).slice(0, 8000) : "",
    headers,
    ip: context?.ip ?? request.headers.get("x-nf-client-connection-ip") ?? "unknown",
  };
}

export async function serveAdmin(
  request: Request,
  context: NetlifyContext | undefined,
  handler: (request: AdminRequest, deps: AdminDeps) => Promise<AdminResponse>,
): Promise<Response> {
  const ready = configuredDeps();
  if (!ready) return toResponse(unavailable());
  return toResponse(await handler(await adminRequest(request, context), ready));
}
