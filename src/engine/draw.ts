// The draw rules (D89, replacing D5's "no draw rule"), after the tournament
// rules of American checkers. There is no referee to claim a draw, so the
// game applies them itself:
// - repetition: the same position, with the same side to move, for the
//   third time;
// - no progress: 40 moves by each side (80 in a row) without a capture and
//   without a new King.
// Pure: same input, same output; nothing is changed.
import { opponentOf, pieceAt } from "./board";
import type { Board, Move, Player } from "./types";

export type DrawReason = "repetition" | "noProgress";

/** The third time a position comes back is a draw. */
export const REPETITIONS_FOR_DRAW = 3;
/** Moves by each side without a capture or a new King that make a draw. */
export const MOVES_WITHOUT_PROGRESS = 40;

/** One position of a game: the board, and the move and mover that led to it (null at the start). */
export interface GamePosition {
  readonly board: Board;
  readonly move: Move | null;
  readonly player: Player | null;
}

/** A position as text: every square and the side to move. Equal text, equal position. */
export function positionKey(board: Board, toMove: Player): string {
  const squares = board.map((row) => row.map((piece) => (piece ? (piece.player === "black" ? "b" : "w") + (piece.kind === "king" ? "K" : "m") : ".")).join("")).join("/");
  return `${toMove}:${squares}`;
}

/** True when `move`, played on `before`, captured something or made a King. */
export function isProgress(before: Board, move: Move): boolean {
  if (move.captured.length > 0) return true;
  return pieceAt(before, move.from)?.kind === "man" && (move.to.row === 0 || move.to.row === before.length - 1);
}

/**
 * Whether the game is drawn at its last position, and why. `positions` is
 * the game from its start; `firstToMove` is the side to move at the start
 * (Black in a normal game).
 */
export function drawReason(positions: readonly GamePosition[], firstToMove: Player = "black"): DrawReason | null {
  const toMoveAt = (index: number) => {
    const mover = positions[index]!.player;
    return mover ? opponentOf(mover) : firstToMove;
  };
  const last = positions.length - 1;
  if (last < 1) return null;

  // No progress: count the moves in a row, from the end, that neither
  // captured nor crowned.
  let quiet = 0;
  for (let index = last; index >= 1; index -= 1) {
    const { move } = positions[index]!;
    if (!move || isProgress(positions[index - 1]!.board, move)) break;
    quiet += 1;
  }
  if (quiet >= 2 * MOVES_WITHOUT_PROGRESS) return "noProgress";

  // Repetition: a position can only come back after quiet moves (a capture
  // or a new King changes the pieces for good), so only those are searched.
  const key = positionKey(positions[last]!.board, toMoveAt(last));
  let seen = 0;
  for (let index = last; index >= last - quiet; index -= 1) {
    if (positionKey(positions[index]!.board, toMoveAt(index)) === key) seen += 1;
  }
  return seen >= REPETITIONS_FOR_DRAW ? "repetition" : null;
}
