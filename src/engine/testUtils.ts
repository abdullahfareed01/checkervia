// Helpers for engine tests only. Not part of the public engine API.
export { boardFrom } from "./board";
import type { Board, Move, Player, Position } from "./types";

// Shorthand for a position.
export function at(row: number, col: number): Position {
  return { row, col };
}

// Number of pieces a player has on the board.
export function countPieces(board: Board, player: Player): number {
  return board.flat().filter((piece) => piece?.player === player).length;
}

// Compact, order-independent description of moves, e.g. "5,0->4,1".
export function summarize(moves: readonly Move[]): string[] {
  return moves.map((m) => `${m.from.row},${m.from.col}->${m.to.row},${m.to.col}`).sort();
}
