// Which moves the model may choose from at a level: the engine's best few,
// by look-ahead score. Deterministic (same position and level, same list), so
// the server can later check that every AI move was really on the list.
import type { Board, Player } from "../engine";
import { AI_LEVELS } from "./difficulty";
import type { AiLevel } from "./difficulty";
import { analyzeMoves } from "./search";

/**
 * Indexes (into the legal move list) of the `limit` best-scored moves, kept in
 * the engine's move order. Ties are broken by that order: the earlier move is
 * kept. Without a limit, every move is a candidate.
 */
export function pickCandidates(scores: readonly number[], limit?: number): number[] {
  const all = scores.map((_, index) => index);
  if (limit === undefined || limit >= scores.length) return all;
  const best = [...all].sort((a, b) => scores[b]! - scores[a]! || a - b).slice(0, limit);
  return best.sort((a, b) => a - b);
}

/** The candidate indexes for `player` at `level`, worked out on the spot. */
export function candidatesAt(board: Board, player: Player, level: AiLevel): number[] {
  const { depth, candidates } = AI_LEVELS[level];
  return pickCandidates(analyzeMoves(board, player, depth).map((analysis) => analysis.score), candidates);
}
