// Plays a recorded game through the reducer's own public actions, the way
// it was played: the player's moves as clicks (the piece, its destination,
// and a landing square when routes must be told apart), the AI's moves as
// its replies. Used by the development only ?testwin= helper (D60) and the
// tests. No rule is bypassed: a move the reducer does not play is an error.
import type { Move } from "../engine";
import { AI_PLAYER, gameReducer } from "./gameReducer";
import type { GameState } from "./gameReducer";

function playOne(state: GameState, move: Move): GameState {
  if (state.mode === "vs-ai" && state.currentPlayer === AI_PLAYER) {
    return gameReducer(state, { type: "aiMoved", requestId: state.aiRequestId, move });
  }
  let next = gameReducer(state, { type: "click", position: move.from });
  next = gameReducer(next, { type: "click", position: move.to });
  // Several routes end on the same square: click the landings in order until one is left.
  for (const landing of move.path) {
    if (next.pendingRoutes.length === 0) break;
    next = gameReducer(next, { type: "click", position: landing });
  }
  return next;
}

export function playRecord(start: GameState, moves: readonly Move[]): GameState {
  return moves.reduce((state, move, index) => {
    const next = playOne(state, move);
    const played = next.history[next.history.length - 1]?.move;
    if (next.history.length !== state.history.length + 1 || !played || JSON.stringify(played) !== JSON.stringify(move)) {
      throw new Error(`The recorded move ${index + 1} could not be played.`);
    }
    return next;
  }, start);
}
