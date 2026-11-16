// An online game as a list of moves on the wire (start square, then every
// landing square). Both sides use these: the server to check each move with
// the rules engine before it is stored, the browser to show the moves it
// receives. Pure.
import { applyMove, getLegalMoves, getWinner, initialBoard, opponentOf } from "../engine";
import type { Board, Move, Player, Position } from "../engine";
import { MAX_GAME_MOVES } from "../leaderboard/protocol";
import type { EncodedMove } from "../leaderboard/protocol";

const square = ({ row, col }: Position) => row * 8 + col;

/** True when `encoded` names exactly this move (the same start and the same landings). */
export function isSameMove(move: Move, encoded: EncodedMove): boolean {
  return encoded.length === move.path.length + 1 && encoded[0] === square(move.from) && move.path.every((position, index) => encoded[index + 1] === square(position));
}

/** A move with the right shape: a start square and 1 to 12 landings, each 0 to 63. */
export function isEncodedMove(value: unknown): value is EncodedMove {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 13 &&
    value.every((number) => Number.isInteger(number) && number >= 0 && number < 64)
  );
}

/** The legal move of `player` on `board` that `encoded` names, or null when there is none. */
export function decodeMove(board: Board, player: Player, encoded: EncodedMove): Move | null {
  return getLegalMoves(board, player).find((move) => isSameMove(move, encoded)) ?? null;
}

export interface ReplayedGame {
  readonly board: Board;
  readonly toMove: Player;
  readonly moves: readonly Move[];
  readonly winner: Player | null; // won on the board: the side to move has no legal move
}

/**
 * Plays the moves from the start (Black first). Null when one of them is not
 * legal at its point, or when the list is too long.
 */
export function replayMoves(encoded: readonly EncodedMove[]): ReplayedGame | null {
  if (encoded.length > MAX_GAME_MOVES) return null;
  let board = initialBoard();
  let toMove: Player = "black";
  const moves: Move[] = [];
  for (const item of encoded) {
    const move = decodeMove(board, toMove, item);
    if (!move) return null;
    board = applyMove(board, move);
    moves.push(move);
    toMove = opponentOf(toMove);
  }
  return { board, toMove, moves, winner: getWinner(board, toMove) };
}
