// Pure geometry for drawing a move's route (the animation's timing is in
// animation/plan.ts). No React, no DOM, so it can be unit tested. Board
// squares are 1 unit wide; (0,0) is the top-left corner of the board.
import type { Move, Position } from "../engine";

// Every square the piece visits, in order: the start, then each landing.
export function routeSquares(move: Move): Position[] {
  return [move.from, ...move.path];
}

// Centre of a square in board units (for the SVG route line).
export function squareCenter({ row, col }: Position): { x: number; y: number } {
  return { x: col + 0.5, y: row + 0.5 };
}
