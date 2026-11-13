// Read-only facts derived from the game state, for the UI to display.
// No rules live here: everything comes from state.legalMoves.
import { samePosition } from "../engine";
import type { Board, Player, Position } from "../engine";
import { canHumanAct } from "./gameReducer";
import type { GameState } from "./gameReducer";
import { routeChoices } from "./routes";

export interface Destination {
  readonly position: Position;
  // True if getting there captures something.
  readonly capture: boolean;
}

function addUnique(list: Position[], position: Position): void {
  if (!list.some((seen) => samePosition(seen, position))) list.push(position);
}

// Pieces the current player may select: those with at least one legal move.
// Empty when the board is locked (game over, or the AI's turn), so nothing
// is highlighted that the human cannot use.
export function selectablePieces(state: GameState): Position[] {
  if (!canHumanAct(state)) return [];
  const squares: Position[] = [];
  state.legalMoves.forEach((move) => addUnique(squares, move.from));
  return squares;
}

// True when the human player must capture this turn.
export function isCaptureMandatory(state: GameState): boolean {
  return canHumanAct(state) && state.legalMoves.some((move) => move.captured.length > 0);
}

// Pieces that must capture (shown highlighted). Empty if no capture is forced.
export function mustCapturePieces(state: GameState): Position[] {
  return isCaptureMandatory(state) ? selectablePieces(state) : [];
}

// Squares to highlight for the selected piece. Hidden while the player is
// choosing a route, because then the route squares are what matter.
export function destinations(state: GameState): Destination[] {
  if (!state.selected || state.pendingRoutes.length > 0) return [];
  const from = state.selected;

  const found: Destination[] = [];
  state.legalMoves
    .filter((move) => samePosition(move.from, from))
    .forEach((move) => {
      // Several routes can end on one square; show that square once.
      if (!found.some((d) => samePosition(d.position, move.to))) {
        found.push({ position: move.to, capture: move.captured.length > 0 });
      }
    });
  return found;
}

// Squares the player can click to pick between routes to the same square.
export function routeChoiceSquares(state: GameState): Position[] {
  return routeChoices(state.pendingRoutes);
}

export function pieceCounts(board: Board): Record<Player, number> {
  const counts = { black: 0, white: 0 };
  board.flat().forEach((piece) => {
    if (piece) counts[piece.player]++;
  });
  return counts;
}

// A game is in progress once a move has been played and nobody has won yet.
// The New game button and the mode switch ask for confirmation only then.
export function isGameInProgress(state: GameState): boolean {
  return state.movesPlayed > 0 && state.winner === null;
}
