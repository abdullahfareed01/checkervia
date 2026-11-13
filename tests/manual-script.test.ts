// The exact click script given for testing by hand in the browser. Running it
// here proves the script works against the real state layer, so it stays valid.
// Squares are written as the player sees them: row 1 is the top row, column 1
// is the left column.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pieceAt } from "../src/engine";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";
import { isCaptureMandatory, mustCapturePieces, pieceCounts } from "../src/state/selectors";
import { Board } from "../src/ui/Board";

type Cell = [row: number, col: number];

function clickCell(state: GameState, [row, col]: Cell): GameState {
  return gameReducer(state, { type: "click", position: { row: row - 1, col: col - 1 } });
}

// One turn: click the piece, then click where it ends up.
function turn(state: GameState, from: Cell, to: Cell): GameState {
  return clickCell(clickCell(state, from), to);
}

describe("manual test script: forced captures, then a King", () => {
  const afterMove1 = turn(createGameState(), [6, 1], [5, 2]); // black steps
  const afterMove2 = turn(afterMove1, [3, 4], [4, 3]); // white steps next to black
  const afterMove3 = turn(afterMove2, [5, 2], [3, 4]); // black must capture
  const afterMove4 = turn(afterMove3, [2, 3], [4, 5]); // white must capture
  const afterMove5 = turn(afterMove4, [6, 5], [5, 6]); // black steps
  const afterMove6 = turn(afterMove5, [1, 2], [2, 3]); // white steps
  const afterMove7 = turn(afterMove6, [5, 6], [1, 2]); // black double jump and crown

  it("makes capturing mandatory for black on move 3, with only one piece able to move", () => {
    expect(isCaptureMandatory(afterMove2)).toBe(true);
    expect(mustCapturePieces(afterMove2)).toEqual([{ row: 4, col: 1 }]);
  });

  it("makes capturing mandatory for white on move 4", () => {
    expect(isCaptureMandatory(afterMove3)).toBe(true);
    expect(afterMove3.currentPlayer).toBe("white");
  });

  it("is a normal move on turns 5 and 6", () => {
    expect(isCaptureMandatory(afterMove4)).toBe(false);
    expect(isCaptureMandatory(afterMove5)).toBe(false);
  });

  it("ends with a black King on row 1, column 2 after capturing two pieces", () => {
    expect(afterMove7.movesPlayed).toBe(7);
    expect(pieceAt(afterMove7.board, { row: 0, col: 1 })).toEqual({ player: "black", kind: "king" });
    // White lost 3 pieces over the script, black lost 1.
    expect(pieceCounts(afterMove7.board)).toEqual({ black: 11, white: 9 });
    expect(afterMove7.currentPlayer).toBe("white");
    expect(afterMove7.winner).toBeNull();
  });

  it("draws the King with its own style and highlights the last move", () => {
    const html = renderToStaticMarkup(
      createElement(Board, {
        view: {
          board: afterMove7.board,
          selected: null,
          selectable: [],
          mustCapture: [],
          destinations: [],
          routeChoices: [],
          lastMove: afterMove7.lastMove,
          locked: false,
        },
        onSquareClick: () => {},
      }),
    );
    expect(html.match(/piece-king/g)).toHaveLength(1);
    expect(html).toContain("square-last-move");
    expect(html).toContain("black king");
  });
});
