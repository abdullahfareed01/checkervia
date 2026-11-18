// POST { gameId, level, phase } with the player's token (D85): the AI
// reports the player for a game against it left without a move for a
// minute. Counted once per game; the fourth report suspends the account for
// 30 days. Answers the player's reports and suspension as they are now.
// Like the reported results (report-game), this comes from the browser and
// is not replayed; the Terms say so.
import { LEVELS } from "../../../src/ai/difficulty";
import type { AiLevel } from "../../../src/ai/difficulty";
import { GAME_ID_PATTERN, REPORT_LIMIT, SUSPENSION_DAYS } from "../../../src/leaderboard/protocol";
import type { ConductStatus } from "../../../src/leaderboard/protocol";
import { checkRateLimits, fail, guarded, invalid, notSignedIn, ok, parseBody, playerFromToken, validDevice } from "../http";
import type { LeaderboardHandler } from "../http";
import type { Conduct } from "../store";
import { LIMITS, MAX_BODY } from "./limits";

/** The conduct as the browser receives it. */
export const conductStatus = (conduct: Conduct): ConductStatus => ({
  reports: conduct.reports,
  totalReports: conduct.totalReports,
  suspendedUntil: conduct.suspendedUntil?.toISOString() ?? null,
  // Only from migration 7 on (D102); older servers send neither.
  ...(conduct.kind !== undefined ? { kind: conduct.kind } : {}),
  ...(conduct.revisedAt !== undefined ? { revisedAt: conduct.revisedAt?.toISOString() ?? null } : {}),
});

export const handleReportAbandon: LeaderboardHandler = (request, deps) =>
  guarded("reportAbandon", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, MAX_BODY.reportAbandon, ["gameId", "level", "phase"]);
    if (!body || !validDevice(request)) return invalid();
    const { gameId, phase } = body;
    const level = body["level"] as AiLevel;
    if (typeof gameId !== "string" || !GAME_ID_PATTERN.test(gameId) || !LEVELS.includes(level)) return invalid();
    if (phase !== "start" && phase !== "middle") return invalid();

    const limited = await checkRateLimits("reportAbandon", LIMITS.reportAbandon, request, deps);
    if (limited) return limited;
    const player = await playerFromToken(request, deps.store);
    if (!player) return notSignedIn();

    const conduct = await deps.store.addReport({ playerId: player.id, gameId, level, phase }, REPORT_LIMIT, SUSPENSION_DAYS);
    return ok(conductStatus(conduct));
  });
