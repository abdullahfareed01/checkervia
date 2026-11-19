// Online rooms with a friend (D140 to D145): what the browser and the room
// functions send each other, and the limits both sides agree on. Pure.
//
// A room holds two players: the one who made it (the host) and the friend
// who joined with its code. They play one game at a time (a match); a
// rematch is the next match in the same room, with the colours swapped.
// The server decides everything (the colours, whose turn it is, which moves
// are legal, when a game ends); the browser only shows what it is told.
import type { DrawReason, Player } from "../engine";
import type { EncodedMove } from "../leaderboard/protocol";

// Six characters from letters and digits that cannot be mixed up when read
// aloud or typed: no I, L, O, 0 or 1. 31 ** 6 is about 887 million codes.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** What the player typed or pasted, as a code: capitals, no spaces or other marks. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export const isRoomCode = (value: unknown): value is string => typeof value === "string" && ROOM_CODE_PATTERN.test(value);

/** The code in a shared link (/?room=CODE), or null. */
export function roomCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get("room");
  if (raw === null) return null;
  const code = normalizeRoomCode(raw);
  return isRoomCode(code) ? code : null;
}

// A room nobody has used for a day expires; its data is deleted after 30
// days (the Terms say so). One device or player keeps at most three rooms
// open at a time.
export const ROOM_IDLE_HOURS = 24;
export const ROOM_KEEP_DAYS = 30;
export const MAX_OPEN_ROOMS = 3;

// Presence: every request from a player's browser counts as a sign of life.
// The browser asks about every second during a game and every 5 seconds
// while its tab is hidden, so 12 seconds without a word means the player is
// gone. After that the other player sees a 60 second countdown; when it
// runs out they win by forfeit.
export const AWAY_AFTER_MS = 12_000;
export const FORFEIT_AFTER_MS = 60_000;

// From the moment both players are in to the first move: the ready screen
// with both players, then 3, 2, 1.
export const READY_MS = 4_500;

// A game cannot go on for ever (there is no draw rule yet): the same limit
// as the leaderboard's.
export { MAX_GAME_MOVES } from "../leaderboard/protocol";

export type Presence = "online" | "away" | "offline";

/**
 * How a finished game ended: on the board, by resignation, by forfeit after
 * a disconnect, the loser left the room, or a draw by the rules of every
 * game (D89): the same position a third time, or 40 moves each without
 * progress. A drawn game has no winner.
 */
export type FinishReason = "board" | "resign" | "forfeit" | "left" | DrawReason;

export const isDrawReason = (reason: FinishReason | null): reason is DrawReason => reason === "repetition" || reason === "noProgress";

/**
 * waiting: the host is alone. ready: both are in and the countdown runs.
 * playing, finished: the current game. closed: someone left the room.
 * expired: nobody used it for a day.
 */
export type RoomStatus = "waiting" | "ready" | "playing" | "finished" | "closed" | "expired";

/** What another player can see of you: the same as on the leaderboard. */
export interface OnlinePlayer {
  readonly username: string;
  readonly avatar: string | null;
  readonly country: string | null;
}

export interface OnlineOpponent extends OnlinePlayer {
  readonly colour: Player | null; // null until the first game starts
  readonly presence: Presence;
  // While they are offline during a game: the time left before they lose by
  // forfeit, in milliseconds. Null otherwise.
  readonly forfeitInMs: number | null;
  readonly left: boolean; // they left the room
}

export interface OnlineMatch {
  readonly number: number; // 1 for the first game, 2 for the first rematch...
  readonly startsInMs: number; // > 0 while the countdown runs
  readonly moveCount: number; // every move so far
  // The moves from `from` on (the browser asks only for the ones it lacks).
  readonly from: number;
  readonly moves: readonly EncodedMove[];
  readonly toMove: Player;
  readonly winner: Player | null;
  readonly reason: FinishReason | null;
}

export interface RoomView {
  readonly code: string;
  readonly status: RoomStatus;
  readonly host: boolean; // you made the room
  readonly you: OnlinePlayer & { readonly colour: Player | null };
  readonly opponent: OnlineOpponent | null; // null while waiting
  readonly match: OnlineMatch | null;
  // Who asked for a rematch after the game: nobody, you, or your opponent.
  readonly rematch: "none" | "you" | "opponent";
}

export interface RoomResponse {
  readonly room: RoomView;
}

export interface JoinRoomRequest {
  readonly code: string;
}

export interface MoveRequest {
  readonly code: string;
  readonly match: number;
  readonly ply: number; // the move's number in the game, from 0: must be the next one
  readonly move: EncodedMove;
}

export interface MatchRequest {
  readonly code: string;
  readonly match: number;
}

/** Error codes the room functions answer with, beyond the shared ones. */
export type RoomErrorCode =
  | "roomNotFound"
  | "roomFull"
  | "roomExpired"
  | "roomClosed"
  | "tooManyRooms"
  | "notMember"
  | "notStarted"
  | "notYourTurn"
  | "illegal"
  | "stale"
  | "gameOver"
  | "gameOn"
  | "tooLong";
