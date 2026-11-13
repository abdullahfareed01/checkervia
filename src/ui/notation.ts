// Square and move names as printed around the board: columns A to H from
// left to right, rows 8 (top) to 1 (bottom), like a chess board. The AI's
// prompt uses the same names (src/ai/prompt.ts), so everything matches.
import { squareName } from "../engine";
import type { Move } from "../engine";

export { squareName };

/** Column letters A..H and row numbers 8..1, for the board's edge labels. */
export const FILE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const RANK_LABELS = [8, 7, 6, 5, 4, 3, 2, 1];

// "C3 → D4" for a step, "C1 → E3 → G5 ×2" for a double jump, and a crown
// mark if the move made a King.
export function moveText(move: Move, crowned = false): string {
  const squares = [move.from, ...move.path].map(squareName).join(" → ");
  const captures = move.captured.length > 0 ? ` ×${move.captured.length}` : "";
  return `${squares}${captures}${crowned ? " ♛" : ""}`;
}
