import { describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, opponentOf, samePosition } from "./index";
import { MOVES_WITHOUT_PROGRESS, drawReason, isProgress, positionKey } from "./draw";
import type { GamePosition } from "./draw";
import { at, boardFrom } from "./testUtils";
import type { Board, Move, Player, Position } from "./types";

// A Black King and a White King in opposite corners, far apart.
const KINGS = boardFrom([
  ".......W",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
  "B.......",
]);

// Plays the listed steps from `board` (Black first) and returns the game.
function play(board: Board, steps: readonly [Position, Position][], first: Player = "black"): GamePosition[] {
  const game: GamePosition[] = [{ board, move: null, player: null }];
  let toMove = first;
  for (const [from, to] of steps) {
    const current = game[game.length - 1]!.board;
    const move = getLegalMoves(current, toMove).find((m) => samePosition(m.from, from) && samePosition(m.to, to));
    if (!move) throw new Error(`no move ${from.row},${from.col} -> ${to.row},${to.col}`);
    game.push({ board: applyMove(current, move), move, player: toMove });
    toMove = opponentOf(toMove);
  }
  return game;
}

// Both Kings step out and back: after these four moves the start comes back.
const SHUFFLE: [Position, Position][] = [
  [at(7, 0), at(6, 1)],
  [at(0, 7), at(1, 6)],
  [at(6, 1), at(7, 0)],
  [at(1, 6), at(0, 7)],
];

describe("draw by repetition", () => {
  it("the same position with the same side to move a third time is a draw", () => {
    const twice = play(KINGS, [...SHUFFLE]);
    expect(drawReason(twice)).toBeNull(); // the start, seen twice
    const thrice = play(KINGS, [...SHUFFLE, ...SHUFFLE]);
    expect(drawReason(thrice)).toBe("repetition");
    // One move earlier it was not yet a draw.
    expect(drawReason(thrice.slice(0, -1))).toBeNull();
  });

  it("the side to move is part of the position", () => {
    expect(positionKey(KINGS, "black")).not.toBe(positionKey(KINGS, "white"));
  });
});

describe("draw after 40 moves each without progress", () => {
  // 81 distinct positions joined by quiet moves (no capture, no crowning):
  // the Kings stand on different squares each time, so nothing repeats.
  const dark = Array.from({ length: 64 }, (_, i) => at(Math.floor(i / 8), i % 8)).filter((p) => (p.row + p.col) % 2 === 1);
  const boardWith = (black: Position, white: Position): Board =>
    Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 8 }, (_, col) =>
        samePosition(black, at(row, col)) ? { player: "black" as const, kind: "king" as const } : samePosition(white, at(row, col)) ? { player: "white" as const, kind: "king" as const } : null,
      ),
    );
  const quiet: Move = { from: at(3, 4), to: at(4, 5), path: [at(4, 5)], captured: [] };
  const game = (moves: number): GamePosition[] =>
    Array.from({ length: moves + 1 }, (_, i) => ({
      board: boardWith(dark[i % 32]!, dark[(Math.floor(i / 32) + 7 + i) % 32] === dark[i % 32] ? dark[(i + 1) % 32]! : dark[(Math.floor(i / 32) + 7 + i) % 32]!),
      move: i === 0 ? null : quiet,
      player: i === 0 ? null : i % 2 === 1 ? ("black" as const) : ("white" as const),
    }));

  it("79 quiet moves in a row are not yet a draw; the 80th (40 each) is", () => {
    expect(2 * MOVES_WITHOUT_PROGRESS).toBe(80);
    expect(drawReason(game(79))).toBeNull();
    expect(drawReason(game(80))).toBe("noProgress");
  });

  it("a capture or a new King starts the count again", () => {
    const capture: Move = { ...quiet, captured: [at(5, 6)] };
    const withCapture = game(80).map((entry, i) => (i === 10 ? { ...entry, move: capture } : entry));
    expect(drawReason(withCapture)).toBeNull();
  });
});

describe("progress", () => {
  it("a capture is progress, and so is a man reaching the far row; a quiet step is not", () => {
    const board = boardFrom([
      "........",
      "..b.....",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
    ]);
    const crowning = getLegalMoves(board, "black").find((m) => m.to.row === 0)!;
    expect(isProgress(board, crowning)).toBe(true);
    expect(isProgress(KINGS, { from: at(7, 0), to: at(6, 1), path: [at(6, 1)], captured: [] })).toBe(false);
    expect(isProgress(KINGS, { from: at(7, 0), to: at(6, 1), path: [at(6, 1)], captured: [at(5, 2)] })).toBe(true);
  });
});
