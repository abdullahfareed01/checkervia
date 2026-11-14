// How players are ranked on one level within one period. The Supabase
// function `leaderboard_ranked` (docs/07-deployment/leaderboard-migration.sql)
// does the same in SQL; the in memory store uses this, and the tests pin the
// order down.
//
// Order: most wins first; on a tie, the fewest moves in their best win; then
// whoever reached that number of wins first (the time of their latest win);
// then the player id, only so that the order is always the same.

export interface RankableWin {
  readonly playerId: string;
  readonly moveCount: number; // the player's own moves in that win
  readonly createdAt: number; // milliseconds since 1970, UTC
}

export interface RankedPlayer {
  readonly rank: number; // from 1
  readonly playerId: string;
  readonly wins: number;
  readonly bestMoves: number;
  readonly reachedAt: number; // when they reached their number of wins
}

export function compareRanked(a: Omit<RankedPlayer, "rank">, b: Omit<RankedPlayer, "rank">): number {
  return (
    b.wins - a.wins ||
    a.bestMoves - b.bestMoves ||
    a.reachedAt - b.reachedAt ||
    (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
  );
}

/** Ranks the players who own `wins` (already filtered to one level and period). */
export function rankPlayers(wins: readonly RankableWin[]): RankedPlayer[] {
  const byPlayer = new Map<string, Omit<RankedPlayer, "rank">>();
  for (const win of wins) {
    const seen = byPlayer.get(win.playerId);
    byPlayer.set(win.playerId, {
      playerId: win.playerId,
      wins: (seen?.wins ?? 0) + 1,
      bestMoves: Math.min(seen?.bestMoves ?? Infinity, win.moveCount),
      reachedAt: Math.max(seen?.reachedAt ?? -Infinity, win.createdAt),
    });
  }
  return [...byPlayer.values()].sort(compareRanked).map((player, index) => ({ ...player, rank: index + 1 }));
}
