import { describe, expect, it } from "vitest";
import { initialBoard } from "./board";
import { getLegalMoves } from "./moves";
import { at, boardFrom, summarize } from "./testUtils";

// Layouts below are written row 0 first. b/B black man/king, w/W white
// man/king, '.' empty. Black moves up the screen, white moves down.

describe("opening moves", () => {
  it("black has 7 opening moves, all from row 5 to row 4", () => {
    const moves = getLegalMoves(initialBoard(), "black");
    expect(summarize(moves)).toEqual(
      [
        "5,0->4,1",
        "5,2->4,1",
        "5,2->4,3",
        "5,4->4,3",
        "5,4->4,5",
        "5,6->4,5",
        "5,6->4,7",
      ].sort(),
    );
    moves.forEach((m) => expect(m.captured).toEqual([]));
  });

  it("white has 7 opening moves, all from row 2 to row 3", () => {
    const moves = getLegalMoves(initialBoard(), "white");
    expect(summarize(moves)).toEqual(
      [
        "2,1->3,0",
        "2,1->3,2",
        "2,3->3,2",
        "2,3->3,4",
        "2,5->3,4",
        "2,5->3,6",
        "2,7->3,6",
      ].sort(),
    );
  });

  it("a simple move has a one-square path and no captures", () => {
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
    expect(getLegalMoves(board, "black")).toContainEqual({
      from: at(5, 2),
      to: at(4, 1),
      path: [at(4, 1)],
      captured: [],
    });
  });
});

describe("simple capture", () => {
  const board = boardFrom([
    "........",
    "........",
    "........",
    "........",
    "...w....",
    "..b.....",
    "........",
    "........",
  ]);

  it("black jumps a white piece diagonally", () => {
    expect(getLegalMoves(board, "black")).toEqual([
      { from: at(5, 2), to: at(3, 4), path: [at(3, 4)], captured: [at(4, 3)] },
    ]);
  });

  it("white captures downward too", () => {
    const whiteBoard = boardFrom([
      "........",
      "........",
      ".w......",
      "..b.....",
      "........",
      "........",
      "........",
      "........",
    ]);
    expect(getLegalMoves(whiteBoard, "white")).toEqual([
      { from: at(2, 1), to: at(4, 3), path: [at(4, 3)], captured: [at(3, 2)] },
    ]);
  });
});

describe("forced capture", () => {
  it("hides simple moves when any capture exists", () => {
    // Black (7,0) could step to (6,1), but black (5,2) can capture, so it may not.
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...w....",
      "..b.....",
      "........",
      "b.......",
    ]);
    const moves = getLegalMoves(board, "black");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.captured).toEqual([at(4, 3)]);
  });
});

describe("multi jump", () => {
  it("continues a double jump in one move", () => {
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
    expect(getLegalMoves(board, "black")).toEqual([
      {
        from: at(7, 2),
        to: at(3, 6),
        path: [at(5, 4), at(3, 6)],
        captured: [at(6, 3), at(4, 5)],
      },
    ]);
  });

  // Black (6,3) can take (5,2) then (3,2), or take (5,4) alone.
  const branching = boardFrom([
    "........",
    "........",
    "........",
    "..w.....",
    "........",
    "..w.w...",
    "...b....",
    "........",
  ]);

  it("offers one move per complete branch, so a shorter branch is allowed", () => {
    const moves = getLegalMoves(branching, "black");
    expect(moves).toHaveLength(2);
    expect(moves).toContainEqual({
      from: at(6, 3),
      to: at(2, 3),
      path: [at(4, 1), at(2, 3)],
      captured: [at(5, 2), at(3, 2)],
    });
    expect(moves).toContainEqual({
      from: at(6, 3),
      to: at(4, 5),
      path: [at(4, 5)],
      captured: [at(5, 4)],
    });
  });

  it("never stops partway along a branch", () => {
    const moves = getLegalMoves(branching, "black");
    // (4,1) is the halfway square of the long branch; no move may end there.
    expect(moves.some((m) => m.to.row === 4 && m.to.col === 1)).toBe(false);
    // Every move ends on its last landing square.
    moves.forEach((m) => expect(m.to).toEqual(m.path[m.path.length - 1]));
  });

  it("cannot jump the same piece twice", () => {
    // The King could jump (3,4) and then jump straight back over it.
    const board = boardFrom([
      "........",
      "........",
      "........",
      "....w...",
      "...B....",
      "........",
      "........",
      "........",
    ]);
    expect(getLegalMoves(board, "black")).toEqual([
      { from: at(4, 3), to: at(2, 5), path: [at(2, 5)], captured: [at(3, 4)] },
    ]);
  });

  it("lets a King loop around and land back on its own starting square", () => {
    // Four white pieces form a diamond around the King; it can go either way round.
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
    const moves = getLegalMoves(board, "black");
    expect(moves).toHaveLength(2);
    moves.forEach((m) => {
      expect(m.to).toEqual(at(6, 3));
      expect(m.captured).toHaveLength(4);
    });
  });
});

describe("direction rules", () => {
  it("a black man cannot move backward", () => {
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
    expect(summarize(getLegalMoves(board, "black"))).toEqual(["4,3->3,2", "4,3->3,4"]);
  });

  it("a black man cannot capture backward", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...b....",
      "....w...",
      "........",
      "........",
    ]);
    const moves = getLegalMoves(board, "black");
    expect(moves.every((m) => m.captured.length === 0)).toBe(true);
    expect(moves.every((m) => m.to.row < 4)).toBe(true);
  });

  it("a white man cannot move or capture backward", () => {
    const board = boardFrom([
      "........",
      "........",
      "...b....",
      "....w...",
      "........",
      "........",
      "........",
      "........",
    ]);
    const moves = getLegalMoves(board, "white");
    expect(summarize(moves)).toEqual(["3,4->4,3", "3,4->4,5"]);
    expect(moves.every((m) => m.captured.length === 0)).toBe(true);
  });

  it("a King moves one step in all four diagonal directions", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...B....",
      "........",
      "........",
      "........",
    ]);
    expect(summarize(getLegalMoves(board, "black"))).toEqual([
      "4,3->3,2",
      "4,3->3,4",
      "4,3->5,2",
      "4,3->5,4",
    ]);
  });

  it("a King can capture backward", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...B....",
      "....w...",
      "........",
      "........",
    ]);
    expect(getLegalMoves(board, "black")).toEqual([
      { from: at(4, 3), to: at(6, 5), path: [at(6, 5)], captured: [at(5, 4)] },
    ]);
  });
});

describe("crowning during a capture", () => {
  const manBoard = boardFrom([
    "........",
    "....w.w.",
    "...b....",
    "........",
    "........",
    "........",
    "........",
    "........",
  ]);

  it("a man that reaches the far row mid-chain stops there", () => {
    // After jumping (1,4) the man lands on row 0. A King could go on to jump
    // (1,6), but the turn ends because the piece is crowned.
    expect(getLegalMoves(manBoard, "black")).toEqual([
      { from: at(2, 3), to: at(0, 5), path: [at(0, 5)], captured: [at(1, 4)] },
    ]);
  });

  it("a King in the same position keeps jumping", () => {
    const kingBoard = boardFrom([
      "........",
      "....w.w.",
      "...B....",
      "........",
      "........",
      "........",
      "........",
      "........",
    ]);
    expect(getLegalMoves(kingBoard, "black")).toEqual([
      {
        from: at(2, 3),
        to: at(2, 7),
        path: [at(0, 5), at(2, 7)],
        captured: [at(1, 4), at(1, 6)],
      },
    ]);
  });
});

describe("blocked jump", () => {
  it("cannot jump when the square behind the enemy is occupied", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "....w...",
      "...w....",
      "..b.....",
      "........",
      "........",
    ]);
    const moves = getLegalMoves(board, "black");
    // No capture is possible, and (4,3) is taken, so only the step to (4,1) is left.
    expect(moves).toEqual([
      { from: at(5, 2), to: at(4, 1), path: [at(4, 1)], captured: [] },
    ]);
  });
});
