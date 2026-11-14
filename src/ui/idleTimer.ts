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

// The resign pressure (D69, timing D70): once the engine has proved the
// player's position lost, every message stays 10 seconds, then the AI types
// (the dots wave) for 5 seconds, then it asks again for a resignation, for
// as long as the player does not play. Message 0 is the AI's own line for
// its move.
export const PRESSURE_SHOW_MS = 10_000;
export const PRESSURE_GAP_MS = 5_000;

export interface PressureState {
  readonly count: number; // 0: the AI's line for its move; 1, 2...: the asks to resign
  readonly showing: boolean; // false while it types the next one (the 5 second gap)
}

export interface PressureTimer {
  // `active`: the position is proven lost, it is the player's turn, they
  // have not picked up a piece, nothing covers the board and the page is
  // visible. `turn` identifies the turn: a new one starts again at 0.
  update(active: boolean, turn: unknown): void;
  stop(): void;
}

/**
 * Calls `onChange` each time the bubble should change: typing after 10
 * seconds, the next ask after 5 more. Becoming inactive pauses the clock;
 * when active again, a message on screen gets its full 10 seconds and the
 * typing its full 5 (nothing is cut short or skipped).
 */
export function createPressureTimer(
  onChange: (state: PressureState) => void,
  timers: Timers = PAGE_TIMERS,
  showMs: number = PRESSURE_SHOW_MS,
  gapMs: number = PRESSURE_GAP_MS,
): PressureTimer {
  let handle: unknown = null;
  let turn: unknown = undefined;
  let state: PressureState = { count: 0, showing: true };

  const clear = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const schedule = () => {
    handle = timers.setTimeout(
      () => {
        state = state.showing ? { count: state.count, showing: false } : { count: state.count + 1, showing: true };
        onChange(state);
        schedule();
      },
      state.showing ? showMs : gapMs,
    );
  };

  return {
    update(active, nextTurn) {
      if (nextTurn !== turn) {
        turn = nextTurn;
        clear();
        if (state.count !== 0 || !state.showing) {
          state = { count: 0, showing: true };
          onChange(state);
        }
      }
      if (!active) return clear();
      if (handle === null) schedule();
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
