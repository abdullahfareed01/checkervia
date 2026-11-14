// POST { username, country, avatar }: creates a profile and returns its
// token, once. Every rule is checked again here; the browser's checks are
// only for the player's comfort. The country is the player's own choice (a
// code or "none"): there is no automatic country (D61). The avatar must be
// one of the allowed ids (D62).
import { isAvatarId } from "../../../src/leaderboard/avatars";
import type { ClaimResponse } from "../../../src/leaderboard/protocol";
import { usernameKey, usernameProblems } from "../../../src/leaderboard/username";
import { checkRateLimits, chosenCountry, fail, guarded, invalid, ok, parseBody, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import { saltedHash, sha256Hex } from "../security";
import { LIMITS, MAX_BODY } from "./limits";

export const handleClaimUsername: LeaderboardHandler = (request, deps) =>
  guarded("claimUsername", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.claimUsername, ["username", "country", "avatar"]);
    const country = chosenCountry(body?.["country"]);
    const avatar = body?.["avatar"];
    if (!body || typeof body["username"] !== "string" || country === undefined || !isAvatarId(avatar) || !validDevice(request)) return invalid();

    const limited = await checkRateLimits("claimUsername", LIMITS.claimUsername, request, deps);
    if (limited) return limited;

    const username = body["username"];
    const problems = usernameProblems(username);
    if (problems.length > 0) return { status: 422, body: { error: "This username is not allowed.", code: "username", problems } };

    const token = deps.newToken();
    const created = await deps.store.createPlayer({
      username,
      usernameKey: usernameKey(username),
      country,
      avatar,
      tokenHash: await sha256Hex(token),
      deviceHash: await saltedHash(deps.salt, "device", request.deviceId!),
      ipHash: await saltedHash(deps.salt, "ip", request.ip),
    });
    if (created === "taken") return fail(409, "taken", "This username is taken.");

    const response: ClaimResponse = { username: created.username, country: created.country, avatar: created.avatar, token };
    return ok(response, 201);
  });
