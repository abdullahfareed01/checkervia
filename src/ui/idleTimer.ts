// The idle lines' timer (Change 4, updated after the owner's review): if it is
// the player's turn and they have not moved, the AI speaks after 30 seconds,
// and keeps speaking every 30 seconds until they move. Plain TypeScript with
// injectable timers, so tests can use fake timers.

export const IDLE_EVERY_MS = 30_000;

interface Timers {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface IdleTimer {
  // Call whenever something changes. `active`: the board is interactive on
  // the player's turn, nothing covers it and the page is visible. `turn`
  // identifies the turn: a new one starts the count again.
  update(active: boolean, turn: unknown): void;
  stop(): void;
}

// The page's own timers, looked up at call time (so fake timers work).
const PAGE_TIMERS: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Calls `onIdle(n)` for the n-th idle line of a turn, every `everyMs` while
 * the player stays idle. Becoming inactive (page hidden, a sheet open,
 * reviewing an older move, game over) pauses and resets the clock: when
 * active again the next line comes a full `everyMs` later. `n` keeps
 * counting within the turn, so every line has its own key.
 */
export function createIdleTimer(
  onIdle: (count: number) => void,
  timers: Timers = PAGE_TIMERS,
  everyMs: number = IDLE_EVERY_MS,
): IdleTimer {
  let handle: unknown = null;
  let shown = 0;
  let turn: unknown = undefined;

  const clear = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const schedule = () => {
    handle = timers.setTimeout(() => {
      shown += 1;
      onIdle(shown);
      schedule();
    }, everyMs);
  };

  return {
    update(active, nextTurn) {
      const newTurn = nextTurn !== turn;
      if (newTurn) {
        turn = nextTurn;
        shown = 0;
      }
      if (!active) return clear();
      if (handle !== null && !newTurn) return; // already counting for this turn
      clear();
      schedule();
    },
    stop: clear,
  };
}

// How long the game over panel waits before showing the AI's tips.
export const TIPS_DELAY_MS = 5_000;

/** Calls `onReveal` after `ms`; returns a function that cancels it. */
export function revealAfter(ms: number, onReveal: () => void, timers: Timers = PAGE_TIMERS): () => void {
  const handle = timers.setTimeout(onReveal, ms);
  return () => timers.clearTimeout(handle);
}
