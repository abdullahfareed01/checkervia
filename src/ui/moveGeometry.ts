// Pure geometry for drawing and animating a move. No React, no DOM, so it
// can be unit tested. Board squares are 1 unit wide; (0,0) is the top-left
// corner of the board.
import type { Move, Position } from "../engine";

// How long one hop takes. A jump is a little slower than a step, so a
// multi jump is easy to follow.
export const STEP_MS = 220;
export const JUMP_MS = 300;

// Every square the piece visits, in order: the start, then each landing.
export function routeSquares(move: Move): Position[] {
  return [move.from, ...move.path];
}

// Centre of a square in board units (for the SVG route line).
export function squareCenter({ row, col }: Position): { x: number; y: number } {
  return { x: col + 0.5, y: row + 0.5 };
}

// Total animation time for a move.
export function moveDuration(move: Move): number {
  return move.path.length * (move.captured.length > 0 ? JUMP_MS : STEP_MS);
}

export interface HopFrame {
  // Offset from the start square, in squares.
  dx: number;
  dy: number;
  // Size of the moving piece: it grows a little in the middle of a jump,
  // so the hop over the captured piece is visible.
  scale: number;
  // When this frame happens, from 0 (start) to 1 (end).
  offset: number;
}

// Keyframes for the moving piece: one per landing square, plus a raised
// midpoint for each jump.
export function hopKeyframes(move: Move): HopFrame[] {
  const squares = routeSquares(move);
  const hops = move.path.length;
  const jumping = move.captured.length > 0;
  const frames: HopFrame[] = [{ dx: 0, dy: 0, scale: 1, offset: 0 }];

  for (let i = 1; i <= hops; i++) {
    const previous = squares[i - 1]!;
    const square = squares[i]!;
    if (jumping) {
      frames.push({
        dx: (previous.col + square.col) / 2 - move.from.col,
        dy: (previous.row + square.row) / 2 - move.from.row,
        scale: 1.18,
        offset: (i - 0.5) / hops,
      });
    }
    frames.push({
      dx: square.col - move.from.col,
      dy: square.row - move.from.row,
      scale: 1,
      offset: i / hops,
    });
  }
  return frames;
}

// When each captured piece should disappear: as the moving piece passes over
// it (the middle of the matching hop), as a fraction of the whole animation.
export function captureTimes(move: Move): number[] {
  const hops = move.path.length;
  return move.captured.map((_, index) => (index + 0.5) / hops);
}
