import { describe, expect, it } from "vitest";
import { pieceAt } from "../engine";
import { at, boardFrom } from "../engine/testUtils";
import { createGameState, gameReducer } from "./gameReducer";
import type { GameState } from "./gameReducer";

// Test helpers: send one click, or a list of clicks given as [row, col].
function click(state: GameState, row: number, col: number): GameState {
  return gameReducer(state, { type: "click", position: at(row, col) });
}

function clicks(state: GameState, ...squares: [number, number][]): GameState {
  return squares.reduce((current, [row, col]) => click(current, row, col), state);
}

// Black (5,2) can capture white (4,3). Black (7,0) can only step. White (0,1)
// keeps the game going after the capture.
const captureBoard = boardFrom([
  ".w......",
  "........",
  "........",
  "........",
  "...w....",
  "..b.....",
  "........",
  "b.......",
]);

describe("new game state", () => {
  const state = createGameState();

  it("starts with black to move, nothing selected and no winner", () => {
    expect(state.currentPlayer).toBe("black");
    expect(state.selected).toBeNull();
    expect(state.winner).toBeNull();
    expect(state.mode).toBe("two-player");
    expect(state.movesPlayed).toBe(0);
  });

  it("holds the legal moves for black", () => {
    expect(state.legalMoves).toHaveLength(7);
  });
});

describe("selecting", () => {
  const start = createGameState();

  it("selects one of the current player's pieces that can move", () => {
    expect(click(start, 5, 2).selected).toEqual(at(5, 2));
  });

  it("does not select the opponent's piece", () => {
    expect(click(start, 2, 1).selected).toBeNull();
  });

  it("does not select a piece that has no legal move", () => {
    // Black (7,0) is boxed in by its own pieces at the start.
    expect(click(start, 7, 0).selected).toBeNull();
  });

  it("clicking the selected piece again deselects it", () => {
    expect(clicks(start, [5, 2], [5, 2]).selected).toBeNull();
  });

  it("clicking an empty square that is not a destination deselects", () => {
    expect(clicks(start, [5, 2], [3, 0]).selected).toBeNull();
  });

  it("clicking a light square deselects", () => {
    expect(clicks(start, [5, 2], [0, 0]).selected).toBeNull();
  });

  it("clicking another of your pieces switches the selection", () => {
    expect(clicks(start, [5, 2], [5, 4]).selected).toEqual(at(5, 4));
  });
});

describe("playing a move and switching turns", () => {
  const afterBlack = clicks(createGameState(), [5, 2], [4, 3]);

  it("moves the piece and clears the selection", () => {
    expect(pieceAt(afterBlack.board, at(4, 3))).toEqual({ player: "black", kind: "man" });
    expect(pieceAt(afterBlack.board, at(5, 2))).toBeNull();
    expect(afterBlack.selected).toBeNull();
    expect(afterBlack.movesPlayed).toBe(1);
    expect(afterBlack.lastMove?.to).toEqual(at(4, 3));
  });

  it("hands the turn to white and recomputes the legal moves for white", () => {
    expect(afterBlack.currentPlayer).toBe("white");
    expect(afterBlack.legalMoves).toHaveLength(7);
    afterBlack.legalMoves.forEach((move) =>
      expect(pieceAt(afterBlack.board, move.from)?.player).toBe("white"),
    );
  });

  it("does not let black select again on white's turn", () => {
    expect(click(afterBlack, 4, 3).selected).toBeNull();
  });

  it("gives the turn back to black after white moves", () => {
    const afterWhite = clicks(afterBlack, [2, 1], [3, 2]);
    expect(afterWhite.currentPlayer).toBe("black");
    expect(afterWhite.movesPlayed).toBe(2);
  });
});

describe("capturing", () => {
  it("plays the capture and removes the captured piece", () => {
    const state = clicks(createGameState({ board: captureBoard }), [5, 2], [3, 4]);
    expect(pieceAt(state.board, at(3, 4))).toEqual({ player: "black", kind: "man" });
    expect(pieceAt(state.board, at(4, 3))).toBeNull();
    expect(pieceAt(state.board, at(5, 2))).toBeNull();
    expect(state.currentPlayer).toBe("white");
    expect(state.winner).toBeNull();
  });

  it("plays a whole multi jump from one click on the final square", () => {
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
    expect(pieceAt(state.board, at(3, 6))).toEqual({ player: "black", kind: "man" });
    expect(pieceAt(state.board, at(6, 3))).toBeNull();
    expect(pieceAt(state.board, at(4, 5))).toBeNull();
    expect(pieceAt(state.board, at(0, 1))).not.toBeNull(); // the far white piece is untouched
  });
});

describe("forced capture", () => {
  const forced = createGameState({ board: captureBoard });

  it("only keeps capture moves in the legal list", () => {
    expect(forced.legalMoves).toHaveLength(1);
    expect(forced.legalMoves[0]!.captured).toEqual([at(4, 3)]);
  });

  it("blocks selecting a piece that cannot capture", () => {
    expect(click(forced, 7, 0).selected).toBeNull();
  });

  it("allows selecting the piece that must capture", () => {
    expect(click(forced, 5, 2).selected).toEqual(at(5, 2));
  });

  it("does not play a plain step while a capture is available", () => {
    // (4,1) is a normal step for the piece on (5,2), but it is not legal now.
    const state = clicks(forced, [5, 2], [4, 1]);
    expect(state.movesPlayed).toBe(0);
    expect(state.currentPlayer).toBe("black");
  });
});

describe("winner", () => {
  it("ends the game when the opponent has no pieces left", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
      "...w....",
      "..b.....",
    ]);
    const state = clicks(createGameState({ board }), [7, 2], [3, 6]);
    expect(state.winner).toBe("black");
    expect(state.legalMoves).toEqual([]);
  });

  it("ends the game when the opponent has pieces but no legal moves", () => {
    // White (1,0) is blocked by black (2,1), and the jump needs (3,2), also black.
    const board = boardFrom([
      "........",
      "w.......",
      ".b......",
      "..b.....",
      "........",
      "........",
      ".....b..",
      "........",
    ]);
    const state = clicks(createGameState({ board }), [6, 5], [5, 4]);
    expect(state.winner).toBe("black");
  });

  it("locks the board: clicks after the game is over change nothing", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
      "...w....",
      "..b.....",
    ]);
    const over = clicks(createGameState({ board }), [7, 2], [3, 6]);
    expect(click(over, 3, 6)).toBe(over);
    expect(click(over, 0, 1)).toBe(over);
  });
});

describe("new game", () => {
  it("resets a game in progress", () => {
    const played = clicks(createGameState(), [5, 2], [4, 3], [2, 1], [3, 2]);
    const reset = gameReducer(played, { type: "newGame" });
    // Everything is fresh except the request id, which moves on so that any
    // late AI reply from the old game can be recognised as stale.
    expect(reset.aiRequestId).toBe(played.aiRequestId + 1);
    expect({ ...reset, aiRequestId: 0 }).toEqual(createGameState());
  });

  it("resets after a win", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
      "...w....",
      "..b.....",
    ]);
    const over = clicks(createGameState({ board }), [7, 2], [3, 6]);
    const fresh = gameReducer(over, { type: "newGame" });
    expect(fresh.winner).toBeNull();
    expect({ ...fresh, aiRequestId: 0 }).toEqual(createGameState());
  });
});

describe("choosing between routes to the same square", () => {
  // Black (6,3) can reach (2,3) by taking (5,2)+(3,2) or by taking (5,4)+(3,4).
  const diamond = boardFrom([
    "........",
    "........",
    "........",
    "..w.w...",
    "........",
    "..w.w...",
    "...b....",
    "........",
  ]);
  const start = createGameState({ board: diamond });

  it("does not guess: it waits for the player to pick a route", () => {
    const pending = clicks(start, [6, 3], [2, 3]);
    expect(pending.pendingRoutes).toHaveLength(2);
    expect(pending.board).toBe(start.board);
    expect(pending.currentPlayer).toBe("black");
    expect(pending.movesPlayed).toBe(0);
  });

  it("plays the chosen route when the player clicks the next landing square", () => {
    const state = clicks(start, [6, 3], [2, 3], [4, 5]);
    expect(pieceAt(state.board, at(2, 3))).toEqual({ player: "black", kind: "man" });
    // The route through (4,5) took the pieces on (5,4) and (3,4) only.
    expect(pieceAt(state.board, at(5, 4))).toBeNull();
    expect(pieceAt(state.board, at(3, 4))).toBeNull();
    expect(pieceAt(state.board, at(5, 2))).not.toBeNull();
    expect(pieceAt(state.board, at(3, 2))).not.toBeNull();
    expect(state.pendingRoutes).toEqual([]);
    expect(state.currentPlayer).toBe("white");
  });

  it("plays the other route when the other square is clicked", () => {
    const state = clicks(start, [6, 3], [2, 3], [4, 1]);
    expect(pieceAt(state.board, at(5, 2))).toBeNull();
    expect(pieceAt(state.board, at(3, 2))).toBeNull();
    expect(pieceAt(state.board, at(5, 4))).not.toBeNull();
  });

  it("clicking elsewhere cancels the choice and deselects", () => {
    const state = clicks(start, [6, 3], [2, 3], [3, 0]);
    expect(state.pendingRoutes).toEqual([]);
    expect(state.selected).toBeNull();
    expect(state.movesPlayed).toBe(0);
  });
});
