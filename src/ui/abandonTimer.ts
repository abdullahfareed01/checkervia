// The abandon timer (D85): a game against the AI is abandoned when the
// player does not move for a minute on their turn, at the start of the game
// or later. Any tap on the board starts the minute again (the player is
// there). Like the idle lines, it counts only while the game is on screen:
// a sheet or dialog over the board, the page hidden or an older move being
// reviewed pause it and start it again from zero. Plain TypeScript with
// injectable timers, so tests can use fake timers.
import { useEffect, useRef } from "react";

export const ABANDON_AFTER_MS = 60_000;

interface Timers {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const PAGE_TIMERS: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface AbandonTimer {
  // `active`: the player's turn in a game against the AI, nothing covers the
  // board and the page is visible. `turn` identifies the turn.
  update(active: boolean, turn: unknown): void;
  // The player tapped the board: the minute starts again.
  touch(): void;
  stop(): void;
}

/** Calls `onAbandon` once a turn has gone `afterMs` without a move or a tap. */
export function createAbandonTimer(onAbandon: () => void, timers: Timers = PAGE_TIMERS, afterMs = ABANDON_AFTER_MS): AbandonTimer {
  let handle: unknown = null;
  let turn: unknown = undefined;

  const clear = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const schedule = () => {
    clear();
    handle = timers.setTimeout(() => {
      handle = null;
      onAbandon();
    }, afterMs);
  };

  return {
    update(active, nextTurn) {
      const newTurn = nextTurn !== turn;
      turn = nextTurn;
      if (!active) return clear();
      if (handle === null || newTurn) schedule();
    },
    touch() {
      if (handle !== null) schedule();
    },
    stop: clear,
  };
}

/** The abandon timer for the game screen; returns `touch` for board taps. */
export function useAbandonTimer(active: boolean, turn: unknown, onAbandon: () => void): () => void {
  const callback = useRef(onAbandon);
  callback.current = onAbandon;
  const timer = useRef<AbandonTimer | null>(null);
  timer.current ??= createAbandonTimer(() => callback.current());
  useEffect(() => timer.current!.update(active, turn), [active, turn]);
  useEffect(() => () => timer.current!.stop(), []);
  return useRef(() => timer.current!.touch()).current;
}
