// The look-ahead must be right (same scores as a plain search without
// shortcuts), find wins, see through exchanges, and be fast enough.
import { describe, expect, it } from "vitest";
import { applyMove, boardFrom, getLegalMoves, initialBoard, opponentOf, samePosition } from "../engine";
import type { Board, Player } from "../engine";
import { WIN, analyzeMoves, evaluate, isForced, turnsToResult } from "./search";

const EMPTY = "........";
const board = (rows: Record<number, string>): Board =>
  boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));

// A plain search that tries everything, with the same rules for depth and for
// continuing through captures, but no pruning. Slow, obviously correct.
function plain(position: Board, player: Player, depth: number, ply: number, extension: number): number {
  const moves = getLegalMoves(position, player);
  if (moves.length === 0) return -(WIN - ply);
  const mustCapture = moves[0]!.captured.length > 0;
  if (depth <= 0) {
    if (!mustCapture || extension >= 8) return evaluate(position, player);
    extension += 1;
  } else {
    depth -= 1;
  }
  return Math.max(...moves.map((m) => -plain(applyMove(position, m), opponentOf(player), depth, ply + 1, extension)));
}
const plainScores = (position: Board, player: Player, depth: number) =>
  getLegalMoves(position, player).map((m) => 0 - plain(applyMove(position, m), opponentOf(player), depth - 1, 1, 0));

// Positions from a seeded pseudo-random game, so the test is the same every run.
function randomPositions(count: number, seed: number): [Board, Player][] {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const out: [Board, Player][] = [];
  let position = initialBoard();
  let player: Player = "black";
  for (let i = 0; i < count; i++) {
    const moves = getLegalMoves(position, player);
    if (moves.length === 0) break;
    out.push([position, player]);
    position = applyMove(position, moves[Math.floor(next() * moves.length)]!);
    player = opponentOf(player);
  }
  return out;
}

describe("evaluate", () => {
  it("counts material from one side: man 100, King 160", () => {
    const position = board({ 0: ".B......", 7: "w.w....." });
    expect(evaluate(position, "black")).toBe(160 - 200);
    expect(evaluate(position, "white")).toBe(200 - 160);
    expect(evaluate(initialBoard(), "black")).toBe(0);
  });
});

describe("analyzeMoves", () => {
  it("gives exactly the same scores as a plain search without shortcuts", () => {
    for (const seed of [1, 7, 42]) {
      for (const [position, player] of randomPositions(30, seed).filter((_, i) => i % 3 === 0)) {
        for (const depth of [1, 2, 3, 4]) {
          const fast = analyzeMoves(position, player, depth).map((a) => a.score);
          expect(fast).toEqual(plainScores(position, player, depth));
        }
      }
    }
  }, 60_000);

  it("scores a move that takes the last piece as an immediate win", () => {
    const position = board({ 2: ".w......", 3: "..b....." });
    const [only] = analyzeMoves(position, "white", 2);
    expect(only!.score).toBe(WIN - 1);
    expect(isForced(only!.score)).toBe(true);
    expect(turnsToResult(only!.score)).toBe(1);
  });

  it("prefers the move that does not give a piece away", () => {
    // White on row 3 col 4 can step left (safe) or right, next to the black
    // piece on row 5 col 6, which would then jump it.
    const position = board({ 0: ".w......", 2: "...w....", 4: ".....b..", 7: "b......." });
    const analysis = analyzeMoves(position, "white", 2);
    const toward = analysis.find((a) => samePosition(a.move.to, { row: 3, col: 4 }))!;
    const away = analysis.find((a) => samePosition(a.move.to, { row: 3, col: 2 }))!;
    expect(away.score).toBeGreaterThan(toward.score);
  });

  it("sees the recapture at the end of an exchange (does not stop half way)", () => {
    // Black must take a piece, but White takes back. Even at depth 1 the
    // forced recapture is searched, so the trade leaves the balance as it
    // was (-1), instead of looking like a gain (0).
    const position = board({ 0: "...w....", 1: "....w...", 3: "....w...", 4: "...b....", 7: "b......." });
    const [capture, ...others] = analyzeMoves(position, "black", 1);
    expect(others).toHaveLength(0);
    expect(capture!.move.captured).toHaveLength(1);
    expect(capture!.score).toBe(evaluate(position, "black"));
    expect(capture!.score).toBe(-100);
  });

  it("spots a forced loss", () => {
    // White's only piece must step next to Black's piece and is taken.
    const position = board({ 0: ".......w", 2: ".....b.." });
    const scores = analyzeMoves(position, "white", 3).map((a) => a.score);
    expect(scores.every((score) => score < -WIN / 2)).toBe(true);
  });

  it("is fast enough for the Expert level (6 turns) on game positions", () => {
    const positions = randomPositions(24, 3).filter((_, i) => i % 4 === 0);
    const start = performance.now();
    for (const [position, player] of positions) analyzeMoves(position, player, 6);
    const average = (performance.now() - start) / positions.length;
    expect(average).toBeLessThan(3_000); // runs in a background thread in the app
  }, 60_000);
});
