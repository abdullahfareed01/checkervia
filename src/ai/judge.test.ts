// The engine's verdict on the player's move: blunders and great moves get a
// reaction, everything else (and forced moves) does not.
import { describe, expect, it } from "vitest";
import { boardFrom, getLegalMoves, initialBoard, samePosition } from "../engine";
import type { Board, Player } from "../engine";
import type { Analyze } from "./analyzer";
import { judgeMove } from "./judge";
import { WIN } from "./search";

const EMPTY = "........";
const board = (rows: Record<number, string>): Board =>
  boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));

// A fake look-ahead that returns the given scores, one per legal move.
const fixed = (scores: number[]): Analyze => async (_b, _p, depth) => ({ depth, scores });

const start = initialBoard();
const opening = getLegalMoves(start, "black"); // 7 moves: A3-B4, C3-B4, C3-D4, ...

describe("judgeMove with given scores", () => {
  it("calls a move that gives up a piece a blunder, and names the better move", async () => {
    const judgement = await judgeMove(start, opening[2]!, "black", fixed([0, 0, -100, 0, 0, 0, 0]));
    expect(judgement?.verdict).toBe("blunder");
    expect(judgement?.detail).toContain("loses about 1.0 piece");
    expect(judgement?.detail).toContain("A3 -> B4");
  });

  it("calls a missed forced win a blunder", async () => {
    const judgement = await judgeMove(start, opening[1]!, "black", fixed([WIN - 3, 0, 0, 0, 0, 0, 0]));
    expect(judgement).toEqual({ verdict: "blunder", detail: "It missed a forced win: A3 -> B4 wins in 3 turns." });
  });

  it("says when a move now loses by force", async () => {
    const judgement = await judgeMove(start, opening[0]!, "black", fixed([-(WIN - 4), 0, 0, 0, 0, 0, 0]));
    expect(judgement?.detail).toContain("now loses by force");
  });

  it("praises a forced win that was found", async () => {
    const judgement = await judgeMove(start, opening[0]!, "black", fixed([WIN - 5, 0, 0, 0, 0, 0, 0]));
    expect(judgement).toEqual({ verdict: "great", detail: "It finds a forced win in 5 turns." });
  });

  it("praises the only good move", async () => {
    const judgement = await judgeMove(start, opening[4]!, "black", fixed([-100, -100, -160, -100, 0, -100, -200]));
    expect(judgement?.verdict).toBe("great");
    expect(judgement?.detail).toContain("the only good move");
  });

  it("says nothing about an ordinary move, or a small slip", async () => {
    expect(await judgeMove(start, opening[0]!, "black", fixed([0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(await judgeMove(start, opening[0]!, "black", fixed([-60, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("says nothing about a forced move (the only legal one)", async () => {
    const position = board({ 2: ".w......", 3: "..b....." });
    const [only] = getLegalMoves(position, "white");
    expect(await judgeMove(position, only!, "white", fixed([0]))).toBeNull();
  });

  it("says nothing when the look-ahead fails or does not fit", async () => {
    const broken: Analyze = async () => {
      throw new Error("worker crashed");
    };
    expect(await judgeMove(start, opening[0]!, "black", broken)).toBeNull();
    expect(await judgeMove(start, opening[0]!, "black", fixed([0, 0]))).toBeNull();
  });

  it("praises a multi jump", async () => {
    // Black can take two pieces with one piece, or one with another.
    const position = board({ 0: ".......w", 3: "....w...", 5: "..w...w.", 6: ".b...b.." });
    const moves = getLegalMoves(position, "black");
    const double = moves.find((m) => m.captured.length === 2)!;
    const judgement = await judgeMove(position, double, "black", fixed(moves.map(() => 0)));
    expect(judgement).toEqual({ verdict: "great", detail: "It is a multi jump that takes 2 pieces." });
  });
});

describe("judgeMove with the real engine", () => {
  // White on D6 can step to C5 (safe) or E5, next to Black's F4, which then
  // jumps it.
  const position = board({ 0: ".w......", 2: "...w....", 4: ".....b..", 7: "b......." });
  const moves = getLegalMoves(position, "white");
  const to = (row: number, col: number) => moves.find((m) => samePosition(m.to, { row, col }))!;

  it("spots a piece left hanging", async () => {
    const judgement = await judgeMove(position, to(3, 4), "white");
    expect(judgement?.verdict).toBe("blunder");
    expect(judgement?.detail).toContain("loses about 1.0 piece");
    // Two moves tie for best (D6 -> C5 keeps the piece, B8 -> A7 waits); either may be named.
    expect(judgement?.detail).toMatch(/\((D6 -> C5|B8 -> A7)\)/);
  });

  it("does not react to the safe move", async () => {
    expect(await judgeMove(position, to(3, 2), "white")).toBeNull();
  });
});

describe("judgeMove is about a player", () => {
  it("works for either side", async () => {
    const white: Player = "white";
    const moves = getLegalMoves(start, white);
    const judgement = await judgeMove(start, moves[0]!, white, fixed(moves.map((_, i) => (i === 0 ? -100 : 0))));
    expect(judgement?.verdict).toBe("blunder");
  });
});
