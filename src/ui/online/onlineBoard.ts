// The online game on screen is the normal game state (the same reducer as
// a two player game on one screen), fed with the server's moves. Moves the
// browser lacks are played through the reducer's own clicks (playRecord),
// so the board animates them like any move. Anything else (a refused move
// of ours) rebuilds the game from the server's list. Pure.
import type { Player } from "../../engine";
import type { EncodedMove } from "../../leaderboard/protocol";
import { decodeMove, isSameMove } from "../../online/game";
import { createGameState } from "../../state/gameReducer";
import type { GameState } from "../../state/gameReducer";
import { playRecord } from "../../state/playRecord";
import type { BoardView } from "../Board";

export const freshGame = (): GameState => createGameState({ mode: "two-player" });

/** True when the game's moves so far are the first moves of `moves`. */
function startsWith(state: GameState, moves: readonly EncodedMove[]): boolean {
  const played = state.history.slice(1);
  return played.length <= moves.length && played.every((entry, index) => isSameMove(entry.move!, moves[index]!));
}

/** Plays the moves after the state's own, through the reducer; null when one does not fit. */
function playOn(state: GameState, moves: readonly EncodedMove[]): GameState | null {
  let next = state;
  for (const encoded of moves) {
    const move = decodeMove(next.board, next.currentPlayer, encoded);
    if (!move) return null;
    try {
      next = playRecord(next, [move]);
    } catch {
      return null;
    }
  }
  return next;
}

/** The game state for exactly these moves, keeping `state` (and its selection) when nothing changed. */
export function syncGame(state: GameState, moves: readonly EncodedMove[]): GameState {
  const played = state.history.length - 1;
  if (played === moves.length && startsWith(state, moves)) return state;
  if (startsWith(state, moves)) {
    const next = playOn(state, moves.slice(played));
    if (next) return next;
  }
  return playOn(freshGame(), moves) ?? freshGame();
}

/**
 * The board as the local player sees it: their pieces at the bottom (the
 * board turns for White, as against the AI), and nothing to pick up or
 * highlight unless it is their move.
 */
export function onlineBoardView(base: BoardView, me: Player, canMove: boolean): BoardView {
  return canMove
    ? { ...base, flipped: me === "white" }
    : { ...base, flipped: me === "white", locked: true, selectable: [], mustCapture: [], destinations: [], routeChoices: [] };
}
