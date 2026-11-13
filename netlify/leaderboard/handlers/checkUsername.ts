// GET ?username=...: which rules the name breaks, and whether it is free.
// The browser shows the same rules while typing; this repeats them.
import type { CheckUsernameResponse } from "../../../src/leaderboard/protocol";
import { USERNAME_MAX, usernameKey, usernameProblems } from "../../../src/leaderboard/username";
import { checkRateLimits, fail, guarded, invalid, ok, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import { LIMITS } from "./limits";

export const handleCheckUsername: LeaderboardHandler = (request, deps) =>
  guarded("checkUsername", deps, async () => {
    if (request.method !== "GET") return fail(405, "method", "Method not allowed.");
    if (!validDevice(request)) return invalid();
    const username = request.query.get("username");
    // A little room above the maximum, so a too long name still gets its message.
    if (username === null || username.length > USERNAME_MAX * 2) return invalid();

    const limited = await checkRateLimits("checkUsername", LIMITS.checkUsername, request, deps);
    if (limited) return limited;

    const problems = usernameProblems(username);
    const available = problems.length === 0 && (await deps.store.playerByKey(usernameKey(username))) === null;
    const body: CheckUsernameResponse = { available, problems };
    return ok(body);
  });
