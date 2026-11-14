// POST { username?, country?, avatar? } with the player's token: changes the
// player's own profile (D61, D62). Every rule is checked here again:
// - username: the same rules as a new one, at most one change every
//   RENAME_WAIT_DAYS, never a name used or reserved for someone else; the old
//   name is then reserved for this player for NAME_RESERVED_DAYS;
// - country: a code from the list, or "none" (no flag), any time;
// - avatar: one of the allowed ids, any time.
// Wins and stats belong to the player, not the name, so they stay.
import { isAvatarId } from "../../../src/leaderboard/avatars";
import { NAME_RESERVED_DAYS, RENAME_WAIT_DAYS } from "../../../src/leaderboard/protocol";
import type { UpdateProfileResponse } from "../../../src/leaderboard/protocol";
import { usernameKey, usernameProblems } from "../../../src/leaderboard/username";
import { checkRateLimits, chosenCountry, fail, guarded, invalid, notSignedIn, ok, parseBody, playerFromToken, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import type { PlayerRecord } from "../store";
import { LIMITS, MAX_BODY } from "./limits";

const DAY_MS = 86_400_000;

/** When the player may change their username again, or null for now. */
export function nextRenameAt(player: Pick<PlayerRecord, "usernameChangedAt">, now: Date): string | null {
  const allowed = player.usernameChangedAt ? player.usernameChangedAt.getTime() + RENAME_WAIT_DAYS * DAY_MS : 0;
  return allowed > now.getTime() ? new Date(allowed).toISOString() : null;
}

export const handleUpdateProfile: LeaderboardHandler = (request, deps) =>
  guarded("updateProfile", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.updateProfile, ["username", "country", "avatar"]);
    if (!body || Object.keys(body).length === 0 || !validDevice(request)) return invalid();
    const username = body["username"];
    const avatar = body["avatar"] as string | undefined;
    const hasCountry = "country" in body;
    const country = hasCountry ? chosenCountry(body["country"]) : null;
    if (country === undefined) return invalid();
    if (username !== undefined && typeof username !== "string") return invalid();
    if (avatar !== undefined && !isAvatarId(avatar)) return invalid();

    const limited = await checkRateLimits("updateProfile", LIMITS.updateProfile, request, deps);
    if (limited) return limited;
    if (username !== undefined) {
      const renameLimited = await checkRateLimits("renameUsername", LIMITS.renameUsername, request, deps);
      if (renameLimited) return renameLimited;
    }
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();

    let name = player.username;
    let next = nextRenameAt(player, deps.now());
    if (username !== undefined && username !== player.username) {
      const problems = usernameProblems(username);
      if (problems.length > 0) return { status: 422, body: { error: "This username is not allowed.", code: "username", problems } };
      const renamed = await deps.store.renamePlayer(player.id, username, usernameKey(username), RENAME_WAIT_DAYS, NAME_RESERVED_DAYS);
      if (renamed.outcome === "tooSoon") {
        return fail(409, "renameTooSoon", "A username can be changed once every 7 days.", { nextRenameAt: renamed.nextChangeAt!.toISOString() });
      }
      if (renamed.outcome === "taken") return fail(409, "taken", "This username is taken.");
      name = username;
      next = renamed.nextChangeAt?.toISOString() ?? null;
    }

    await deps.store.updatePlayer(player.id, {
      ...(hasCountry ? { country } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
    });
    const response: UpdateProfileResponse = {
      username: name,
      country: hasCountry ? country : player.country,
      avatar: avatar ?? player.avatar,
      nextRenameAt: next,
    };
    return ok(response);
  });
