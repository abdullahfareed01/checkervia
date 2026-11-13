// POST { gameId, level, mode, moves } with the player's token: replays the
// whole game through the engine and records the win only if it is a real,
// complete win by the player. Nothing the browser says about the result is
// trusted; only the level and "vs-ai" are taken from it (see replay.ts).
import { LEVELS } from "../../../src/ai/difficulty";
import type { AiLevel } from "../../../src/ai/difficulty";
import { periodStart } from "../../../src/leaderboard/periods";
import { GAME_ID_PATTERN } from "../../../src/leaderboard/protocol";
import type { EncodedMove, SubmitWinResponse } from "../../../src/leaderboard/protocol";
import { checkRateLimits, fail, guarded, invalid, notSignedIn, ok, parseBody, playerFromToken, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import { replayWin } from "../replay";
import { sha256Hex } from "../security";
import { LIMITS, MAX_BODY } from "./limits";

const REJECTED: Record<string, string> = {
  malformed: "The moves of this game could not be read.",
  illegal: "This game contains a move that is not allowed.",
  incomplete: "This game is not finished.",
  notWin: "This game is not a win for the player.",
};

export const handleSubmitWin: LeaderboardHandler = (request, deps) =>
  guarded("submitWin", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.submitWin, ["gameId", "level", "mode", "moves"]);
    if (!body || !validDevice(request)) return invalid();
    const { gameId, mode, moves } = body;
    const level = body["level"] as AiLevel;
    if (typeof gameId !== "string" || !GAME_ID_PATTERN.test(gameId) || !LEVELS.includes(level)) return invalid();
    // Two player games never count; only games against the AI are accepted.
    if (mode !== "vs-ai") return fail(422, "notAi", "Only wins against the AI count.");

    const limited = await checkRateLimits("submitWin", LIMITS.submitWin, request, deps);
    if (limited) return limited;
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();

    const replay = replayWin(moves);
    if (!replay.ok) return fail(422, replay.reason, REJECTED[replay.reason]!);

    const added = await deps.store.addWin({
      playerId: player.id,
      gameId,
      level,
      moves: moves as EncodedMove[],
      movesHash: await sha256Hex(JSON.stringify(moves)),
      moveCount: replay.moveCount,
      stats: replay.stats,
    });
    if (added === "duplicate") return fail(409, "duplicate", "This win was already submitted.");
    // A verified win also counts as a game played, whatever was reported before.
    await deps.store.saveGameResult({ playerId: player.id, gameId, level, result: "win" }, true);

    const week = await deps.store.rankedRow(level, periodStart("week", deps.now()), player.id);
    const response: SubmitWinResponse = { moveCount: replay.moveCount, weekRank: week?.rank ?? null };
    return ok(response, 201);
  });
