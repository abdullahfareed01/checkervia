// DEVELOPMENT ONLY. Prepared positions one move from the end, so the result
// popup can be checked without playing a whole game. Opened with
// ?scenario=win, ?scenario=lose, ?scenario=duel or ?scenario=react while
// running the dev server.
// main.tsx only loads this file in development, so it is not in the
// production build.
import { boardFrom } from "../engine/testUtils";
import type { GameOptions } from "../state/gameReducer";

// Black's piece on row 8 can double-jump both White pieces and win.
const lastDoubleJump = boardFrom([
  "........",
  "........",
  "........",
  "........",
  ".....w..",
  "........",
  "...w....",
  "..b.....",
]);

// Black's last piece must step forward; White then captures it and wins.
const lastBlackPiece = boardFrom([
  "........",
  "........",
  "........",
  "....w...",
  "........",
  "..b.....",
  "........",
  "........",
]);

// Black's E3 -> D4 steps next to White's C5, which then jumps it: a blunder
// the engine spots, so the AI reacts to it. E3 -> F4 is safe.
const blunderTrap = boardFrom([
  ".......w",
  "........",
  "........",
  "..w.....",
  "........",
  "....b...",
  "........",
  "b.......",
]);

const SCENARIOS: Record<string, GameOptions> = {
  // vs AI: you win with a double jump (row 8 col 3 -> row 4 col 7).
  win: { mode: "vs-ai", board: lastDoubleJump },
  // vs AI: step row 6 col 3 -> row 5 col 4; the AI captures your last piece.
  lose: { mode: "vs-ai", board: lastBlackPiece },
  // vs AI: play E3 -> D4 (a blunder) and the AI teases you about it.
  react: { mode: "vs-ai", board: blunderTrap },
  // Two players: Black wins with the same double jump.
  duel: { mode: "two-player", board: lastDoubleJump },
};

export function scenario(name: string): GameOptions | undefined {
  return SCENARIOS[name];
}
