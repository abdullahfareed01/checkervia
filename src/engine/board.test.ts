import { describe, expect, it } from "vitest";
import { BOARD_SIZE, crownRow, forwardStep, initialBoard, isDarkSquare, opponentOf } from "./board";
import type { Board, Player, Position } from "./types";

// Test helper: every occupied square with its piece.
function occupied(board: Board) {
  const found: { pos: Position; player: Player; kind: string }[] = [];
  board.forEach((rowSquares, row) =>
    rowSquares.forEach((piece, col) => {
      if (piece) found.push({ pos: { row, col }, player: piece.player, kind: piece.kind });
    }),
  );
  return found;
}

describe("isDarkSquare", () => {
  it("is true where row + col is odd", () => {
    expect(isDarkSquare(0, 1)).toBe(true);
    expect(isDarkSquare(1, 0)).toBe(true);
    expect(isDarkSquare(7, 6)).toBe(true);
  });

  it("is false where row + col is even", () => {
    expect(isDarkSquare(0, 0)).toBe(false);
    expect(isDarkSquare(1, 1)).toBe(false);
    expect(isDarkSquare(7, 7)).toBe(false);
  });

  it("gives 32 dark squares on an 8x8 board", () => {
    let dark = 0;
    for (let row = 0; row < BOARD_SIZE; row++)
      for (let col = 0; col < BOARD_SIZE; col++) if (isDarkSquare(row, col)) dark++;
    expect(dark).toBe(32);
  });
});

describe("orientation helpers", () => {
  it("black moves up the board (row numbers fall) and crowns on row 0", () => {
    expect(forwardStep("black")).toBe(-1);
    expect(crownRow("black")).toBe(0);
  });

  it("white moves down the board (row numbers rise) and crowns on row 7", () => {
    expect(forwardStep("white")).toBe(1);
    expect(crownRow("white")).toBe(7);
  });

  it("opponentOf returns the other side", () => {
    expect(opponentOf("black")).toBe("white");
    expect(opponentOf("white")).toBe("black");
  });
});

describe("initialBoard", () => {
  const board = initialBoard();

  it("is 8 rows of 8 columns", () => {
    expect(board).toHaveLength(8);
    board.forEach((row) => expect(row).toHaveLength(8));
  });

  it("has 12 black and 12 white pieces", () => {
    const pieces = occupied(board);
    expect(pieces.filter((p) => p.player === "black")).toHaveLength(12);
    expect(pieces.filter((p) => p.player === "white")).toHaveLength(12);
    expect(pieces).toHaveLength(24);
  });

  it("puts pieces on dark squares only", () => {
    occupied(board).forEach(({ pos }) => expect(isDarkSquare(pos.row, pos.col)).toBe(true));
  });

  it("puts white on rows 0 to 2", () => {
    const rows = occupied(board)
      .filter((p) => p.player === "white")
      .map((p) => p.pos.row);
    expect(Math.min(...rows)).toBe(0);
    expect(Math.max(...rows)).toBe(2);
  });

  it("puts black on rows 5 to 7", () => {
    const rows = occupied(board)
      .filter((p) => p.player === "black")
      .map((p) => p.pos.row);
    expect(Math.min(...rows)).toBe(5);
    expect(Math.max(...rows)).toBe(7);
  });

  it("fills every dark square in the six starting rows (4 pieces per row)", () => {
    [0, 1, 2, 5, 6, 7].forEach((row) => {
      expect(board[row]!.filter((piece) => piece !== null)).toHaveLength(4);
    });
  });

  it("leaves rows 3 and 4 empty", () => {
    [3, 4].forEach((row) => {
      board[row]!.forEach((piece) => expect(piece).toBeNull());
    });
  });

  it("starts with only regular pieces, no kings", () => {
    occupied(board).forEach((p) => expect(p.kind).toBe("man"));
  });

  it("returns a fresh board on every call", () => {
    expect(initialBoard()).not.toBe(initialBoard());
    expect(initialBoard()).toEqual(initialBoard());
  });
});
