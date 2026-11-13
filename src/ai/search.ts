// Look-ahead for the AI levels: the engine plays out every possible sequence
// of moves a few turns ahead (both sides playing their best) and scores each
// legal move. Pure TypeScript on top of the rules engine; no React, no network.
import { applyMove, getLegalMoves, opponentOf } from "../engine";
import type { Board, Move, Player } from "../engine";

// Material values, in hundredths of a piece. A King is worth more because it
// moves both ways.
const MAN = 100;
const KING = 160;
// Far above any material score. A win found sooner scores a little higher.
export const WIN = 100_000;
// Captures are forced, so stopping the search in the middle of an exchange
// would misjudge it. While the side to move must capture, keep searching, up
// to this many extra turns.
const MAX_CAPTURE_EXTENSION = 8;

export interface MoveAnalysis {
  readonly move: Move;
  // From the mover's side, after best play by both sides for `depth` turns:
  // material lead in hundredths of a piece, or near ±WIN for a forced result.
  readonly score: number;
}

/** Material balance from `player`'s side: their pieces minus the opponent's. */
export function evaluate(board: Board, player: Player): number {
  let total = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = piece.kind === "king" ? KING : MAN;
      total += piece.player === player ? value : -value;
    }
  }
  return total;
}

// Negamax with alpha-beta pruning: the best score `player` can force from
// here. `ply` counts turns from the root (used to prefer faster wins).
function negamax(
  board: Board,
  player: Player,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  extension: number,
): number {
  const moves = getLegalMoves(board, player);
  if (moves.length === 0) return -(WIN - ply); // no move: this side has lost

  const mustCapture = moves[0]!.captured.length > 0;
  if (depth <= 0) {
    if (!mustCapture || extension >= MAX_CAPTURE_EXTENSION) return evaluate(board, player);
    extension += 1; // an exchange is under way: look one turn further
  } else {
    depth -= 1;
  }

  let best = -Infinity;
  for (const move of moves) {
    const score = -negamax(applyMove(board, move), opponentOf(player), depth, -beta, -alpha, ply + 1, extension);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break; // the opponent would never allow this line
  }
  return best;
}

/**
 * Scores every legal move of `player`, looking `depth` turns ahead (the move
 * itself counts as the first turn). Each score is exact for that depth, so
 * moves can be compared. Returned in the engine's move order.
 */
export function analyzeMoves(board: Board, player: Player, depth: number): MoveAnalysis[] {
  const opponent = opponentOf(player);
  return getLegalMoves(board, player).map((move) => ({
    move,
    // `0 - x` rather than `-x`, so an even position is 0, never -0.
    score: 0 - negamax(applyMove(board, move), opponent, depth - 1, -Infinity, Infinity, 1, 0),
  }));
}

/** True if the score means a forced win (positive) or loss (negative). */
export function isForced(score: number): boolean {
  return Math.abs(score) > WIN / 2;
}

/** Turns until the forced result: 1 = this move ends the game. */
export function turnsToResult(score: number): number {
  return WIN - Math.abs(score);
}
