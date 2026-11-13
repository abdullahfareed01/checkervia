import { crownRow, pieceAt } from "./board";
import type { Board, Move, Piece, Position } from "./types";

// A regular piece that ends its move on its far row becomes a King.
function crownIfReached(piece: Piece, to: Position): Piece {
  const reachedFarRow = piece.kind === "man" && to.row === crownRow(piece.player);
  return reachedFarRow ? { player: piece.player, kind: "king" } : piece;
}

// Plays a move and returns a NEW board; the old board is left untouched.
// Order matters: lift the piece, remove captured pieces, then put the piece
// down. A chain can end where it started, so the start must be cleared first.
export function applyMove(board: Board, move: Move): Board {
  const piece = pieceAt(board, move.from);
  if (!piece) throw new Error("applyMove: no piece on the move's starting square");

  const next: (Piece | null)[][] = board.map((rowSquares) => [...rowSquares]);
  next[move.from.row]![move.from.col] = null;
  for (const { row, col } of move.captured) next[row]![col] = null;
  next[move.to.row]![move.to.col] = crownIfReached(piece, move.to);

  return next;
}
