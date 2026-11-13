// GET ?level=4&period=week&page=0: one page of the ranking, open to everyone.
// With a token it also returns the caller's own row, so the screen can pin
// it when it is not on the page.
import { LEVELS } from "../../../src/ai/difficulty";
import type { AiLevel } from "../../../src/ai/difficulty";
import { PERIODS, periodEnd, periodStart } from "../../../src/leaderboard/periods";
import type { Period } from "../../../src/leaderboard/periods";
import { MAX_PAGE, PAGE_SIZE } from "../../../src/leaderboard/protocol";
import type { LeaderboardResponse, LeaderboardRow } from "../../../src/leaderboard/protocol";
import { checkRateLimits, fail, guarded, invalid, ok, playerFromToken } from "../http";
import type { LeaderboardHandler } from "../http";
import type { RankedRow } from "../store";
import { LIMITS } from "./limits";

// Player ids stay on the server.
const publicRow = ({ rank, username, country, wins, bestMoves }: RankedRow): LeaderboardRow => ({ rank, username, country, wins, bestMoves });

export const handleGetLeaderboard: LeaderboardHandler = (request, deps) =>
  guarded("getLeaderboard", deps, async () => {
    if (request.method !== "GET") return fail(405, "method", "Method not allowed.");
    const level = Number(request.query.get("level") ?? "4") as AiLevel;
    const period = (request.query.get("period") ?? "week") as Period;
    const page = Number(request.query.get("page") ?? "0");
    if (!LEVELS.includes(level) || !PERIODS.includes(period) || !Number.isInteger(page) || page < 0 || page > MAX_PAGE) return invalid();

    const limited = await checkRateLimits("getLeaderboard", LIMITS.getLeaderboard, request, deps);
    if (limited) return limited;

    const now = deps.now();
    const since = periodStart(period, now);
    const { rows, total } = await deps.store.rankedPage(level, since, page * PAGE_SIZE, PAGE_SIZE);
    const player = await playerFromToken(request, deps.store);
    const me = player ? await deps.store.rankedRow(level, since, player.id) : null;

    const body: LeaderboardResponse = {
      level,
      period,
      page,
      pageSize: PAGE_SIZE,
      total,
      resetsAt: periodEnd(period, now)?.toISOString() ?? null,
      rows: rows.map(publicRow),
      me: me ? publicRow(me) : null,
    };
    return ok(body);
  });
