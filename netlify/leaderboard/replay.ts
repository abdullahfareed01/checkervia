// Replays a claimed win through the real rules engine, move by move, from the
// starting position. Black always moves first: when the player is White
// (D81) the first move is the AI's. A win is accepted only if every move of
// both sides is in the engine's legal list at that point and the game is
// over with the player's colour as the winner. A colour the game does not
// back up (a Black win claimed as White, say) is refused as "notWin".
//
// What a replay cannot prove: that the other side's moves really came from
// the AI, or at which level. Those come from the browser (see D56).
import { applyMove, getLegalMoves, getWinner, initialBoard, opponentOf, pieceAt } from "../../src/engine";
import type { Board, Move, Player } from "../../src/engine";
import { MAX_GAME_MOVES } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import type { WinStats } from "./store";

// Black opens every game (the engine's rules).
const FIRST: Player = "black";

export type ReplayResult =
  | { readonly ok: true; readonly moveCount: number; readonly stats: WinStats }
  | { readonly ok: false; readonly reason: "malformed" | "illegal" | "incomplete" | "notWin" };

const square = (move: Move, index: number) => {
  const position = index === 0 ? move.from : move.path[index - 1]!;
  return position.row * 8 + position.col;
};

function matches(move: Move, encoded: EncodedMove): boolean {
  return encoded.length === move.path.length + 1 && encoded.every((number, index) => square(move, index) === number);
}

/** True for a list of moves with the right shape (not yet checked against the rules). */
export function isEncodedGame(value: unknown): value is EncodedMove[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_GAME_MOVES &&
    value.every(
      (move) =>
        Array.isArray(move) &&
        move.length >= 2 &&
        move.length <= 13 && // a start square and at most 12 landings
        move.every((number) => Number.isInteger(number) && number >= 0 && number < 64),
    )
  );
}

/**
 * `player`: the colour the player had. The move count and the stats are the
 * player's own moves only, so both colours rank the same way.
 */
export function replayWin(moves: unknown, player: Player = "black"): ReplayResult {
  if (!isEncodedGame(moves)) return { ok: false, reason: "malformed" };

  let board: Board = initialBoard();
  let toMove: Player = FIRST;
  const stats = { totalMoves: 0, captured: 0, kingsMade: 0, bestChain: 0 };
  let moveCount = 0;

  for (const encoded of moves) {
    // A move after the game is over finds no legal move, so it is illegal.
    const move = getLegalMoves(board, toMove).find((legal) => matches(legal, encoded));
    if (!move) return { ok: false, reason: "illegal" };

    const wasMan = pieceAt(board, move.from)?.kind === "man";
    board = applyMove(board, move);
    stats.totalMoves += 1;
    if (toMove === player) {
      moveCount += 1;
      stats.captured += move.captured.length;
      stats.bestChain = Math.max(stats.bestChain, move.captured.length);
      if (wasMan && pieceAt(board, move.to)?.kind === "king") stats.kingsMade += 1;
    }
    toMove = opponentOf(toMove);
  }

  const winner = getWinner(board, toMove);
  if (winner === null) return { ok: false, reason: "incomplete" };
  if (winner !== player) return { ok: false, reason: "notWin" };
  return { ok: true, moveCount, stats };
}
