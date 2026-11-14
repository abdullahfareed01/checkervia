// POST { gameId, level, result } with the player's token: counts a finished
// game against the AI for the profile's games played and losses. These are
// reported by the browser, not replayed (the Terms say so). A win only ever
// counts as a win through submitWin.
import { LEVELS } from "../../../src/ai/difficulty";
import type { AiLevel } from "../../../src/ai/difficulty";
import { GAME_ID_PATTERN } from "../../../src/leaderboard/protocol";
import { checkRateLimits, fail, guarded, invalid, notSignedIn, ok, parseBody, playerFromToken, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import { LIMITS, MAX_BODY } from "./limits";

export const handleReportGame: LeaderboardHandler = (request, deps) =>
  guarded("reportGame", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.reportGame, ["gameId", "level", "result"]);
    if (!body || !validDevice(request)) return invalid();
    const { gameId, result } = body;
    const level = body["level"] as AiLevel;
    if (typeof gameId !== "string" || !GAME_ID_PATTERN.test(gameId) || !LEVELS.includes(level)) return invalid();
    if (result !== "win" && result !== "loss") return invalid();

    const limited = await checkRateLimits("reportGame", LIMITS.reportGame, request, deps);
    if (limited) return limited;
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();

    const saved = await deps.store.saveGameResult({ playerId: player.id, gameId, level, result }, false);
    return ok({ recorded: saved === "added" });
  });
