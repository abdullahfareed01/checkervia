// GET ?username=...: a player's public profile and stats. Hidden players
// (moderation) are not found. Asked with the player's own token, it also
// says when their username may change again (D61).
import { periodStart } from "../../../src/leaderboard/periods";
import type { ProfileResponse } from "../../../src/leaderboard/protocol";
import { USERNAME_MAX, usernameKey } from "../../../src/leaderboard/username";
import { checkRateLimits, fail, guarded, invalid, ok, playerFromToken } from "../http";
import type { LeaderboardHandler } from "../http";
import type { LevelCounts } from "../store";
import { LIMITS } from "./limits";
import { nextRenameAt } from "./updateProfile";
import { conductStatus } from "./reportAbandon";

// The best win: fewest moves; on a tie, the one at the higher level.
function bestWin(levels: readonly LevelCounts[]): ProfileResponse["bestWin"] {
  const best = levels
    .filter((level) => level.bestMoves !== null)
    .sort((a, b) => a.bestMoves! - b.bestMoves! || b.level - a.level)[0];
  return best ? { moves: best.bestMoves!, level: best.level } : null;
}

export const handleGetProfile: LeaderboardHandler = (request, deps) =>
  guarded("getProfile", deps, async () => {
    if (request.method !== "GET") return fail(405, "method", "Method not allowed.");
    const username = request.query.get("username");
    if (username === null || username.length === 0 || username.length > USERNAME_MAX) return invalid();

    const limited = await checkRateLimits("getProfile", LIMITS.getProfile, request, deps);
    if (limited) return limited;

    const player = await deps.store.playerByKey(usernameKey(username));
    if (!player || player.hidden) return fail(404, "notFound", "No player with this username.");

    const levels = await deps.store.levelCounts(player.id);
    const sum = (pick: (level: LevelCounts) => number) => levels.reduce((total, level) => total + pick(level), 0);
    const wins = sum((level) => level.wins);
    const gamesPlayed = sum((level) => level.games);
    const week = await deps.store.rankedRow(4, periodStart("week", deps.now()), player.id);

    const body: ProfileResponse = {
      username: player.username,
      country: player.country,
      avatar: player.avatar,
      gamesPlayed,
      wins,
      losses: sum((level) => level.losses),
      resigned: sum((level) => level.resigned),
      draws: sum((level) => level.draws), // D89
      winRate: gamesPlayed > 0 ? Math.min(1, wins / gamesPlayed) : null,
      byLevel: levels.map(({ level, wins: levelWins, losses, resigned, draws }) => ({ level, wins: levelWins, losses, resigned, draws })),
      bestWin: bestWin(levels),
      weeklyStrongestRank: week?.rank ?? null,
    };
    const asker = request.authorization ? await playerFromToken(request, deps.store) : null;
    if (asker?.id === player.id) {
      // Only the player sees their own reports and suspension (D85).
      const conduct = conductStatus(await deps.store.conduct(player.id));
      return ok({ ...body, nextRenameAt: nextRenameAt(player, deps.now()), conduct });
    }
    return ok(body);
  });
