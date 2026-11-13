import { describe, expect, it } from "vitest";
import { at, boardFrom } from "../engine/testUtils";
import { createGameState, gameReducer } from "./gameReducer";
import type { GameState } from "./gameReducer";
import {
  destinations,
  isCaptureMandatory,
  isGameInProgress,
  mustCapturePieces,
  pieceCounts,
  routeChoiceSquares,
  selectablePieces,
} from "./selectors";

function click(state: GameState, row: number, col: number): GameState {
  return gameReducer(state, { type: "click", position: at(row, col) });
}

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

const winBoard = boardFrom([
  "........",
  "........",
  "........",
  "........",
  ".....w..",
  "........",
  "...w....",
  "..b.....",
]);

describe("selectablePieces", () => {
  it("lists the four black pieces that can move at the start", () => {
    const squares = selectablePieces(createGameState());
    expect(squares).toHaveLength(4);
    expect(squares).toContainEqual(at(5, 0));
  });

  it("lists only the capturing piece when a capture is forced", () => {
    expect(selectablePieces(createGameState({ board: captureBoard }))).toEqual([at(5, 2)]);
  });
});

describe("forced capture display", () => {
  it("is off at the start and highlights nothing", () => {
    const state = createGameState();
    expect(isCaptureMandatory(state)).toBe(false);
    expect(mustCapturePieces(state)).toEqual([]);
  });

  it("is on when a capture exists and highlights the pieces that must capture", () => {
    const state = createGameState({ board: captureBoard });
    expect(isCaptureMandatory(state)).toBe(true);
    expect(mustCapturePieces(state)).toEqual([at(5, 2)]);
  });
});

describe("destinations", () => {
  it("is empty until a piece is selected", () => {
    expect(destinations(createGameState())).toEqual([]);
  });

  it("shows the legal steps of the selected piece", () => {
    const state = click(createGameState(), 5, 2);
    expect(destinations(state)).toEqual([
      { position: at(4, 1), capture: false },
      { position: at(4, 3), capture: false },
    ]);
  });

  it("marks capture destinations", () => {
    const state = click(createGameState({ board: captureBoard }), 5, 2);
    expect(destinations(state)).toEqual([{ position: at(3, 4), capture: true }]);
  });
});

describe("route choice squares", () => {
  it("shows the squares to pick from, and hides the destinations meanwhile", () => {
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
    const selected = click(createGameState({ board: diamond }), 6, 3);
    // One destination, even though two routes lead there.
    expect(destinations(selected)).toEqual([{ position: at(2, 3), capture: true }]);

    const pending = click(selected, 2, 3);
    expect(destinations(pending)).toEqual([]);
    expect(routeChoiceSquares(pending)).toEqual([at(4, 1), at(4, 5)]);
  });
});

describe("pieceCounts", () => {
  it("is 12 each at the start", () => {
    expect(pieceCounts(createGameState().board)).toEqual({ black: 12, white: 12 });
  });

  it("drops by one for a captured piece", () => {
    const state = click(click(createGameState({ board: captureBoard }), 5, 2), 3, 4);
    expect(pieceCounts(state.board)).toEqual({ black: 2, white: 1 });
  });
});

describe("isGameInProgress", () => {
  it("is false before any move", () => {
    expect(isGameInProgress(createGameState())).toBe(false);
  });

  it("is true after a move", () => {
    const state = click(click(createGameState(), 5, 2), 4, 3);
    expect(isGameInProgress(state)).toBe(true);
  });

  it("is false once someone has won", () => {
    const over = click(click(createGameState({ board: winBoard }), 7, 2), 3, 6);
    expect(over.winner).toBe("black");
    expect(isGameInProgress(over)).toBe(false);
  });
});
