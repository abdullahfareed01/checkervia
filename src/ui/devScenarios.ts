// DEVELOPMENT ONLY. Prepared positions one move from the end, so the result
// popup can be checked without playing a whole game. Opened with
// ?scenario=win, ?scenario=lose, ?scenario=duel, ?scenario=react,
// ?scenario=react-strong, ?scenario=draw or ?scenario=airesign while
// running the dev server.
// main.tsx only loads this file in development, so it is not in the
// production build.
import { boardFrom } from "../engine/testUtils";
import type { Move, Position } from "../engine";
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

// D89: a Black King on A1 and a White King on H8, alone. They step out and
// back twice; after the first seven of those moves the start has come back
// once, so White's King going back from G7 to H8 makes it the third time:
// a draw by repetition.
const lonelyKings = boardFrom([
  ".......W",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "B.......",
]);
const step = (from: Position, to: Position): Move => ({ from, to, path: [to], captured: [] });
const A1 = { row: 7, col: 0 };
const B2 = { row: 6, col: 1 };
const H8 = { row: 0, col: 7 };
const G7 = { row: 1, col: 6 };
const shuffleTwice: Move[] = [step(A1, B2), step(H8, G7), step(B2, A1), step(G7, H8), step(A1, B2), step(H8, G7), step(B2, A1)];

// D89: White (the AI) has one man left on A7 and Black waits on C5. Play a
// quiet move with your man on G1 (to F2 or H2): the AI's only move, A7 to
// B6, loses its last piece, the engine proves it, and the AI resigns.
const aiLost = boardFrom([
  "........",
  "w.......",
  "........",
  "..b.....",
  "........",
  "........",
  "........",
  "......b.",
]);

const SCENARIOS: Record<string, GameOptions> = {
  // vs AI: you win with a double jump (row 8 col 3 -> row 4 col 7).
  win: { mode: "vs-ai", board: lastDoubleJump },
  // vs AI: step row 6 col 3 -> row 5 col 4; the AI captures your last piece.
  lose: { mode: "vs-ai", board: lastBlackPiece },
  // vs AI: play E3 -> D4 (a blunder) and the AI teases you about it.
  react: { mode: "vs-ai", board: blunderTrap },
  // The same at Strongest, to see the strong language rules (D45). Being a
  // development preview, it skips the 18+ consent.
  "react-strong": { mode: "vs-ai", board: blunderTrap, aiLevel: 4 },
  // Two players: Black wins with the same double jump.
  duel: { mode: "two-player", board: lastDoubleJump },
  // D89, two players: move White's King from G7 back to H8; the position
  // comes up a third time and the game is a draw.
  draw: { mode: "two-player", board: lonelyKings, record: shuffleTwice },
  // D89, vs AI: move G1 to F2 (or H2); the AI resigns its lost position.
  airesign: { mode: "vs-ai", board: aiLost },
};

export function scenario(name: string): GameOptions | undefined {
  return SCENARIOS[name];
}
