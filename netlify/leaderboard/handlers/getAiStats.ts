// GET: the AI's record over every player's reported games (D75), open to
// everyone and without a token: totals only, no names.
import type { AiStatsResponse } from "../../../src/leaderboard/protocol";
import { checkRateLimits, fail, guarded, ok } from "../http";
import type { LeaderboardHandler } from "../http";
import { LIMITS } from "./limits";

export const handleGetAiStats: LeaderboardHandler = (request, deps) =>
  guarded("getAiStats", deps, async () => {
    if (request.method !== "GET") return fail(405, "method", "Method not allowed.");
    const limited = await checkRateLimits("getAiStats", LIMITS.getAiStats, request, deps);
    if (limited) return limited;
    const record = await deps.store.aiRecord();
    const body: AiStatsResponse = record;
    return ok(body);
  });
