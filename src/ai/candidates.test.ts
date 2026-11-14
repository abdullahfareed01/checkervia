// The level's candidate moves: the engine's best few, always the same for
// the same position and level (the server will check AI moves against them).
import { describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, initialBoard, opponentOf } from "../engine";
import type { Board, Player } from "../engine";
import { analyzeHere } from "./analyzer";
import { candidatesAt, pickCandidates } from "./candidates";
import { chooseMove } from "./chooseMove";
import { AI_LEVELS, LEVELS } from "./difficulty";

describe("pickCandidates", () => {
  it("keeps the best-scored moves, in the engine's move order", () => {
    expect(pickCandidates([0, 50, 200, -10, 70], 3)).toEqual([1, 2, 4]);
  });

  it("breaks ties by the engine's order (the earlier move is kept)", () => {
    expect(pickCandidates([5, 9, 5, 5], 2)).toEqual([0, 1]);
  });

  it("keeps every move without a limit, or when there are no more moves than the limit", () => {
    expect(pickCandidates([3, 1, 2])).toEqual([0, 1, 2]);
    expect(pickCandidates([3, 1, 2], 3)).toEqual([0, 1, 2]);
    expect(pickCandidates([3, 1], 5)).toEqual([0, 1]);
  });
});

// A middle-game position: 12 plies of the first legal move each turn.
function middleGame(): { board: Board; player: Player } {
  let board = initialBoard();
  let player: Player = "black";
  for (let ply = 0; ply < 12; ply++) {
    const moves = getLegalMoves(board, player);
    board = applyMove(board, moves[ply % moves.length]!);
    player = opponentOf(player);
  }
  return { board, player };
}

describe("candidatesAt", () => {
  const { board, player } = middleGame();
  const legal = getLegalMoves(board, player);

  it.each(LEVELS)("level %i: as many as the level allows, never more than the legal moves", (level) => {
    const limit = AI_LEVELS[level].candidates ?? legal.length;
    expect(candidatesAt(board, player, level)).toHaveLength(Math.min(limit, legal.length));
  });

  it("is the same every time (deterministic)", () => {
    expect(candidatesAt(board, player, 4)).toEqual(candidatesAt(board, player, 4));
  });

  it.each([2, 3, 4] as const)("level %i: the AI's move always comes from this list", async (level) => {
    const expected = candidatesAt(board, player, level).map((index) => legal[index]);
    const offered = [];
    for (let number = 1; number <= expected.length; number++) {
      const result = await chooseMove(board, player, async () => `{"move": ${number}}`, 0, { level, analyze: analyzeHere });
      offered.push(result.ok ? result.move : null);
    }
    expect(offered).toEqual(expected);
  });
});
