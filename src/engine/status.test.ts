import { describe, expect, it } from "vitest";
import { initialBoard } from "./board";
import { getWinner } from "./status";
import { boardFrom } from "./testUtils";

describe("getWinner", () => {
  it("returns null at the start of a game", () => {
    expect(getWinner(initialBoard(), "black")).toBeNull();
    expect(getWinner(initialBoard(), "white")).toBeNull();
  });

  it("white wins when black has no pieces", () => {
    const board = boardFrom([
      "........",
      "........",
      ".w......",
      "........",
      "........",
      "........",
      "........",
      "........",
    ]);
    expect(getWinner(board, "black")).toBe("white");
  });

  it("black wins when white has no pieces", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "........",
      "..b.....",
      "........",
      "........",
    ]);
    expect(getWinner(board, "white")).toBe("black");
  });

  // Black (7,0) is boxed in: (6,1) is taken and the jump needs (5,2), also taken.
  const blockedBoard = boardFrom([
    "........",
    "........",
    "........",
    "........",
    "........",
    "..w.....",
    ".w......",
    "b.......",
  ]);

  it("a player with pieces but no legal moves loses", () => {
    expect(getWinner(blockedBoard, "black")).toBe("white");
  });

  it("the same position is not a win for the player who can still move", () => {
    expect(getWinner(blockedBoard, "white")).toBeNull();
  });
});
