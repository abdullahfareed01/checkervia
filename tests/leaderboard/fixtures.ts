// Games for the leaderboard tests, played by two fixed policies through the
// real engine, so they are always legal. The side meant to win plays the
// engine's best move 4 turns deep (the first listed on a tie); the other side
// always plays its first listed move, and loses.
import { analyzeMoves } from "../../src/ai/search";
import { applyMove, getLegalMoves, getWinner, initialBoard, opponentOf } from "../../src/engine";
import type { Board, Move, Player } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";

function bestMove(board: Board, player: Player): Move {
  return analyzeMoves(board, player, 4).reduce((best, option) => (option.score > best.score ? option : best)).move;
}

/** A complete game won by `winner` (Black moves first), as sent on the wire. */
export function wonGame(winner: Player): EncodedMove[] {
  let board: Board = initialBoard();
  let toMove: Player = "black";
  const moves: EncodedMove[] = [];
  while (getWinner(board, toMove) === null) {
    const move = toMove === winner ? bestMove(board, toMove) : getLegalMoves(board, toMove)[0]!;
    moves.push(encodeMove(move));
    board = applyMove(board, move);
    toMove = opponentOf(toMove);
    if (moves.length > 600) throw new Error("the fixture game did not end");
  }
  if (getWinner(board, toMove) !== winner) throw new Error("the fixture game had the wrong winner");
  return moves;
}

// Played once and shared: the search takes a moment.
export const BLACK_WIN = wonGame("black");
export const WHITE_WIN = wonGame("white");
