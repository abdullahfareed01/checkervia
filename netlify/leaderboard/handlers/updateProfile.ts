// POST { country } with the player's token: changes the flag, or removes it
// (null). "auto" uses the country Netlify sees the request come from.
import { checkRateLimits, fail, guarded, invalid, isCountryChoice, notSignedIn, ok, parseBody, playerFromToken, resolveCountry, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import { LIMITS, MAX_BODY } from "./limits";

export const handleUpdateProfile: LeaderboardHandler = (request, deps) =>
  guarded("updateProfile", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.updateProfile, ["country"]);
    if (!body || !isCountryChoice(body["country"]) || !validDevice(request)) return invalid();

    const limited = await checkRateLimits("updateProfile", LIMITS.updateProfile, request, deps);
    if (limited) return limited;
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();

    const country = resolveCountry(body["country"], request.geoCountry);
    await deps.store.setCountry(player.id, country);
    return ok({ username: player.username, country });
  });
