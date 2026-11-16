// What a finished game means for the leaderboard (D57, D61):
// - every game gets a random id when it starts;
// - only a game against the AI from the normal starting position can count
//   (a development scenario that starts near the end never does);
// - when this device has a profile, a win that passes isSubmittableWin (no
//   resignation, the player won) goes into the win queue, and the result
//   panel sends it automatically (winQueue.ts); without a profile nothing is
//   kept, as the first game's notice says;
// - with a profile, the finished game is also reported once, as a win or a
//   loss (a resignation is a loss, flagged as one; an abandoned game is a
//   plain loss), for the profile's counters and the AI's record.
import { useEffect, useRef } from "react";
import { initialBoard } from "../../engine";
import type { Board } from "../../engine";
import { encodeMove } from "../../leaderboard/protocol";
import type { GameState } from "../../state/gameReducer";
import { aiSideOf } from "../../state/gameReducer";
import { isSubmittableWin } from "../usePersonality";
import { leaderboardApi } from "./api";
import { leaderboardStore, randomId, useLeaderboardProfile } from "./profile";
import type { QualifyingWin } from "./profile";

const START = JSON.stringify(initialBoard());
const startsNormally = (board: Board) => JSON.stringify(board) === START;

/** A game the leaderboard may count: against the AI, from the normal start, Black first. */
export function isLeaderboardGame(state: GameState): boolean {
  return state.mode === "vs-ai" && startsNormally(state.history[0]!.board) && (state.history[1]?.player ?? "black") === "black";
}

/** The win as the server wants it, or null when this game cannot count. */
export function qualifyingWin(state: GameState, gameId: string): QualifyingWin | null {
  if (!isLeaderboardGame(state) || !isSubmittableWin(state)) return null;
  const moves = state.history.slice(1).map((entry) => encodeMove(entry.move!));
  return { gameId, level: state.aiLevel, colour: state.humanSide, moves };
}

/**
 * What a finished game against the AI reports: a loss when the AI won or
 * the player gave up, flagged as a resignation only when the player pressed
 * Resign. An abandoned game ends like a resignation (D85) but is a plain
 * loss, so the AI's record does not count it as a player resigning.
 */
export function reportedResult(state: GameState): { readonly result: "win" | "loss"; readonly resigned: boolean } {
  const lost = state.winner === aiSideOf(state) || state.resignedBy !== null;
  return { result: lost ? "loss" : "win", resigned: state.resignedBy !== null && !state.abandoned };
}

// A random id for every game (history[0] is a new object for each game),
// shared by the leaderboard and the reports for abandoned games (D85).
const ids = new WeakMap<object, string>();

/** The game's id, made the first time it is asked for. */
export function gameIdOf(state: GameState): string {
  const start = state.history[0]!;
  if (!ids.has(start)) ids.set(start, randomId());
  return ids.get(start)!;
}

/**
 * Returns this game's queued win (null while it goes on, when it cannot
 * count, or without a profile). Side effects run once per finished game.
 */
export function useLeaderboardGame(state: GameState): QualifyingWin | null {
  const gameId = gameIdOf(state);

  const win = state.winner === null ? null : qualifyingWin(state, gameId);
  const { profile } = useLeaderboardProfile();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (state.winner === null || handled.current === gameId || !isLeaderboardGame(state)) return;
    handled.current = gameId;
    if (!leaderboardStore.get().profile) return;
    if (win) leaderboardStore.enqueue(win);
    // Fire and forget: a lost report only means one game fewer in the counters.
    const { result, resigned } = reportedResult(state);
    void leaderboardApi.reportGame(gameId, state.aiLevel, result, resigned).catch(() => {});
  }, [state.winner, gameId]);
  return profile ? win : null;
}
