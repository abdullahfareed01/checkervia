// POST admin-auth { action, ... } (D100): the sign in, step by step.
//   signIn  { email, password }: the password. Only ADMIN_EMAIL is tried
//           with Supabase; anything else gets the same answer as a wrong
//           password. Answers the next step: set up an authenticator (only
//           while the window on the allow list is open) or type its code.
//   enroll  (password step's token): a new TOTP authenticator, as a QR code.
//   verify  { code, factorId? } (password step's token): the second factor.
//           The refresh token goes into the HttpOnly cookie; the access
//           token (aal2) comes back for the page's memory.
//   refresh (cookie): a new access token, checked like any other.
//   signOut (access token): signs out every session, clears the cookie.
// Every step is rate limited and written to the audit log.
import { SESSION_HOURS, TOTP_CODE_PATTERN, UUID_PATTERN } from "../../../src/admin/protocol";
import type { EnrollResponse, SessionResponse, SignInStep } from "../../../src/admin/protocol";
import { clearedCookie, readRefreshCookie, refreshCookie } from "../cookie";
import { readClaims } from "../gotrue";
import type { AuthSession, AuthUser } from "../gotrue";
import { bearer, checkToken, sameEmail } from "../guard";
import { fail, fromOwnPage, guarded, invalid, ipHashOf, noSession, ok, parseBody, rateLimited } from "../http";
import type { AdminDeps, AdminRequest, AdminResponse } from "../http";
import { ADMIN_BODY_MAX, ADMIN_LIMITS } from "../limits";

const ISSUER = "Checkervia admin";
const badCredentials = () => fail(401, "badCredentials", "The email or the password is wrong.");
const totpFactors = (user: AuthUser) => user.factors.filter((factor) => factor.type === "totp");

/** The cookie and the page's answer for a session with the second factor. */
function signedIn(session: AuthSession, email: string, deps: AdminDeps): AdminResponse {
  const totpAt = readClaims(session.accessToken)?.totpAt ?? deps.now().getTime() / 1000;
  const left = totpAt + SESSION_HOURS * 3600 - deps.now().getTime() / 1000;
  const body: SessionResponse = { accessToken: session.accessToken, expiresAt: session.expiresAt, email };
  return ok(body, { setCookie: refreshCookie(session.refreshToken, left) });
}

async function signIn(body: Record<string, unknown>, ipHash: string, deps: AdminDeps): Promise<AdminResponse> {
  const { email, password } = body;
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length === 0 || password.length > 200) return invalid();
  const limited = await rateLimited("signIn", ADMIN_LIMITS.signIn, { ipHash }, deps);
  if (limited) return limited;
  if (!sameEmail(email, deps.adminEmail)) {
    // Not the admin's email: Supabase is not even asked, and the email is not kept.
    await deps.store.log({ adminId: null, action: "auth.signin", outcome: "refused", details: { why: "otherEmail" }, ipHash });
    return badCredentials();
  }
  const session = await deps.auth.signIn(deps.adminEmail.trim().toLowerCase(), password);
  if (!session.ok) {
    if (session.status >= 500) return fail(503, "unavailable", "Sign in is not available right now.");
    await deps.store.log({ adminId: null, action: "auth.signin", outcome: "refused", details: { why: "password" }, ipHash });
    return badCredentials();
  }
  const token = session.value.accessToken;
  const checked = await checkToken(token, false, ipHash, deps);
  if (!checked.ok) {
    await deps.auth.signOut(token);
    return checked.response;
  }
  // Public sign ups must be off: with them on, anyone could make an account.
  if ((await deps.auth.signupsDisabled()) !== true) {
    await deps.store.log({ adminId: checked.user.id, action: "auth.signin", outcome: "refused", details: { why: "signupsOn" }, ipHash });
    await deps.auth.signOut(token);
    return fail(403, "signupsOn", "Turn off new user sign ups in Supabase (Authentication, Sign In / Providers) before signing in.");
  }
  const verified = totpFactors(checked.user).find((factor) => factor.status === "verified");
  if (!verified && !checked.enrollOpen) {
    await deps.store.log({ adminId: checked.user.id, action: "auth.signin", outcome: "refused", details: { why: "noAuthenticator" }, ipHash });
    await deps.auth.signOut(token);
    return fail(403, "enrollClosed", "No authenticator is set up, and setting one up is not allowed now. See the admin runbook.");
  }
  await deps.store.log({ adminId: checked.user.id, action: "auth.password", outcome: "ok", ipHash });
  const step: SignInStep = { step: verified ? "verify" : "enroll", pendingToken: token, factorId: verified?.id ?? null };
  return ok(step);
}

/** The password step's token and its admin, for the second factor steps. */
async function pending(request: AdminRequest, ipHash: string, deps: AdminDeps): Promise<{ token: string; user: AuthUser; enrollOpen: boolean } | AdminResponse> {
  const token = bearer(request);
  if (!token) return noSession();
  const checked = await checkToken(token, false, ipHash, deps);
  if (!checked.ok) return checked.response;
  const limited = await rateLimited("secondFactor", ADMIN_LIMITS.secondFactor, { ipHash, userId: checked.user.id }, deps);
  if (limited) return limited;
  return { token, user: checked.user, enrollOpen: checked.enrollOpen };
}

async function enroll(request: AdminRequest, ipHash: string, deps: AdminDeps): Promise<AdminResponse> {
  const step = await pending(request, ipHash, deps);
  if ("status" in step) return step;
  const factors = totpFactors(step.user);
  if (!step.enrollOpen || factors.some((factor) => factor.status === "verified")) {
    await deps.store.log({ adminId: step.user.id, action: "auth.enroll", outcome: "refused", details: { why: "closed" }, ipHash });
    return fail(403, "enrollClosed", "Setting up an authenticator is not allowed now. See the admin runbook.");
  }
  // Half finished set ups from before are removed, so only the new one counts.
  for (const factor of factors) await deps.auth.deleteFactor(step.token, factor.id);
  const enrolled = await deps.auth.enrollTotp(step.token, ISSUER);
  if (!enrolled.ok) return fail(503, "unavailable", "The authenticator could not be set up. Please try again.");
  await deps.store.log({ adminId: step.user.id, action: "auth.enroll", outcome: "ok", ipHash });
  const body: EnrollResponse = { factorId: enrolled.value.factorId, qrCode: enrolled.value.qrCode, secret: enrolled.value.secret };
  return ok(body);
}

async function verify(request: AdminRequest, body: Record<string, unknown>, ipHash: string, deps: AdminDeps): Promise<AdminResponse> {
  const { code, factorId } = body;
  if (typeof code !== "string" || !TOTP_CODE_PATTERN.test(code)) return invalid();
  if (factorId !== undefined && (typeof factorId !== "string" || !UUID_PATTERN.test(factorId))) return invalid();
  const step = await pending(request, ipHash, deps);
  if ("status" in step) return step;
  const factors = totpFactors(step.user);
  const verified = factors.find((factor) => factor.status === "verified");
  // A new authenticator is confirmed only while the window is open.
  const factor = verified ?? (step.enrollOpen ? factors.find((candidate) => candidate.id === factorId) : undefined);
  if (!factor) return fail(403, "enrollClosed", "Setting up an authenticator is not allowed now. See the admin runbook.");
  const session = await deps.auth.verifyTotp(step.token, factor.id, code);
  if (!session.ok) {
    if (session.status >= 500) return fail(503, "unavailable", "Sign in is not available right now.");
    await deps.store.log({ adminId: step.user.id, action: "auth.code", outcome: "refused", ipHash });
    return fail(401, "badCode", "That code is not right. Codes change every 30 seconds.");
  }
  if (!verified) await deps.store.closeEnrollment(step.user.id);
  await deps.store.log({ adminId: step.user.id, action: "auth.signin", outcome: "ok", details: verified ? {} : { newAuthenticator: true }, ipHash });
  return signedIn(session.value, deps.adminEmail.trim().toLowerCase(), deps);
}

async function refresh(request: AdminRequest, ipHash: string, deps: AdminDeps): Promise<AdminResponse> {
  const limited = await rateLimited("refresh", ADMIN_LIMITS.refresh, { ipHash }, deps);
  if (limited) return limited;
  const token = readRefreshCookie(request.headers["cookie"]);
  if (!token) return noSession(clearedCookie());
  const session = await deps.auth.refresh(token);
  if (!session.ok) return session.status >= 500 ? fail(503, "unavailable", "Sign in is not available right now.") : noSession(clearedCookie());
  const checked = await checkToken(session.value.accessToken, true, ipHash, deps);
  if (!checked.ok) {
    await deps.auth.signOut(session.value.accessToken);
    return { ...checked.response, setCookie: clearedCookie() };
  }
  return signedIn(session.value, checked.email, deps);
}

async function signOut(request: AdminRequest, ipHash: string, deps: AdminDeps): Promise<AdminResponse> {
  const limited = await rateLimited("signOut", ADMIN_LIMITS.signOut, { ipHash }, deps);
  if (limited) return limited;
  const token = bearer(request);
  if (token) {
    const checked = await checkToken(token, false, ipHash, deps);
    await deps.auth.signOut(token);
    if (checked.ok) await deps.store.log({ adminId: checked.user.id, action: "auth.signout", outcome: "ok", ipHash });
  }
  return ok({ signedOut: true }, { setCookie: clearedCookie() });
}

export const handleAdminAuth = (request: AdminRequest, deps: AdminDeps): Promise<AdminResponse> =>
  guarded("auth", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    if (!fromOwnPage(request)) return invalid();
    const body = parseBody(request.body, ADMIN_BODY_MAX.auth, ["action", "email", "password", "code", "factorId"]);
    if (!body) return invalid();
    const ipHash = await ipHashOf(request, deps);
    switch (body["action"]) {
      case "signIn":
        return signIn(body, ipHash, deps);
      case "enroll":
        return enroll(request, ipHash, deps);
      case "verify":
        return verify(request, body, ipHash, deps);
      case "refresh":
        return refresh(request, ipHash, deps);
      case "signOut":
        return signOut(request, ipHash, deps);
      default:
        return invalid();
    }
  });
