// Replays a claimed win through the real rules engine, move by move, from the
// starting position. Black always moves first: when the player is White
// (D81) the first move is the AI's. A win is accepted only if every move of
// both sides is in the engine's legal list at that point and the game is
// over with the player's colour as the winner. A colour the game does not
// back up (a Black win claimed as White, say) is refused as "notWin".
//
// The draw rules hold too (D89): a game that was drawn on the way, or at
// its end, is no win. And a game may end with the AI's resignation (D89):
// it is accepted only when the engine proves, as the AI did, that every
// move the AI had left loses by force (acceptWin).
//
// What a replay cannot prove: that the other side's moves really came from
// the AI, or at which level. Those come from the browser (see D56).
import { analyzeHere } from "../../src/ai/analyzer";
import type { Analyze } from "../../src/ai/analyzer";
import { provenLost } from "../../src/ai/endgame";
import { applyMove, drawReason, getLegalMoves, getWinner, initialBoard, opponentOf, pieceAt } from "../../src/engine";
import type { Board, GamePosition, Move, Player } from "../../src/engine";
import { MAX_GAME_MOVES } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import type { WinStats } from "./store";

// Black opens every game (the engine's rules).
const FIRST: Player = "black";

export type ReplayResult =
  | { readonly ok: true; readonly moveCount: number; readonly stats: WinStats; readonly resigned?: true }
  | { readonly ok: false; readonly reason: "malformed" | "illegal" | "incomplete" | "notWin" };

// The game played out: where it stands after the last move, or why it broke.
type Replayed =
  | { readonly ok: false; readonly reason: "malformed" | "illegal" | "notWin" }
  | { readonly ok: true; readonly board: Board; readonly toMove: Player; readonly moveCount: number; readonly stats: WinStats };

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
  const game = replayMoves(moves, player);
  if (!game.ok) return game;
  const winner = getWinner(game.board, game.toMove);
  if (winner === null) return { ok: false, reason: "incomplete" };
  if (winner !== player) return { ok: false, reason: "notWin" };
  return { ok: true, moveCount: game.moveCount, stats: game.stats };
}

/**
 * replayWin, and also a win by the AI's resignation (D89): a game that is not
 * over, with the AI to move, where the engine proves every AI move loses by
 * force (the same proof the AI used to resign). Marked `resigned`.
 */
export async function acceptWin(moves: unknown, player: Player = "black", analyze: Analyze = analyzeHere): Promise<ReplayResult> {
  const result = replayWin(moves, player);
  if (result.ok || result.reason !== "incomplete") return result;
  const game = replayMoves(moves, player);
  if (!game.ok || game.toMove === player) return result;
  if (!(await provenLost(game.board, game.toMove, analyze))) return result;
  return { ok: true, moveCount: game.moveCount, stats: game.stats, resigned: true };
}

// Plays the moves through the engine, checking every one, and the draw rules.
function replayMoves(moves: unknown, player: Player): Replayed {
  if (!isEncodedGame(moves)) return { ok: false, reason: "malformed" };

  let board: Board = initialBoard();
  let toMove: Player = FIRST;
  const stats = { totalMoves: 0, captured: 0, kingsMade: 0, bestChain: 0 };
  let moveCount = 0;
  const positions: GamePosition[] = [{ board, move: null, player: null }];

  for (const [index, encoded] of moves.entries()) {
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
    positions.push({ board, move, player: toMove });
    toMove = opponentOf(toMove);
    // A drawn game (D89) ends there: no move may follow, and it is no win.
    if (getWinner(board, toMove) === null && drawReason(positions, FIRST) !== null) {
      return { ok: false, reason: index === moves.length - 1 ? "notWin" : "illegal" };
    }
  }
  return { ok: true, board, toMove, moveCount, stats };
}
