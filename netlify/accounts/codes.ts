// The two code steps of saving progress (D150): asking for a code, and
// checking it to save a profile to an email (link) or to bring a saved
// profile to this device (login).
//
// Rules: asking always answers "sent" (whether an email has a profile is
// never told to someone who has not proved they own it); a code lasts
// CODE_MINUTES and allows CODE_ATTEMPTS wrong tries; the admin's email gets
// no code; the browser only ever gets our own profile token.
import { CODE_ATTEMPTS, CODE_MINUTES, CODE_PATTERN, emailHint, normalEmail } from "../../src/leaderboard/account";
import type { AccountPurpose, LinkResponse, LoginResponse } from "../../src/leaderboard/account";
import { checkRateLimits, fail, invalid, notSignedIn, ok, playerFromToken, unavailable, validDevice } from "../leaderboard/http";
import type { LeaderboardRequest, LeaderboardResponse } from "../leaderboard/http";
import { saltedHash, sha256Hex } from "../leaderboard/security";
import { ACCOUNT_LIMITS, CODES_PER_DAY, CODES_PER_EMAIL, STALE_CODE_HOURS, drainErasures } from "./deps";
import type { AccountDeps } from "./deps";
import { savedForBrowser } from "./saves";

const purposeOf = (value: unknown): AccountPurpose | null => (value === "link" || value === "login" ? value : null);
const SENT = ok({ sent: true });
const tooMany = (retryAfter: number) => fail(429, "rateLimited", "Too many requests. Please wait a moment.", { retryAfter });

async function limitsForCode(emailHash: string, request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse | null> {
  const limited = await checkRateLimits("accountCode", ACCOUNT_LIMITS.requestCode, request, deps);
  if (limited) return limited;
  const perEmail = await deps.store.hitRateLimit(`accountCode:email:${emailHash}`, CODES_PER_EMAIL.windowSeconds, CODES_PER_EMAIL.limit);
  if (!perEmail.allowed) return tooMany(perEmail.retryAfterSeconds);
  const today = await deps.store.hitRateLimit("accountCode:all", CODES_PER_DAY.windowSeconds, CODES_PER_DAY.limit);
  if (!today.allowed) return fail(429, "dailyLimit", "Too many login emails were sent today. Please try again tomorrow.", { retryAfter: today.retryAfterSeconds });
  return null;
}

export async function requestCode(body: Record<string, unknown>, request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const email = normalEmail(body["email"]);
  const purpose = purposeOf(body["purpose"]);
  if (!email || !purpose || !validDevice(request)) return invalid();
  const emailHash = await saltedHash(deps.salt, "email", email);
  const limited = await limitsForCode(emailHash, request, deps);
  if (limited) return limited;

  if (purpose === "link") {
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();
    if (await deps.accounts.linkOfPlayer(player.id)) return fail(409, "profileLinked", "This profile is already saved to an email.");
  }
  if (deps.adminEmail !== null && email === deps.adminEmail.trim().toLowerCase()) {
    deps.log("account: admin email refused");
    return SENT;
  }
  // Housekeeping, a little at a time: forget old codes, remove unused users.
  await deps.accounts.queueStaleCodes(new Date(deps.now().getTime() - STALE_CODE_HOURS * 3_600_000));
  await drainErasures(deps);

  const previous = await deps.accounts.code(emailHash);
  let made: { userId: string | null; created: boolean } | null = null;
  if (purpose === "link") {
    made = await deps.auth.ensureUser(email);
    if (!made) return unavailable();
  }
  const record = {
    emailHash,
    authUserId: made?.created ? made.userId : previous?.authUserId ?? null,
    createdUser: Boolean(made?.created) || (previous?.createdUser ?? false),
    requestedAt: deps.now(),
    wrongAttempts: 0,
    used: false,
  };
  // Written before sending, so a user we just made is cleaned up even if the email fails.
  if (made?.created) await deps.accounts.putCode(record);
  const sent = await deps.auth.sendCode(email);
  if (sent === "limited") return tooMany(60);
  if (sent === "unavailable") return unavailable();
  if (sent === "sent") await deps.accounts.putCode(record);
  return SENT; // "noUser" too: a login code for an email without a profile
}

export async function verifyCode(body: Record<string, unknown>, request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const email = normalEmail(body["email"]);
  const purpose = purposeOf(body["purpose"]);
  const code = body["code"];
  if (!email || !purpose || typeof code !== "string" || !CODE_PATTERN.test(code) || !validDevice(request)) return invalid();
  const limited = await checkRateLimits("accountVerify", ACCOUNT_LIMITS.verify, request, deps);
  if (limited) return limited;

  const player = purpose === "link" ? await playerFromToken(request, deps.store) : null;
  if (purpose === "link" && !player) return notSignedIn();
  const emailHash = await saltedHash(deps.salt, "email", email);
  const record = await deps.accounts.code(emailHash);
  const age = record ? deps.now().getTime() - record.requestedAt.getTime() : Infinity;
  if (!record || record.used || age > CODE_MINUTES * 60_000) return fail(400, "codeExpired", "This code has expired. Request a new one.");
  if (record.wrongAttempts >= CODE_ATTEMPTS) return fail(400, "tooManyWrong", "Too many wrong codes. Request a new one.");

  const checked = await deps.auth.verifyCode(email, code);
  if (!checked.ok) {
    if (checked.reason === "limited") return tooMany(60);
    if (checked.reason === "unavailable") return unavailable();
    const wrong = await deps.accounts.wrongCode(emailHash);
    return wrong >= CODE_ATTEMPTS
      ? fail(400, "tooManyWrong", "Too many wrong codes. Request a new one.")
      : fail(400, "wrongCode", "That code is not right. Check it and try again.");
  }
  await deps.accounts.useCode(emailHash);
  return player ? link(player.id, checked.userId, email, emailHash, deps) : login(checked.userId, emailHash, request, deps);
}

async function link(playerId: string, userId: string, email: string, emailHash: string, deps: AccountDeps): Promise<LeaderboardResponse> {
  const hint = emailHint(email);
  const outcome = await deps.accounts.link({ playerId, authUserId: userId, emailHash, emailHint: hint });
  if (outcome === "profileLinked") return fail(409, "profileLinked", "This profile is already saved to an email.");
  if (outcome === "emailTaken") {
    const other = (await deps.accounts.linkOfEmail(emailHash)) ?? (await deps.accounts.linkOfUser(userId));
    const owner = other ? await deps.accounts.playerById(other.playerId) : null;
    const name = owner && !owner.hidden ? `the profile ${owner.username}` : "another profile";
    return fail(409, "emailTaken", `This email is already used for ${name}. Log in with it instead, or use a different email.`);
  }
  const response: LinkResponse = { linked: true, emailHint: hint };
  return ok(response);
}

async function login(userId: string, emailHash: string, request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const saved = (await deps.accounts.linkOfUser(userId)) ?? (await deps.accounts.linkOfEmail(emailHash));
  if (!saved) return fail(404, "noSavedProfile", "No saved profile uses this email. Open your profile and choose Save your progress first.");
  const player = await deps.accounts.playerById(saved.playerId);
  if (!player || player.hidden) return fail(403, "profileUnavailable", "This profile is not available.");
  // A new key for this device; the profile's other devices keep theirs.
  const token = deps.newToken();
  await deps.accounts.addDeviceToken(player.id, await sha256Hex(token), await saltedHash(deps.salt, "device", request.deviceId!));
  const response: LoginResponse = {
    profile: { username: player.username, country: player.country, avatar: player.avatar, token },
    emailHint: saved.emailHint,
    save: savedForBrowser(await deps.accounts.saved(player.id)),
  };
  return ok(response);
}
