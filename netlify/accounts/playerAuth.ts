// Supabase Auth for saved progress (D150), called from the account function
// only. Supabase makes, emails and checks the 6 digit codes. Players never
// keep a Supabase session: verifyCode signs the new session out at once and
// returns only the Auth user id.
//
// Public sign ups stay off (the admin login needs that, D100), so our
// function makes the Auth user itself with the secret key, and then asks for
// a code with create_user false. No code, key, token or email is ever
// logged or put in an error; a failure carries only a status and a code.
import { isJwtKey } from "../leaderboard/supabaseStore";

export type SendResult = "sent" | "noUser" | "limited" | "unavailable";
export type VerifyResult = { readonly ok: true; readonly userId: string } | { readonly ok: false; readonly reason: "wrong" | "limited" | "unavailable" };

export interface PlayerAuth {
  /** Makes the Auth user if needed; `created` when this call made it. */
  ensureUser(email: string): Promise<{ readonly userId: string | null; readonly created: boolean } | null>;
  /** Asks Supabase to email a code to an existing user. */
  sendCode(email: string): Promise<SendResult>;
  /** Checks a code and signs its session out at once. */
  verifyCode(email: string, code: string): Promise<VerifyResult>;
  /** Deletes an Auth user and its email; true when it is gone (already gone too). */
  deleteUser(userId: string): Promise<boolean>;
}

type Answer = { readonly status: number; readonly body: any };

export function createPlayerAuth(url: string, secretKey: string, publishableKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): PlayerAuth {
  const base = `${url.replace(/\/+$/, "")}/auth/v1`;
  const secret = secretKey.trim();
  const publishable = publishableKey.trim();

  async function call(path: string, method: string, key: "secret" | "publishable", body?: unknown, token?: string): Promise<Answer> {
    const apiKey = key === "secret" ? secret : publishable;
    const headers: Record<string, string> = { apikey: apiKey, "content-type": "application/json" };
    // A new sb_secret key is read from apikey only; a legacy JWT key also goes as Bearer (D58).
    if (token) headers["authorization"] = `Bearer ${token}`;
    else if (isJwtKey(apiKey)) headers["authorization"] = `Bearer ${apiKey}`;
    try {
      const response = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const text = await response.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      return { status: response.status, body: parsed };
    } catch {
      return { status: 503, body: null };
    }
  }
  const errorCode = (answer: Answer) => String(answer.body?.error_code ?? answer.body?.code ?? answer.body?.error ?? "");

  return {
    async ensureUser(email) {
      const answer = await call("/admin/users", "POST", "secret", { email, email_confirm: false });
      if (answer.status >= 200 && answer.status < 300 && typeof answer.body?.id === "string") return { userId: answer.body.id, created: true };
      if (answer.status === 422 && errorCode(answer) === "email_exists") return { userId: null, created: false };
      return null;
    },
    async sendCode(email) {
      const answer = await call("/otp", "POST", "publishable", { email, create_user: false });
      if (answer.status >= 200 && answer.status < 300) return "sent";
      if (answer.status === 429) return "limited";
      // No such user (sign ups are off): the caller answers as if a code was sent.
      if (answer.status === 400 || answer.status === 422) return "noUser";
      return "unavailable";
    },
    async verifyCode(email, code) {
      const answer = await call("/verify", "POST", "publishable", { type: "email", email, token: code });
      if (answer.status === 429) return { ok: false, reason: "limited" };
      if (answer.status >= 500) return { ok: false, reason: "unavailable" };
      const userId = answer.body?.user?.id;
      const accessToken = answer.body?.access_token;
      if (answer.status < 200 || answer.status >= 300 || typeof userId !== "string") return { ok: false, reason: "wrong" };
      // The player must never hold a Supabase session: end it on every device now.
      if (typeof accessToken === "string") await call("/logout?scope=global", "POST", "publishable", undefined, accessToken);
      return { ok: true, userId };
    },
    async deleteUser(userId) {
      const answer = await call(`/admin/users/${encodeURIComponent(userId)}`, "DELETE", "secret");
      return (answer.status >= 200 && answer.status < 300) || answer.status === 404;
    },
  };
}

/** For tests and the development server: codes are kept in memory, never emailed. */
export interface FakePlayerAuth extends PlayerAuth {
  /** The last code "sent" to an email (what the player would read in the email). */
  lastCode(email: string): string | null;
  readonly users: ReadonlyMap<string, string>; // email to Auth user id
  readonly revoked: number; // sessions ended after a correct code
}

export function createFakePlayerAuth(newCode: () => string = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")): FakePlayerAuth {
  const users = new Map<string, string>();
  const codes = new Map<string, string>();
  let revoked = 0;
  let nextUser = 1;
  return {
    users,
    get revoked() {
      return revoked;
    },
    lastCode: (email) => codes.get(email) ?? null,
    async ensureUser(email) {
      if (users.has(email)) return { userId: null, created: false };
      const id = `00000000-0000-4000-9000-${String(nextUser++).padStart(12, "0")}`;
      users.set(email, id);
      return { userId: id, created: true };
    },
    async sendCode(email) {
      if (!users.has(email)) return "noUser";
      codes.set(email, newCode());
      return "sent";
    },
    async verifyCode(email, code) {
      if (!users.has(email) || codes.get(email) !== code) return { ok: false, reason: "wrong" };
      codes.delete(email);
      revoked += 1;
      return { ok: true, userId: users.get(email)! };
    },
    async deleteUser(userId) {
      for (const [email, id] of users) if (id === userId) users.delete(email);
      return true;
    },
  };
}
