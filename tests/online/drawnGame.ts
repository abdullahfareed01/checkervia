// A whole online game from the start that ends in a draw by the rules of
// every game (D89): a seeded random playout, the same every run, played
// until the draw rules end it. For the room tests.
import { applyMove, drawReason, getLegalMoves, getWinner, initialBoard, opponentOf } from "../../src/engine";
import type { DrawReason, GamePosition, Player } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import { MAX_GAME_MOVES } from "../../src/online/protocol";

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

/** The first seed from `seed` on whose playout ends in a draw: its moves and why. */
export function drawnGame(seed = 1): { moves: EncodedMove[]; reason: DrawReason } {
  for (let attempt = seed; attempt < seed + 500; attempt += 1) {
    const random = seeded(attempt);
    let board = initialBoard();
    let toMove: Player = "black";
    const positions: GamePosition[] = [{ board, move: null, player: null }];
    const moves: EncodedMove[] = [];
    while (moves.length < MAX_GAME_MOVES) {
      const legal = getLegalMoves(board, toMove);
      if (legal.length === 0) break;
      const move = legal[Math.floor(random() * legal.length)]!;
      board = applyMove(board, move);
      positions.push({ board, move, player: toMove });
      moves.push(encodeMove(move));
      toMove = opponentOf(toMove);
      if (getWinner(board, toMove)) break;
      const reason = drawReason(positions, "black");
      if (reason) return { moves, reason };
    }
  }
  throw new Error("no drawn playout found");
}
