// BUG-001 investigation: is it possible for the game to play an illegal move?
//
// 1. A second, independent rules implementation (written separately, on a
//    flat 64-square array) is compared with the real engine on thousands of
//    positions from random games and random boards.
// 2. Every applied move is checked against basic invariants.
// 3. Random games are played through the real reducer in vs-AI mode, with a
//    fake AI that picks a random legal number, to check the AI path never
//    lets an illegal move through.
// Seeded random numbers, so a failure always reproduces.
import { describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, initialBoard } from "../src/engine";
import type { Board, Move, Piece, Player } from "../src/engine";
import { createGameState, gameReducer, isGameOver } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";

// These tests do real work (about 2.5 s together); give them room so a busy
// machine cannot make them fail on time alone.
const HEAVY_TEST_MS = 30_000;

// ---------- seeded random numbers ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the independent reference implementation ----------
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const signature = (from: number, path: number[], taken: number[]) =>
  `${from}:${path.join(",")}x${taken.join(",")}`;

function referenceMoves(board: Board, player: Player): string[] {
  const cells: (Piece | null)[] = board.flat();
  const forward = player === "black" ? -1 : 1;
  const crownRow = player === "black" ? 0 : 7;
  const captures: string[] = [];
  const steps: string[] = [];

  for (let start = 0; start < 64; start++) {
    const piece = cells[start];
    if (!piece || piece.player !== player) continue;
    const row = Math.floor(start / 8);
    const col = start % 8;
    const rowSteps = piece.kind === "king" ? [-1, 1] : [forward];

    for (const dr of rowSteps) {
      for (const dc of [-1, 1]) {
        const r = row + dr;
        const c = col + dc;
        if (inside(r, c) && cells[r * 8 + c] === null) steps.push(signature(start, [r * 8 + c], []));
      }
    }

    // The piece leaves its start square; captured pieces stay until the end.
    const lifted = cells.slice();
    lifted[start] = null;
    const walk = (r0: number, c0: number, path: number[], taken: number[]) => {
      const crowned = piece.kind === "man" && path.length > 0 && r0 === crownRow;
      let extended = false;
      if (!crowned) {
        for (const dr of rowSteps) {
          for (const dc of [-1, 1]) {
            const midR = r0 + dr;
            const midC = c0 + dc;
            const landR = r0 + 2 * dr;
            const landC = c0 + 2 * dc;
            if (!inside(landR, landC)) continue;
            const mid = lifted[midR * 8 + midC];
            if (!mid || mid.player === player) continue;
            if (taken.includes(midR * 8 + midC)) continue;
            if (lifted[landR * 8 + landC] !== null) continue;
            extended = true;
            walk(landR, landC, [...path, landR * 8 + landC], [...taken, midR * 8 + midC]);
          }
        }
      }
      if (!extended && path.length > 0) captures.push(signature(start, path, taken));
    };
    walk(row, col, [], []);
  }
  return (captures.length > 0 ? captures : steps).sort();
}

const index = (p: { row: number; col: number }) => p.row * 8 + p.col;
const engineMoves = (board: Board, player: Player) =>
  getLegalMoves(board, player)
    .map((m) => signature(index(m.from), m.path.map(index), m.captured.map(index)))
    .sort();

// Cheap check for hot loops (expect() is slow when called millions of times).
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
function sameMoves(board: Board, player: Player): void {
  const a = engineMoves(board, player).join("|");
  const b = referenceMoves(board, player).join("|");
  if (a !== b) expect(engineMoves(board, player)).toEqual(referenceMoves(board, player)); // readable diff
}

// ---------- invariants of an applied move ----------
function checkApplied(before: Board, move: Move, after: Board, player: Player) {
  const count = (b: Board) => b.flat().filter(Boolean).length;
  check(count(after) === count(before) - move.captured.length, "piece count");

  const moved = after[move.to.row]![move.to.col];
  check(moved?.player === player, "moved piece missing");
  if (index(move.from) !== index(move.to)) check(after[move.from.row]![move.from.col] === null, "start not empty");

  for (const c of move.captured) {
    const victim = before[c.row]![c.col];
    check(victim !== null && victim !== undefined && victim.player !== player, "captured square was not an opponent");
    check(after[c.row]![c.col] === null, "captured piece still there");
  }

  // Each hop is one diagonal step (no capture) or a jump over a captured piece.
  const squares = [move.from, ...move.path];
  for (let i = 1; i < squares.length; i++) {
    const a = squares[i - 1]!;
    const b = squares[i]!;
    const distance = Math.abs(b.row - a.row);
    check(Math.abs(b.col - a.col) === distance, "not diagonal");
    check(distance === (move.captured.length > 0 ? 2 : 1), "wrong hop length");
    if (distance === 2) {
      const mid = move.captured[i - 1];
      check(mid !== undefined && mid.row === (a.row + b.row) / 2 && mid.col === (a.col + b.col) / 2, "jump does not match captured piece");
    }
  }

  after.forEach((rowSquares, r) =>
    rowSquares.forEach((p, c) => {
      if (!p) return;
      check((r + c) % 2 === 1, "piece on a light square");
      if (p.kind === "man") check(r !== (p.player === "black" ? 0 : 7), "uncrowned man on its crown row");
    }),
  );
}

// ---------- random positions ----------
function randomBoard(random: () => number): Board {
  return Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c): Piece | null => {
      if ((r + c) % 2 === 0 || random() > 0.4) return null;
      const player: Player = random() < 0.5 ? "black" : "white";
      const onCrownRow = r === (player === "black" ? 0 : 7);
      return { player, kind: onCrownRow || random() < 0.3 ? "king" : "man" };
    }),
  );
}

describe("BUG-001: engine cross-check against an independent implementation", () => {
  it("agrees on every position in 300 random games, and every move keeps the invariants", () => {
    const random = rng(2026);
    let positions = 0;
    let multiJumps = 0;
    let kingMoves = 0;

    for (let game = 0; game < 300; game++) {
      let board = initialBoard();
      let player: Player = "black";
      for (let ply = 0; ply < 200; ply++) {
        const moves = getLegalMoves(board, player);
        sameMoves(board, player);
        positions++;
        if (moves.length === 0) break;

        const move = moves[Math.floor(random() * moves.length)]!;
        if (move.captured.length > 1) multiJumps++;
        if (board[move.from.row]![move.from.col]?.kind === "king") kingMoves++;
        const next = applyMove(board, move);
        checkApplied(board, move, next, player);
        board = next;
        player = player === "black" ? "white" : "black";
      }
    }
    // Make sure the games really reached the interesting cases.
    expect(positions).toBeGreaterThan(10_000);
    expect(multiJumps).toBeGreaterThan(50);
    expect(kingMoves).toBeGreaterThan(500);
  }, HEAVY_TEST_MS);

  it("agrees on 5000 random boards with men and Kings, for both players", () => {
    const random = rng(7);
    for (let i = 0; i < 5000; i++) {
      const board = randomBoard(random);
      for (const player of ["black", "white"] as const) {
        sameMoves(board, player);
      }
    }
  }, HEAVY_TEST_MS);
});

describe("BUG-001: the AI path never plays an illegal move", () => {
  it("in 100 random vs-AI games through the real reducer, every AI move is a legal move", () => {
    const random = rng(99);
    let aiMoves = 0;

    for (let game = 0; game < 100; game++) {
      let state: GameState = createGameState({ mode: "vs-ai" });
      // A game may also end in a draw now (D89).
      for (let turn = 0; turn < 120 && !isGameOver(state); turn++) {
        if (state.aiPhase === "thinking") {
          // Fake AI: picks a random legal move, like a valid model answer would.
          const legal = getLegalMoves(state.board, "white");
          check(state.legalMoves.length === legal.length, "state legal list differs from engine");
          const move = legal[Math.floor(random() * legal.length)]!;
          const before = state;
          state = gameReducer(state, { type: "aiMoved", requestId: state.aiRequestId, move });
          check(state.movesPlayed === before.movesPlayed + 1, "AI move was not played");
          checkApplied(before.board, move, state.board, "white");
          aiMoves++;
        } else {
          // Human (black): click the start square, then the end square.
          const move = state.legalMoves[Math.floor(random() * state.legalMoves.length)]!;
          state = gameReducer(state, { type: "click", position: move.from });
          state = gameReducer(state, { type: "click", position: move.to });
          // If two routes end on the same square, pick by clicking the route squares.
          while (state.pendingRoutes.length > 0) {
            const route = state.pendingRoutes[0]!;
            const next = route.path.find((square) =>
              state.pendingRoutes.some((other) => other !== route && other.path.some((s) => s.row !== square.row || s.col !== square.col)),
            )!;
            state = gameReducer(state, { type: "click", position: next });
          }
        }
        check(state.currentPlayer !== "white" || state.aiPhase !== "idle" || isGameOver(state), "white to move but AI not thinking");
      }
    }
    expect(aiMoves).toBeGreaterThan(2000);
  }, HEAVY_TEST_MS);
});
