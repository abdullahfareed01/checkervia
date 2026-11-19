// What every room handler shares on top of the leaderboard's helpers: the
// room store in the dependencies, the limits, the sign in (the profile
// token, as everywhere) and loading the caller's room.
import { isRoomCode } from "../../src/online/protocol";
import type { RoomErrorCode } from "../../src/online/protocol";
import { checkRateLimits, fail, notSignedIn, playerFromToken, validDevice } from "../leaderboard/http";
import type { LeaderboardDeps, LeaderboardRequest, LeaderboardResponse, Limit } from "../leaderboard/http";
import type { PlayerRecord } from "../leaderboard/store";
import { forfeitDue, roomStatus } from "./rules";
import type { OnlineStore, RoomSnapshot } from "./store";

export interface OnlineDeps extends LeaderboardDeps {
  readonly online: OnlineStore;
  readonly randomBytes: (count: number) => Uint8Array;
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

/**
 * The room with this code where the player is a member, refreshed: their
 * sign of life is stored, and a forfeit that is due is settled first.
 * Answers an error response for a bad code, an unknown room or a stranger.
 */
export async function memberRoom(code: unknown, playerId: string, deps: OnlineDeps, away = false): Promise<RoomSnapshot | LeaderboardResponse> {
  if (!isRoomCode(code)) return fail(400, "invalid", "Invalid request.");
  const snapshot = await deps.online.snapshot(code);
  if (!snapshot) return roomFail("roomNotFound");
  if (!snapshot.members.some((member) => member.playerId === playerId)) return roomFail("notMember");
  const now = deps.now();
  // An expired room stays as it is: looking at it is not using it.
  if (roomStatus(snapshot, now) === "expired") return snapshot;
  await deps.online.touchMember(snapshot.room.id, playerId, now, away);
  const due = forfeitDue(snapshot, playerId, now);
  if (due && snapshot.match) {
    await deps.online.finishMatch(snapshot.match.id, due, now);
    return (await deps.online.snapshot(code)) ?? snapshot;
  }
  // As stored now, without reading it again.
  return { ...snapshot, members: snapshot.members.map((member) => (member.playerId === playerId ? { ...member, seenAt: now, away } : member)) };
}

/** The room still allows play: not closed, not expired. */
export function closedProblem(snapshot: RoomSnapshot, now: Date): LeaderboardResponse | null {
  const status = roomStatus(snapshot, now);
  if (status === "closed") return roomFail("roomClosed");
  if (status === "expired") return roomFail("roomExpired");
  return null;
}
