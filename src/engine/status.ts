import { opponentOf } from "./board";
import { getLegalMoves } from "./moves";
import type { Board, Player } from "./types";

// The winner, or null if the game goes on. The player to move loses if they
// have no legal moves, which also covers having no pieces left.
export function getWinner(board: Board, playerToMove: Player): Player | null {
  return getLegalMoves(board, playerToMove).length === 0 ? opponentOf(playerToMove) : null;
}
