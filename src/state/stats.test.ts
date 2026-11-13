// Game stats for the result popup: counted per side as moves are played.
import { describe, expect, it } from "vitest";
import { at, boardFrom } from "../engine/testUtils";
import { createGameState, gameReducer } from "./gameReducer";
import type { GameState } from "./gameReducer";

function clicks(state: GameState, ...squares: [number, number][]): GameState {
  return squares.reduce(
    (current, [row, col]) => gameReducer(current, { type: "click", position: at(row, col) }),
    state,
  );
}

describe("stats", () => {
  it("start at zero for both sides", () => {
    const { stats } = createGameState();
    expect(stats.black).toEqual({ moves: 0, captured: 0, kingsMade: 0, bestChain: 0 });
    expect(stats.white).toEqual({ moves: 0, captured: 0, kingsMade: 0, bestChain: 0 });
  });

  it("count each side's moves separately", () => {
    // Black steps, White steps next to it, Black must then capture.
    const state = clicks(createGameState(), [5, 2], [4, 3], [2, 1], [3, 2], [4, 3], [2, 1]);
    expect(state.stats.black.moves).toBe(2);
    expect(state.stats.black.captured).toBe(1);
    expect(state.stats.white.moves).toBe(1);
  });

  it("count captured pieces and the best multi jump", () => {
    const board = boardFrom([
      ".w......",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
      "...w....",
      "..b.....",
    ]);
    const state = clicks(createGameState({ board }), [7, 2], [3, 6]);
    expect(state.stats.black).toEqual({ moves: 1, captured: 2, kingsMade: 0, bestChain: 2 });
    expect(state.stats.white.captured).toBe(0);
  });

  it("count a King made on a simple move", () => {
    const board = boardFrom([
      "........",
      "..b.....",
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
    ]);
    const state = clicks(createGameState({ board }), [1, 2], [0, 1]);
    expect(state.stats.black.kingsMade).toBe(1);
  });

  it("count a King made at the end of a capture", () => {
    const board = boardFrom([
      "........",
      "....w.w.",
      "...b....",
      "........",
      "........",
      "........",
      "........",
      "........",
    ]);
    const state = clicks(createGameState({ board }), [2, 3], [0, 5]);
    expect(state.stats.black).toEqual({ moves: 1, captured: 1, kingsMade: 1, bestChain: 1 });
  });

  it("do not count a move by a piece that was already a King", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...B....",
      "........",
      ".....w..",
      "........",
    ]);
    const state = clicks(createGameState({ board }), [4, 3], [3, 2]);
    expect(state.stats.black.kingsMade).toBe(0);
  });

  it("are reset by New game", () => {
    const played = clicks(createGameState(), [5, 2], [4, 3]);
    const fresh = gameReducer(played, { type: "newGame" });
    expect(fresh.stats.black.moves).toBe(0);
  });
});
