// What every room handler shares on top of the leaderboard's helpers: the
// room store in the dependencies, the limits, the sign in (the profile
// token, as everywhere) and loading the caller's room.
import { isRoomCode, ROOM_IDLE_HOURS } from "../../src/online/protocol";
import type { RoomErrorCode } from "../../src/online/protocol";
import { checkRateLimits, fail, notSignedIn, playerFromToken, rateLimitCounters, rateLimited, validDevice } from "../leaderboard/http";
import type { LeaderboardDeps, LeaderboardRequest, LeaderboardResponse, Limit } from "../leaderboard/http";
import { bearerToken, sha256Hex } from "../leaderboard/security";
import type { PlayerRecord } from "../leaderboard/store";
import { forfeitDue, roomStatus } from "./rules";
import type { OneRoundStore, OnlineStore, RoomSnapshot } from "./store";

export interface OnlineDeps extends LeaderboardDeps {
  readonly online: OnlineStore;
  readonly randomBytes: (count: number) => Uint8Array;
  // The one round steps of migration 10 (D153), on Supabase only. Without
  // them, or while the database does not have them, the steps of D151 run.
  readonly oneRound?: OneRoundStore;
}

export type OnlineHandler = (request: LeaderboardRequest, deps: OnlineDeps) => Promise<LeaderboardResponse>;

// Per fixed window. Reading the room runs about once a second per player
// during a game (twice that with a second tab); joining is tight, so room
// codes cannot be tried one after another.
export const ROOM_LIMITS = {
  createRoom: { windowSeconds: 3600, perDevice: 12, perIp: 40 },
  joinRoom: { windowSeconds: 600, perDevice: 20, perIp: 60 },
  roomState: { windowSeconds: 60, perDevice: 150, perIp: 400 },
  move: { windowSeconds: 60, perDevice: 90, perIp: 240 },
  roomAction: { windowSeconds: 60, perDevice: 30, perIp: 90 }, // resign, rematch, leave
} satisfies Record<string, Limit>;

// Body limits in characters: a move is at most 13 numbers.
export const ROOM_MAX_BODY = 200;

const MESSAGES: Record<RoomErrorCode, string> = {
  roomNotFound: "There is no room with this code.",
  roomFull: "This room already has two players.",
  roomExpired: "This room has expired.",
  roomClosed: "This room is closed.",
  tooManyRooms: "You have too many open rooms. Leave one first.",
  notMember: "You are not in this room.",
  notStarted: "The game has not started yet.",
  notYourTurn: "It is not your turn.",
  illegal: "This move is not allowed.",
  stale: "The game has moved on. Please wait a moment.",
  gameOver: "This game is over.",
  gameOn: "The game is still going.",
  tooLong: "This game has too many moves.",
};

const STATUS: Record<RoomErrorCode, number> = {
  roomNotFound: 404,
  roomFull: 409,
  roomExpired: 410,
  roomClosed: 410,
  tooManyRooms: 409,
  notMember: 403,
  notStarted: 409,
  notYourTurn: 409,
  illegal: 422,
  stale: 409,
  gameOver: 409,
  gameOn: 409,
  tooLong: 422,
};

export const roomFail = (code: RoomErrorCode) => fail(STATUS[code], code, MESSAGES[code]);

/**
 * The checks every room request starts with: a valid device, the rate
 * limit, and a profile. Returns the player, or the response to send.
 */
export async function signedIn(request: LeaderboardRequest, deps: OnlineDeps, action: keyof typeof ROOM_LIMITS): Promise<PlayerRecord | LeaderboardResponse> {
  if (!validDevice(request)) return fail(400, "invalid", "Invalid request.");
  const [limited, player] = await Promise.all([checkRateLimits(`room:${action}`, ROOM_LIMITS[action], request, deps), playerFromToken(request, deps.store)]);
  if (limited) return limited;
  return player ?? notSignedIn();
}

export const isResponse = (value: unknown): value is LeaderboardResponse =>
  typeof value === "object" && value !== null && "status" in value && "body" in value;

/** The signed in player and their room as read; `touchedAt`: when their sign of life was stored with it (D153). */
export interface SignedInRoom {
  readonly player: PlayerRecord;
  readonly room: RoomSnapshot | null;
  readonly touchedAt: Date | null;
}

/**
 * `signedIn` and the room read in one database round (D151): the room with
 * this code is read while the device, the rate limits and the token are
 * checked. The answers come in the same order as before: a sign in problem
 * first (nothing about the room is used or sent then), then a bad code,
 * then the room. `room` is null when there is no room with this code.
 *
 * With migration 10 (D153) the same steps, and the sign of life when they
 * allow it, are one call to the database; every check is still made here,
 * on what it answers, in the same order.
 */
export async function signedInWithRoom(
  request: LeaderboardRequest,
  deps: OnlineDeps,
  action: keyof typeof ROOM_LIMITS,
  code: unknown,
  away = false,
): Promise<SignedInRoom | LeaderboardResponse> {
  if (deps.oneRound && isRoomCode(code) && validDevice(request)) {
    const limit = ROOM_LIMITS[action];
    const token = bearerToken(request.authorization);
    const now = deps.now();
    const answer = await deps.oneRound.signInWithRoom({
      code,
      tokenHash: token === null ? null : await sha256Hex(token),
      counters: await rateLimitCounters(`room:${action}`, limit, request, deps),
      windowSeconds: limit.windowSeconds,
      now,
      away,
      idleHours: ROOM_IDLE_HOURS,
    });
    if (answer) {
      const limited = rateLimited(answer.counters);
      if (limited) return limited;
      if (!answer.player || answer.player.hidden) return notSignedIn();
      return { player: answer.player, room: answer.room, touchedAt: answer.touched ? now : null };
    }
  }
  // No read for a bad code or a request signedIn refuses before any lookup.
  const read = isRoomCode(code) && validDevice(request) ? deps.online.snapshot(code) : Promise.resolve(null);
  const [player, room] = await Promise.allSettled([signedIn(request, deps, action), read]);
  if (player.status === "rejected") throw player.reason;
  if (isResponse(player.value)) return player.value;
  if (room.status === "rejected") throw room.reason;
  return { player: player.value, room: room.value, touchedAt: null };
}

/** The caller's room, and their sign of life still to store (null: nothing to store). */
export interface MemberRoom {
  readonly snapshot: RoomSnapshot;
  readonly touch: (() => Promise<void>) | null;
}

/**
 * The checks of `memberRoom` on a room already read (`loaded`), without
 * storing the sign of life: the caller stores it with `touch`, in the same
 * round as its own write. A forfeit that is due is settled first, as before
 * (the sign of life stored, the game ended, the room read again).
 * `touchedAt`: the sign of life was already stored then (D153), so `touch`
 * is null and the room as answered says that time.
 */
export async function loadedMemberRoom(
  code: unknown,
  loaded: RoomSnapshot | null,
  playerId: string,
  deps: OnlineDeps,
  away = false,
  touchedAt: Date | null = null,
): Promise<MemberRoom | LeaderboardResponse> {
  if (!isRoomCode(code)) return fail(400, "invalid", "Invalid request.");
  const snapshot = loaded;
  if (!snapshot) return roomFail("roomNotFound");
  if (!snapshot.members.some((member) => member.playerId === playerId)) return roomFail("notMember");
  const now = touchedAt ?? deps.now();
  // An expired room stays as it is: looking at it is not using it.
  if (roomStatus(snapshot, now) === "expired") {
    if (touchedAt) deps.log("rooms: the database stored a sign of life in a room seen as expired");
    return { snapshot, touch: null };
  }
  const touch = touchedAt ? async () => {} : () => deps.online.touchMember(snapshot.room.id, playerId, now, away);
  const due = forfeitDue(snapshot, playerId, now);
  if (due && snapshot.match) {
    await touch();
    await deps.online.finishMatch(snapshot.match.id, due, now);
    return { snapshot: (await deps.online.snapshot(code)) ?? snapshot, touch: null };
  }
  // As stored once `touch` has run, without reading it again.
  return { snapshot: { ...snapshot, members: snapshot.members.map((member) => (member.playerId === playerId ? { ...member, seenAt: now, away } : member)) }, touch: touchedAt ? null : touch };
}

/**
 * The room with this code where the player is a member, refreshed: their
 * sign of life is stored, and a forfeit that is due is settled first.
 * Answers an error response for a bad code, an unknown room or a stranger.
 */
export async function memberRoom(code: unknown, playerId: string, deps: OnlineDeps, away = false): Promise<RoomSnapshot | LeaderboardResponse> {
  if (!isRoomCode(code)) return fail(400, "invalid", "Invalid request.");
  const member = await loadedMemberRoom(code, await deps.online.snapshot(code), playerId, deps, away);
  if (isResponse(member)) return member;
  if (member.touch) await member.touch();
  return member.snapshot;
}

/** The room still allows play: not closed, not expired. */
export function closedProblem(snapshot: RoomSnapshot, now: Date): LeaderboardResponse | null {
  const status = roomStatus(snapshot, now);
  if (status === "closed") return roomFail("roomClosed");
  if (status === "expired") return roomFail("roomExpired");
  return null;
}
