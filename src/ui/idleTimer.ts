// The idle lines' timer (Change 4): if it is the player's turn and they have
// not moved, the AI speaks after 30 seconds, and once more after 60. At most
// two per turn. Plain TypeScript with injectable timers, so tests can use
// fake timers.

export const IDLE_DELAYS_MS = [30_000, 60_000] as const;

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
 * Calls `onIdle(n)` for the n-th idle line of a turn. Becoming inactive
 * (page hidden, a sheet open, reviewing an older move, game over) pauses and
 * resets the clock: when active again it counts from zero, towards the
 * lines not yet shown this turn.
 */
export function createIdleTimer(
  onIdle: (count: number) => void,
  timers: Timers = PAGE_TIMERS,
  delays: readonly number[] = IDLE_DELAYS_MS,
): IdleTimer {
  let handles: unknown[] = [];
  let shown = 0;
  let turn: unknown = undefined;
  let running = false;

  const clear = () => {
    handles.forEach((handle) => timers.clearTimeout(handle));
    handles = [];
    running = false;
  };

  return {
    update(active, nextTurn) {
      const newTurn = nextTurn !== turn;
      if (newTurn) {
        turn = nextTurn;
        shown = 0;
      }
      if (!active) return clear();
      if (running && !newTurn) return; // already counting for this turn
      clear();
      running = true;
      handles = delays.slice(shown).map((delay) =>
        timers.setTimeout(() => {
          shown += 1;
          onIdle(shown);
        }, delay),
      );
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
