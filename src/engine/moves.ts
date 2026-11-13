import { forwardStep, isInside, opponentOf, pieceAt, piecesOf, samePosition } from "./board";
import type { Board, Move, Piece, Player, Position } from "./types";

type Direction = readonly [rowStep: number, colStep: number];

const ALL_DIRECTIONS: readonly Direction[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

// A jump over one enemy piece: where the enemy stands and where we land.
interface Jump {
  readonly jumped: Position;
  readonly landing: Position;
}

// The square `distance` steps away from `from` in a diagonal direction.
function offset(from: Position, [rowStep, colStep]: Direction, distance: number): Position {
  return { row: from.row + rowStep * distance, col: from.col + colStep * distance };
}

// Kings use all four diagonals. Regular pieces only use the two that go forward.
function directionsFor(piece: Piece): readonly Direction[] {
  if (piece.kind === "king") return ALL_DIRECTIONS;
  const forward = forwardStep(piece.player);
  return ALL_DIRECTIONS.filter(([rowStep]) => rowStep === forward);
}

// True if the square is on the board and has no piece on it.
function isEmpty(board: Board, position: Position): boolean {
  return isInside(position) && pieceAt(board, position) === null;
}

// One-step moves for a single piece onto empty squares.
function simpleMovesFrom(board: Board, from: Position, piece: Piece): Move[] {
  return directionsFor(piece)
    .map((direction) => offset(from, direction, 1))
    .filter((to) => isEmpty(board, to))
    .map((to) => ({ from, to, path: [to], captured: [] }));
}

// Every single jump the piece can make right now from `at`.
// A jump needs an enemy next to us, not already captured in this chain, and a
// free square straight behind it. The piece's own starting square counts as
// free, because the piece has left it.
function jumpsFrom(
  board: Board,
  piece: Piece,
  at: Position,
  start: Position,
  captured: readonly Position[],
): Jump[] {
  return directionsFor(piece).flatMap((direction) => {
    const jumped = offset(at, direction, 1);
    const landing = offset(at, direction, 2);
    const target = pieceAt(board, jumped);

    const jumpsEnemy = target !== null && target.player === opponentOf(piece.player);
    const notYetCaptured = !captured.some((c) => samePosition(c, jumped));
    const landingFree =
      isInside(landing) && (pieceAt(board, landing) === null || samePosition(landing, start));

    return jumpsEnemy && notYetCaptured && landingFree ? [{ jumped, landing }] : [];
  });
}

// Follows a capture chain from `at`. If another jump is available it must be
// taken, so we only return a Move once no jump is left. Each branch gives its
// own Move. Captured pieces are NOT removed from the board while we search, so
// they cannot be jumped or landed on again.
// Crowning needs no special case here: a regular piece only jumps forward, so
// on its crowning row it has no jump left and the chain ends by itself.
// applyMove then turns it into a King.
function chainsFrom(
  board: Board,
  piece: Piece,
  start: Position,
  at: Position,
  path: readonly Position[],
  captured: readonly Position[],
): Move[] {
  const jumps = jumpsFrom(board, piece, at, start, captured);

  if (jumps.length === 0) {
    // Chain is over. No jumps taken at all means there is no capture here.
    return path.length === 0 ? [] : [{ from: start, to: at, path, captured }];
  }

  return jumps.flatMap(({ jumped, landing }) =>
    chainsFrom(board, piece, start, landing, [...path, landing], [...captured, jumped]),
  );
}

// All complete capture chains for one piece.
function captureMovesFrom(board: Board, from: Position, piece: Piece): Move[] {
  return chainsFrom(board, piece, from, from, [], []);
}

// All legal moves for a player. If any piece can capture, only captures are
// returned (capturing is mandatory); otherwise the one-step moves.
export function getLegalMoves(board: Board, player: Player): Move[] {
  const own = piecesOf(board, player);

  const captures = own.flatMap(({ position, piece }) => captureMovesFrom(board, position, piece));
  if (captures.length > 0) return captures;

  return own.flatMap(({ position, piece }) => simpleMovesFrom(board, position, piece));
}
