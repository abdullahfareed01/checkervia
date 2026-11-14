// What a finished game means for the leaderboard (D57):
// - every game gets a random id when it starts;
// - only a game against the AI from the normal starting position can count
//   (a development scenario that starts near the end never does);
// - a win that passes isSubmittableWin (no resignation, the player won) is
//   kept as the pending win until it is submitted or skipped;
// - when this device has a profile, the finished game is reported once, as a
//   win or a loss (a resignation is a loss), for the profile's counters.
import { useEffect, useRef } from "react";
import { initialBoard } from "../../engine";
import type { Board } from "../../engine";
import { encodeMove } from "../../leaderboard/protocol";
import type { GameState } from "../../state/gameReducer";
import { AI_PLAYER } from "../../state/gameReducer";
import { isSubmittableWin } from "../usePersonality";
import { leaderboardApi } from "./api";
import { leaderboardStore, randomId } from "./profile";
import type { PendingWin } from "./profile";

const START = JSON.stringify(initialBoard());
const startsNormally = (board: Board) => JSON.stringify(board) === START;

/** A game the leaderboard may count: against the AI, from the normal start, Black first. */
export function isLeaderboardGame(state: GameState): boolean {
  return state.mode === "vs-ai" && startsNormally(state.history[0]!.board) && (state.history[1]?.player ?? "black") === "black";
}

/** The win as the server wants it, or null when this game cannot count. */
export function qualifyingWin(state: GameState, gameId: string): PendingWin | null {
  if (!isLeaderboardGame(state) || !isSubmittableWin(state)) return null;
  const moves = state.history.slice(1).map((entry) => encodeMove(entry.move!));
  return { gameId, level: state.aiLevel, moves };
}

/**
 * Returns this game's qualifying win (null while it goes on or when it
 * cannot count). Side effects run once per finished game.
 */
export function useLeaderboardGame(state: GameState): PendingWin | null {
  // A new id for every new game (history[0] is a new object for each game).
  const ids = useRef(new WeakMap<object, string>());
  const start = state.history[0]!;
  if (!ids.current.has(start)) ids.current.set(start, randomId());
  const gameId = ids.current.get(start)!;

  const win = state.winner === null ? null : qualifyingWin(state, gameId);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (state.winner === null || handled.current === gameId || !isLeaderboardGame(state)) return;
    handled.current = gameId;
    if (win) leaderboardStore.setPending(win);
    if (leaderboardStore.get().profile) {
      // Fire and forget: a lost report only means one game fewer in the counters.
      void leaderboardApi.reportGame(gameId, state.aiLevel, state.winner === AI_PLAYER || state.resignedBy ? "loss" : "win").catch(() => {});
    }
  }, [state.winner, gameId]);
  return win;
}
