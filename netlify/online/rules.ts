// The rules of a room, as pure functions of what is stored and the time:
// its status, each player's presence, the forfeit after a disconnect, and
// the view each player gets. The handlers act on what these say.
import type { Player } from "../../src/engine";
import { AWAY_AFTER_MS, FORFEIT_AFTER_MS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_IDLE_HOURS } from "../../src/online/protocol";
import type { Presence, RoomStatus, RoomView } from "../../src/online/protocol";
import type { Finish, MatchRecord, MemberRecord, RoomSnapshot } from "./store";

const HOUR_MS = 3_600_000;

/**
 * A room code from random bytes. A byte is used only below 248 (8 * 31), so
 * every one of the 31 characters is equally likely.
 */
export function roomCodeFrom(randomBytes: (count: number) => Uint8Array): string {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of randomBytes(ROOM_CODE_LENGTH * 2)) {
      if (byte < 248 && code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
    }
  }
  return code;
}

/** The last time anyone did anything in the room. */
export function lastUse(snapshot: RoomSnapshot): number {
  return Math.max(snapshot.room.usedAt.getTime(), ...snapshot.members.map((member) => member.seenAt.getTime()));
}

export function roomStatus(snapshot: RoomSnapshot, now: Date): RoomStatus {
  if (snapshot.room.closedAt) return "closed";
  if (lastUse(snapshot) < now.getTime() - ROOM_IDLE_HOURS * HOUR_MS) return "expired";
  const { match } = snapshot;
  if (!match) return snapshot.members.length < 2 ? "waiting" : "ready";
  if (match.finished) return "finished";
  return match.startsAt.getTime() > now.getTime() ? "ready" : "playing";
}

export function presenceOf(member: MemberRecord, now: Date): Presence {
  if (member.leftAt || now.getTime() - member.seenAt.getTime() > AWAY_AFTER_MS) return "offline";
  return member.away ? "away" : "online";
}

/** When an absent player loses by forfeit: 60 seconds after they count as gone. */
const forfeitAt = (member: MemberRecord) => member.seenAt.getTime() + AWAY_AFTER_MS + FORFEIT_AFTER_MS;

export const colourOf = (match: MatchRecord, playerId: string): Player | null =>
  match.blackId === playerId ? "black" : match.whiteId === playerId ? "white" : null;

export const toMoveOf = (match: MatchRecord): Player => (match.moves.length % 2 === 0 ? "black" : "white");

export const otherMember = (snapshot: RoomSnapshot, playerId: string): MemberRecord | null =>
  snapshot.members.find((member) => member.playerId !== playerId) ?? null;

/**
 * The forfeit owed now, if any: during a game, the opponent of the player
 * who asks has been gone for the whole countdown. Only a player who is
 * here can win this way (they are the one asking).
 */
export function forfeitDue(snapshot: RoomSnapshot, presentId: string, now: Date): Finish | null {
  const { match } = snapshot;
  if (!match || match.finished || match.startsAt.getTime() > now.getTime() || snapshot.room.closedAt) return null;
  const absent = otherMember(snapshot, presentId);
  if (!absent || presenceOf(absent, now) !== "offline" || forfeitAt(absent) > now.getTime()) return null;
  return { winnerId: presentId, reason: "forfeit" };
}

/**
 * What `viewerId` sees. `since`: how many moves of the current game the
 * browser already has; only the later ones are sent.
 */
export function roomView(snapshot: RoomSnapshot, viewerId: string, now: Date, since = 0): RoomView {
  const me = snapshot.members.find((member) => member.playerId === viewerId)!;
  const other = otherMember(snapshot, viewerId);
  const { match, room } = snapshot;
  const status = roomStatus(snapshot, now);
  const live = match !== null && !match.finished && status === "playing";
  const from = match ? Math.min(Math.max(0, Math.trunc(since)), match.moves.length) : 0;
  const winner = match?.winnerId ? colourOf(match, match.winnerId) : null;

  return {
    code: room.code,
    status,
    host: room.hostId === viewerId,
    you: { username: me.username, avatar: me.avatar, country: me.country, colour: match ? colourOf(match, viewerId) : null },
    opponent: other && {
      username: other.username,
      avatar: other.avatar,
      country: other.country,
      colour: match ? colourOf(match, other.playerId) : null,
      presence: presenceOf(other, now),
      forfeitInMs: live && presenceOf(other, now) === "offline" && !other.leftAt ? Math.max(0, forfeitAt(other) - now.getTime()) : null,
      left: other.leftAt !== null,
    },
    match: match && {
      number: match.number,
      startsInMs: Math.max(0, match.startsAt.getTime() - now.getTime()),
      moveCount: match.moves.length,
      from,
      moves: match.moves.slice(from),
      toMove: toMoveOf(match),
      winner,
      reason: match.reason,
    },
    rematch: room.rematchBy === null || !match?.finished ? "none" : room.rematchBy === viewerId ? "you" : "opponent",
  };
}
