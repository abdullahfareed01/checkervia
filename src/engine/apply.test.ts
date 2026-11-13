import { describe, expect, it } from "vitest";
import { applyMove } from "./apply";
import { initialBoard, pieceAt } from "./board";
import { getLegalMoves } from "./moves";
import { at, boardFrom, countPieces } from "./testUtils";

describe("applyMove", () => {
  const captureBoard = boardFrom([
    "........",
    "........",
    "........",
    "........",
    "...w....",
    "..b.....",
    "........",
    "........",
  ]);

  it("moves the piece and removes the captured piece", () => {
    const [move] = getLegalMoves(captureBoard, "black");
    const next = applyMove(captureBoard, move!);
    expect(pieceAt(next, at(5, 2))).toBeNull();
    expect(pieceAt(next, at(4, 3))).toBeNull();
    expect(pieceAt(next, at(3, 4))).toEqual({ player: "black", kind: "man" });
    expect(countPieces(next, "white")).toBe(0);
  });

  it("leaves the old board unchanged and returns a new one", () => {
    const snapshot = structuredClone(captureBoard);
    const [move] = getLegalMoves(captureBoard, "black");
    const next = applyMove(captureBoard, move!);

    expect(captureBoard).toEqual(snapshot);
    expect(next).not.toBe(captureBoard);
    expect(next[5]).not.toBe(captureBoard[5]);
  });

  it("does not change the starting board when playing an opening move", () => {
    const start = initialBoard();
    const snapshot = structuredClone(start);
    applyMove(start, getLegalMoves(start, "black")[0]!);
    expect(start).toEqual(snapshot);
  });

  it("removes every piece captured in a multi jump", () => {
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
    const next = applyMove(board, getLegalMoves(board, "black")[0]!);
    expect(countPieces(next, "white")).toBe(0);
    expect(pieceAt(next, at(3, 6))).toEqual({ player: "black", kind: "man" });
  });

  it("crowns a black man that steps onto row 0", () => {
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
    const move = getLegalMoves(board, "black").find((m) => m.to.col === 1)!;
    expect(pieceAt(applyMove(board, move), at(0, 1))).toEqual({ player: "black", kind: "king" });
  });

  it("crowns a white man that steps onto row 7", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      ".w......",
      "........",
    ]);
    const move = getLegalMoves(board, "white").find((m) => m.to.col === 0)!;
    expect(pieceAt(applyMove(board, move), at(7, 0))).toEqual({ player: "white", kind: "king" });
  });

  it("does not crown a man that stays short of the far row", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...b....",
      "........",
      "........",
      "........",
    ]);
    const next = applyMove(board, getLegalMoves(board, "black")[0]!);
    expect(next.flat().filter((p) => p?.kind === "king")).toHaveLength(0);
  });

  it("crowns a man whose capture chain ends on the far row", () => {
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
    const next = applyMove(board, getLegalMoves(board, "black")[0]!);
    expect(pieceAt(next, at(0, 5))).toEqual({ player: "black", kind: "king" });
    // The turn ended there, so the second white piece is still on the board.
    expect(pieceAt(next, at(1, 6))).toEqual({ player: "white", kind: "man" });
    expect(pieceAt(next, at(1, 4))).toBeNull();
  });

  it("handles a chain that ends on its own starting square", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "..w.w...",
      "........",
      "..w.w...",
      "...B....",
      "........",
    ]);
    const next = applyMove(board, getLegalMoves(board, "black")[0]!);
    expect(pieceAt(next, at(6, 3))).toEqual({ player: "black", kind: "king" });
    expect(countPieces(next, "white")).toBe(0);
  });

  it("throws if there is no piece to move", () => {
    const empty = boardFrom(Array<string>(8).fill("........"));
    expect(() =>
      applyMove(empty, { from: at(5, 2), to: at(4, 3), path: [at(4, 3)], captured: [] }),
    ).toThrow();
  });
});
