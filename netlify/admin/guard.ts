// The admin guard (D100): every admin function checks, in this order,
//   1. the request came from our own page (fromOwnPage),
//   2. the address is under its rate limit (before Supabase is asked),
//   3. a bearer token of the right shape,
//   4. Supabase Auth accepts the token (signature, expiry, not signed out),
//   5. the token and its user are the one email in ADMIN_EMAIL,
//   6. the second factor: aal2, a TOTP in the token, a verified TOTP factor,
//      given less than SESSION_HOURS ago,
//   7. the user is on the allow list in the database (id and email),
//   8. the account is under its own rate limit.
// A valid token of another user is refused and written to the audit log.
import { SESSION_HOURS } from "../../src/admin/protocol";
import { ACCESS_TOKEN_PATTERN, readClaims } from "./gotrue";
import type { AuthUser } from "./gotrue";
import { fail, fromOwnPage, invalid, ipHashOf, noSession, notAdmin, rateLimited } from "./http";
import type { AdminDeps, AdminLimit, AdminRequest, AdminResponse } from "./http";

export interface AdminIdentity {
  readonly id: string;
  readonly email: string;
  readonly ipHash: string;
}

export type TokenCheck =
  | { readonly ok: true; readonly user: AuthUser; readonly email: string; readonly enrollOpen: boolean }
  | { readonly ok: false; readonly response: AdminResponse };

/** The access token in "Authorization: Bearer ...", or null. */
export function bearer(request: AdminRequest): string | null {
  const match = /^Bearer (\S{20,4096})$/.exec(request.headers["authorization"] ?? "");
  return match && ACCESS_TOKEN_PATTERN.test(match[1]!) ? match[1]! : null;
}

export const sameEmail = (a: string | null | undefined, b: string) => typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

export const mfaRequired = () => fail(403, "mfaRequired", "The second step of the sign in is missing.");

/**
 * Steps 4 to 7 for one token. `needSecondFactor` false is for the sign in
 * itself (the password step's token, before the code). Refusals of a real
 * account that is not the admin go to the audit log.
 */
export async function checkToken(token: string, needSecondFactor: boolean, ipHash: string, deps: AdminDeps): Promise<TokenCheck> {
  const answer = await deps.auth.user(token);
  if (!answer.ok) return { ok: false, response: answer.status >= 500 ? fail(503, "unavailable", "Sign in is not available right now.") : noSession() };
  const user = answer.value;
  const claims = readClaims(token);
  if (!claims || claims.sub !== user.id) return { ok: false, response: noSession() };

  if (!sameEmail(user.email, deps.adminEmail) || (claims.email !== null && !sameEmail(claims.email, deps.adminEmail))) {
    await deps.store.log({ adminId: null, action: "access.refused", outcome: "refused", details: { why: "notAdminEmail", user: user.id }, ipHash });
    return { ok: false, response: notAdmin() };
  }
  if (needSecondFactor) {
    const verifiedTotp = user.factors.some((factor) => factor.type === "totp" && factor.status === "verified");
    if (claims.aal !== "aal2" || claims.totpAt === null || !verifiedTotp) return { ok: false, response: mfaRequired() };
    if (deps.now().getTime() / 1000 - claims.totpAt > SESSION_HOURS * 3600) return { ok: false, response: noSession() };
  }
  const gate = await deps.store.gate(user.id, deps.adminEmail);
  if (!gate.allowed) {
    await deps.store.log({ adminId: user.id, action: "access.refused", outcome: "refused", details: { why: "notOnAllowList" }, ipHash });
    return { ok: false, response: notAdmin() };
  }
  return { ok: true, user, email: deps.adminEmail.trim().toLowerCase(), enrollOpen: gate.enrollOpen };
}

/** Runs every check; the admin, or the answer that refuses the request. */
export async function requireAdmin(request: AdminRequest, deps: AdminDeps, limitName: string, limit: AdminLimit): Promise<{ admin: AdminIdentity } | { response: AdminResponse }> {
  if (!fromOwnPage(request)) return { response: invalid() };
  const ipHash = await ipHashOf(request, deps);
  const byIp = await rateLimited(limitName, { windowSeconds: limit.windowSeconds, perIp: limit.perIp }, { ipHash }, deps);
  if (byIp) return { response: byIp };
  const token = bearer(request);
  if (!token) return { response: noSession() };
  const checked = await checkToken(token, true, ipHash, deps);
  if (!checked.ok) return { response: checked.response };
  if (limit.perUser !== undefined) {
    const byUser = await deps.store.hitRateLimit(`admin:${limitName}:user:${checked.user.id}`, limit.windowSeconds, limit.perUser);
    if (!byUser.allowed) return { response: fail(429, "rateLimited", "Too many attempts. Please wait a moment.", { retryAfter: byUser.retryAfterSeconds }) };
  }
  return { admin: { id: checked.user.id, email: checked.email, ipHash } };
}
