// Pure geometry for drawing a move's route (the animation's timing is in
// animation/plan.ts). No React, no DOM, so it can be unit tested. Board
// squares are 1 unit wide; (0,0) is the top-left corner of the board.
import type { Board, Move, Position } from "../engine";

// Every square the piece visits, in order: the start, then each landing.
export function routeSquares(move: Move): Position[] {
  return [move.from, ...move.path];
}

// Centre of a square in board units (for the SVG route line).
export function squareCenter({ row, col }: Position): { x: number; y: number } {
  return { x: col + 0.5, y: row + 0.5 };
}

// The board turned round (D81): when you play White, your side is at the
// bottom of the screen. Screen squares are the board's squares rotated by
// half a turn; the rules and the names of the squares do not change.
export function flipPosition({ row, col }: Position): Position {
  return { row: 7 - row, col: 7 - col };
}

/** A move as drawn on the turned board. */
export function flipMove(move: Move): Move {
  return {
    from: flipPosition(move.from),
    to: flipPosition(move.to),
    path: move.path.map(flipPosition),
    captured: move.captured.map(flipPosition),
  };
}

/** The board as drawn when turned round: screen row r is board row 7 - r, reversed. */
export function flipBoard(board: Board): Board {
  return board.map((_, row) => [...board[board.length - 1 - row]!].reverse());
}
