// The pure parts of keeping a room in step with the server (D141): how the
// moves the server sends join the ones the browser has, and how often to
// ask. Polling, because it needs nothing beyond the functions we already
// run (see decisions-log D141 for why not Supabase Realtime).
import type { EncodedMove } from "../../leaderboard/protocol";
import type { RoomStatus, RoomView } from "../../online/protocol";

/** The moves of the current game the browser has, all of them, from the server. */
export interface KnownGame {
  readonly match: number | null;
  readonly moves: readonly EncodedMove[];
}

export const NO_GAME: KnownGame = { match: null, moves: [] };

/**
 * The game after a view from the server. The server sends the moves from
 * `from` on; they replace what the browser had from there (the server is
 * always right). `gap`: the view starts after the moves the browser has
 * (another request moved the game on), so the browser must ask again from
 * where it is.
 */
export function mergeGame(known: KnownGame, view: RoomView): { game: KnownGame; gap: boolean } {
  const match = view.match;
  if (!match) return { game: NO_GAME, gap: false };
  const base = known.match === match.number ? known.moves : [];
  if (match.from > base.length) return { game: known.match === match.number ? known : { match: match.number, moves: [] }, gap: true };
  const moves = [...base.slice(0, match.from), ...match.moves];
  return { game: { match: match.number, moves: moves.length === match.moveCount ? moves : moves.slice(0, match.moveCount) }, gap: false };
}

// How often to ask, in milliseconds: about every second while a game is on
// or about to start, every two seconds while waiting or after the game,
// every five seconds while the tab is hidden (only to say "still here,
// away"), never once the room has closed or expired.
export const POLL_MS: Record<RoomStatus, number | null> = {
  waiting: 2000,
  ready: 1000,
  playing: 1000,
  finished: 2000,
  closed: null,
  expired: null,
};
export const HIDDEN_POLL_MS = 5000;
export const RETRY_MS = 3000;
// Waiting for a friend stops asking after 15 minutes until the player says
// they still wait (each question costs the free plan a request).
export const WAIT_LIMIT_MS = 15 * 60_000;

export function pollDelay(status: RoomStatus, hidden: boolean): number | null {
  const delay = POLL_MS[status];
  if (delay === null) return null;
  return hidden ? Math.max(delay, HIDDEN_POLL_MS) : delay;
}
