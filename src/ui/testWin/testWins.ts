// Development only (D60): complete games won by the player against a weak
// AI, for testing the leaderboard without winning a long game by hand.
// Made with the real engine, never by hand:
// - the player plays the engine's best move looking 4 turns ahead (the
//   first listed on a tie);
// - the AI plays legal but weak moves: the one the engine scores worst for
//   it looking 2 turns ahead; among equally bad moves the seed chooses, so
//   each seed gives a different game. Its first move is spread over its
//   legal moves by the seed.
// The player is Black in the records kept in testWinGames.json;
// tests/test-win.test.ts checks that the file is exactly what this
// generator makes and that every game replays to a win for the player
// (UPDATE_TEST_WINS=1 rewrites the file). Games won as White (D81, ?side=
// white) are made on the spot by the same generator.
import { analyzeMoves } from "../../ai/search";
import { applyMove, getLegalMoves, getWinner, initialBoard, opponentOf } from "../../engine";
import type { Board, Move, Player } from "../../engine";
import { encodeMove } from "../../leaderboard/protocol";
import type { EncodedMove } from "../../leaderboard/protocol";

export const TEST_WIN_COUNT = 20;
const MAX_MOVES = 400;

function playerMove(board: Board, player: Player): Move {
  return analyzeMoves(board, player, 4).reduce((best, option) => (option.score > best.score ? option : best)).move;
}

function weakAiMove(board: Board, ai: Player, seed: number, turn: number): Move {
  const options = analyzeMoves(board, ai, 2);
  const worst = Math.min(...options.map((option) => option.score));
  const weakest = options.filter((option) => option.score === worst);
  return weakest[(seed + turn) % weakest.length]!.move;
}

/**
 * One complete game won by `player` (Black moves first, so as White the AI
 * opens), or null if this seed does not end in a win in time.
 */
export function generateTestWin(seed: number, player: Player = "black"): EncodedMove[] | null {
  const ai = opponentOf(player);
  const aiFirstTurn = ai === "black" ? 0 : 1;
  let board: Board = initialBoard();
  let toMove: Player = "black";
  const moves: EncodedMove[] = [];
  // The AI's first move is spread over its legal moves, so games differ from the start.
  while (getWinner(board, toMove) === null) {
    if (moves.length >= MAX_MOVES) return null;
    const turn = moves.length;
    const move =
      toMove === player
        ? playerMove(board, player)
        : turn === aiFirstTurn
          ? getLegalMoves(board, ai)[seed % getLegalMoves(board, ai).length]!
          : weakAiMove(board, ai, seed, turn);
    moves.push(encodeMove(move));
    board = applyMove(board, move);
    toMove = opponentOf(toMove);
  }
  return getWinner(board, toMove) === player ? moves : null;
}

/** A win as `player` from `seed` on: the first seed that gives one (null if none in 50 tries). */
export function findTestWin(seed: number, player: Player): { seed: number; moves: EncodedMove[] } | null {
  for (let next = seed; next < seed + 50; next += 1) {
    const moves = generateTestWin(next, player);
    if (moves) return { seed: next, moves };
  }
  return null;
}

/** TEST_WIN_COUNT different wins, from seeds 0, 1, 2 and so on (skipping any that fail or repeat). */
export function generateTestWins(count = TEST_WIN_COUNT): EncodedMove[][] {
  const games: EncodedMove[][] = [];
  const seen = new Set<string>();
  for (let seed = 0; games.length < count && seed < count * 10; seed += 1) {
    const game = generateTestWin(seed);
    const key = JSON.stringify(game);
    if (game && !seen.has(key)) {
      seen.add(key);
      games.push(game);
    }
  }
  return games;
}

/** The engine's moves for a recorded game, checked move by move against the legal list. */
export function decodeGame(encoded: readonly EncodedMove[]): Move[] {
  let board: Board = initialBoard();
  let toMove: Player = "black";
  return encoded.map((squares, index) => {
    const move = getLegalMoves(board, toMove).find((legal) => JSON.stringify(encodeMove(legal)) === JSON.stringify(squares));
    if (!move) throw new Error(`Recorded move ${index + 1} is not legal.`);
    board = applyMove(board, move);
    toMove = opponentOf(toMove);
    return move;
  });
}
