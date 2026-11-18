// Supabase Auth, called from the admin functions only (D100). The page never
// talks to Supabase: the password, the codes and the tokens pass through our
// functions, which add rate limits and the audit log. The project's
// publishable (anon) key is enough here and stays on the server too.
//
// No token, password or code is ever logged or put in an error; a failure
// carries only the status and Supabase's error code.

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number; // seconds since 1970
}

export interface AuthFactor {
  readonly id: string;
  readonly type: string; // "totp", "phone", "webauthn"
  readonly status: "verified" | "unverified";
}

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly factors: readonly AuthFactor[];
}

export interface TotpEnrollment {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

export type AuthResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number; readonly code: string };

export interface AuthApi {
  signIn(email: string, password: string): Promise<AuthResult<AuthSession>>;
  refresh(refreshToken: string): Promise<AuthResult<AuthSession>>;
  /** Checks the access token with Supabase (signature, expiry, a session not signed out) and returns its user. */
  user(accessToken: string): Promise<AuthResult<AuthUser>>;
  enrollTotp(accessToken: string, issuer: string): Promise<AuthResult<TotpEnrollment>>;
  deleteFactor(accessToken: string, factorId: string): Promise<AuthResult<null>>;
  /** A challenge and its answer in one go; the new session has the second factor (aal2). */
  verifyTotp(accessToken: string, factorId: string, code: string): Promise<AuthResult<AuthSession>>;
  /** Signs out every session of the user. */
  signOut(accessToken: string): Promise<AuthResult<null>>;
  /** Whether new sign ups are turned off in the project; null when it cannot be read. */
  signupsDisabled(): Promise<boolean | null>;
}

interface TokenBody {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
}

function session(body: TokenBody): AuthSession | null {
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") return null;
  const expiresAt = typeof body.expires_at === "number" ? body.expires_at : Math.floor(Date.now() / 1000) + (typeof body.expires_in === "number" ? body.expires_in : 3600);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt };
}

// An answer whose body does not matter (204 No Content, for example).
async function done(result: Promise<AuthResult<boolean>>): Promise<AuthResult<null>> {
  const answer = await result;
  return answer.ok ? { ok: true, value: null } : answer;
}

export function createAuthApi(url: string, publishableKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): AuthApi {
  const base = `${url.replace(/\/+$/, "")}/auth/v1`;
  const key = publishableKey.trim();

  async function call<T>(path: string, init: { method: string; token?: string; body?: unknown }, read: (body: any) => T | null): Promise<AuthResult<T>> {
    const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
    if (init.token) headers["authorization"] = `Bearer ${init.token}`;
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, status: 503, code: "network" };
    }
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const code = typeof body?.error_code === "string" ? body.error_code : typeof body?.error === "string" ? body.error : "error";
      return { ok: false, status: response.status, code: code.slice(0, 40) };
    }
    const value = read(body ?? {});
    return value === null ? { ok: false, status: 502, code: "unreadable" } : { ok: true, value };
  }

  return {
    signIn: (email, password) => call("/token?grant_type=password", { method: "POST", body: { email, password } }, session),
    refresh: (refreshToken) => call("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } }, session),

    user: (accessToken) =>
      call("/user", { method: "GET", token: accessToken }, (body) => {
        if (typeof body.id !== "string") return null;
        const factors = Array.isArray(body.factors) ? body.factors : [];
        return {
          id: body.id,
          email: typeof body.email === "string" ? body.email : null,
          factors: factors
            .filter((factor: any) => typeof factor?.id === "string")
            .map((factor: any) => ({ id: factor.id, type: String(factor.factor_type ?? ""), status: factor.status === "verified" ? "verified" : "unverified" })),
        };
      }),

    enrollTotp: (accessToken, issuer) =>
      call("/factors", { method: "POST", token: accessToken, body: { factor_type: "totp", issuer, friendly_name: `Checkervia admin ${new Date().toISOString().slice(0, 16)}` } }, (body) =>
        typeof body.id === "string" && typeof body.totp?.qr_code === "string" && typeof body.totp?.secret === "string"
          ? { factorId: body.id, qrCode: body.totp.qr_code, secret: body.totp.secret }
          : null,
      ),

    deleteFactor: (accessToken, factorId) => done(call(`/factors/${encodeURIComponent(factorId)}`, { method: "DELETE", token: accessToken }, () => true)),

    async verifyTotp(accessToken, factorId, code) {
      const path = `/factors/${encodeURIComponent(factorId)}`;
      const challenge = await call(`${path}/challenge`, { method: "POST", token: accessToken, body: {} }, (body) => (typeof body.id === "string" ? (body.id as string) : null));
      if (!challenge.ok) return challenge;
      return call(`${path}/verify`, { method: "POST", token: accessToken, body: { challenge_id: challenge.value, code } }, session);
    },

    signOut: (accessToken) => done(call("/logout?scope=global", { method: "POST", token: accessToken }, () => true)),

    async signupsDisabled() {
      const result = await call("/settings", { method: "GET" }, (body) => (typeof body.disable_signup === "boolean" ? body.disable_signup : null));
      return result.ok ? result.value : null;
    },
  };
}

/** The claims of an access token Supabase has already checked (never used to check one). */
export interface TokenClaims {
  readonly sub: string;
  readonly email: string | null;
  readonly aal: string | null;
  readonly sessionId: string | null;
  readonly totpAt: number | null; // when the second factor was given, seconds since 1970
}

export function readClaims(token: string): TokenClaims | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as Record<string, unknown>;
    if (typeof data["sub"] !== "string") return null;
    const amr = Array.isArray(data["amr"]) ? (data["amr"] as { method?: unknown; timestamp?: unknown }[]) : [];
    const totp = amr.find((entry) => entry?.method === "totp" && typeof entry.timestamp === "number");
    return {
      sub: data["sub"],
      email: typeof data["email"] === "string" ? data["email"] : null,
      aal: typeof data["aal"] === "string" ? data["aal"] : null,
      sessionId: typeof data["session_id"] === "string" ? data["session_id"] : null,
      totpAt: totp ? (totp.timestamp as number) : null,
    };
  } catch {
    return null;
  }
}

/** A JWT's shape: three base64url parts, not too long. */
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
