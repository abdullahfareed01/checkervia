// The storage the online room functions use (D140). Two adapters, as for the
// leaderboard: supabaseStore.ts (Postgres through the server's secret key,
// tables from migration 6) and memoryStore.ts (tests and local play). Each
// method is one small step that is safe when two requests race: the rules
// live in the handlers and in rules.ts, not here.
//
// Times always come from the handler (deps.now), never from the database
// clock, so both adapters behave the same.
import type { EncodedMove } from "../../src/leaderboard/protocol";
import type { FinishReason } from "../../src/online/protocol";
import type { PlayerRecord, RateLimitResult } from "../leaderboard/store";

export interface RoomRecord {
  readonly id: string;
  readonly code: string;
  readonly hostId: string;
  readonly deviceHash: string; // the host's device, as a keyed hash (the open room limit)
  readonly createdAt: Date;
  readonly usedAt: Date; // the last action in the room (presence counts too, see rules.ts)
  readonly closedAt: Date | null; // someone left
  readonly rematchBy: string | null; // the player who asked for a rematch
}

/** A player in a room, with what the other player sees of them (copied when they joined). */
export interface MemberRecord {
  readonly playerId: string;
  readonly seat: 0 | 1; // 0 the host, 1 the friend
  readonly username: string;
  readonly avatar: string | null;
  readonly country: string | null;
  readonly seenAt: Date; // their last request
  readonly away: boolean; // their tab was hidden at that request
  readonly leftAt: Date | null;
}

export interface MatchRecord {
  readonly id: string;
  readonly number: number;
  readonly blackId: string;
  readonly whiteId: string;
  readonly moves: readonly EncodedMove[];
  readonly startsAt: Date;
  readonly finished: boolean;
  readonly winnerId: string | null;
  readonly reason: FinishReason | null;
}

/** A room with its players and its latest match, read in one go. */
export interface RoomSnapshot {
  readonly room: RoomRecord;
  readonly members: readonly MemberRecord[];
  readonly match: MatchRecord | null;
}

export interface NewRoom {
  readonly code: string;
  readonly hostId: string;
  readonly deviceHash: string;
  readonly at: Date;
}

export interface NewMember {
  readonly playerId: string;
  readonly username: string;
  readonly avatar: string | null;
  readonly country: string | null;
}

export interface NewMatch {
  readonly roomId: string;
  readonly number: number;
  readonly blackId: string;
  readonly whiteId: string;
  readonly startsAt: Date;
}

export interface Finish {
  readonly winnerId: string | null; // null: a draw (D89)
  readonly reason: FinishReason;
}

export interface OnlineStore {
  /** The room and its host as seat 0; "codeTaken" when the code is in use (try another). */
  createRoom(room: NewRoom, host: NewMember): Promise<RoomRecord | "codeTaken">;
  snapshot(code: string): Promise<RoomSnapshot | null>;
  /** The rooms this player made that are not closed, with their players and latest match. */
  hostedRooms(playerId: string): Promise<RoomSnapshot[]>;
  /** Rooms not closed and used since `since`, made by this player or on this device. */
  openRoomCount(playerId: string, deviceHash: string, since: Date): Promise<number>;
  closeRoom(roomId: string, at: Date): Promise<void>;
  /** The friend in seat 1; "full" when someone else took it first. */
  addMember(roomId: string, member: NewMember, at: Date): Promise<"added" | "full">;
  /** A sign of life from a player (each request); `away` while their tab is hidden. */
  touchMember(roomId: string, playerId: string, at: Date, away: boolean): Promise<void>;
  touchRoom(roomId: string, at: Date): Promise<void>;
  /** A new game in the room; clears a rematch request. "exists" when that number was started already. */
  startMatch(match: NewMatch): Promise<"started" | "exists">;
  /**
   * Stores the game's moves after one more move, only if it still has
   * `expectedCount` moves and is not finished; "conflict" otherwise (another
   * request came first). `finish` when this move ended the game.
   */
  saveMove(matchId: string, expectedCount: number, moves: readonly EncodedMove[], finish: Finish | null, at: Date): Promise<"saved" | "conflict">;
  /** Ends the game if it is still going; "conflict" when it had already ended. */
  finishMatch(matchId: string, finish: Finish, at: Date): Promise<"finished" | "conflict">;
  /** Sets the rematch request if nobody asked yet; answers who asked (this player or the other one). */
  requestRematch(roomId: string, playerId: string): Promise<string | null>;
  /** True when either player blocked the other. */
  blockedBetween(playerA: string, playerB: string): Promise<boolean>;
  /** The player left: marks them, and closes the room. */
  leave(roomId: string, playerId: string, at: Date): Promise<void>;
  /** Deletes rooms (with their games and reactions) not used for `keepDays`, and old reports. */
  cleanup(now: Date, keepDays: number, reportDays: number): Promise<void>;
}

/**
 * The start of a room request in one database round (D153, migration 10):
 * the rate limit counters, the player of the token, the room, and the
 * player's sign of life, stored only when the counters allow the request,
 * the player exists and is not hidden, they are in the room, and the room
 * has not expired (`idleHours`, as roomStatus counts it). The handlers then
 * make every check on what comes back, exactly as without it.
 */
export interface RoomSignIn {
  readonly code: string;
  readonly tokenHash: string | null; // null: no token, so no player
  readonly counters: readonly { readonly key: string; readonly limit: number }[];
  readonly windowSeconds: number;
  readonly now: Date;
  readonly away: boolean;
  readonly idleHours: number;
}

export interface RoomSignInAnswer {
  readonly counters: readonly RateLimitResult[]; // in the order asked
  readonly player: PlayerRecord | null; // hidden players come back as they are; the handler refuses them
  readonly room: RoomSnapshot | null; // as read, before the sign of life
  readonly touched: boolean; // the sign of life was stored
}

/** The one round steps; each answers null while the database does not have migration 10. */
export interface OneRoundStore {
  signInWithRoom(request: RoomSignIn): Promise<RoomSignInAnswer | null>;
  /** saveMove and touchRoom in one step: the room's last use is stored only with the move. */
  saveMoveAndUse(matchId: string, roomId: string, expectedCount: number, moves: readonly EncodedMove[], finish: Finish | null, at: Date): Promise<"saved" | "conflict" | null>;
}
