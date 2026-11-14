// The win chance shown beside the board (D65), like the evaluation bar on
// chess.com, but as a percentage. Pure: the same look ahead the AI levels
// use, turned into a chance for Black.
import { getLegalMoves } from "../engine";
import type { Board, Player } from "../engine";
import { analyzeMoves, isForced } from "./search";

// Turns looked ahead. Four is quick on the page (well under a frame for an
// opening position) and sees the usual exchanges, since captures are always
// searched to their end.
export const WIN_CHANCE_DEPTH = 4;

// How a material lead becomes a chance: one man up on a full board is about
// 70%. The same lead counts for more as the board empties (one man up with
// six pieces left is close to winning), so the lead is scaled by the square
// root of 24 over the pieces left.
const SPREAD = 118;
const FULL_BOARD = 24;

/** Black's chance of winning from this position, 0 to 1 (White's is 1 minus it). */
export function winChance(board: Board, toMove: Player, depth = WIN_CHANCE_DEPTH): number {
  if (getLegalMoves(board, toMove).length === 0) return toMove === "black" ? 0 : 1;
  const best = Math.max(...analyzeMoves(board, toMove, depth).map((analysis) => analysis.score));
  const forBlack = toMove === "black" ? best : -best;
  // A forced result inside the search: as good as decided, but not over.
  if (isForced(forBlack)) return forBlack > 0 ? 0.99 : 0.01;
  const pieces = board.reduce((count, row) => count + row.filter(Boolean).length, 0);
  const lead = (forBlack / SPREAD) * Math.sqrt(FULL_BOARD / Math.max(pieces, 4));
  return Math.min(0.99, Math.max(0.01, 1 / (1 + Math.exp(-lead))));
}

/** Whole percentages that always add up to 100: [Black, White]. */
export function percentages(chance: number): [number, number] {
  const black = Math.round(chance * 100);
  return [black, 100 - black];
}
