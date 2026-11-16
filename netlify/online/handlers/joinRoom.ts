// POST { code } with the player's token: takes the free seat in a waiting
// room, and the first game starts after the ready countdown with random
// colours (the same rule as against the AI: Black or White, half and half,
// Black moves first). A player already in the room just comes back in. A
// room with a player who blocked this one (or whom this one blocked) is
// answered like a room that does not exist.
import { fail, guarded, ok, parseBody } from "../../leaderboard/http";
import { READY_MS } from "../../../src/online/protocol";
import type { RoomResponse } from "../../../src/online/protocol";
import { closedProblem, isResponse, memberRoom, roomFail, ROOM_MAX_BODY, signedIn } from "../http";
import type { OnlineDeps, OnlineHandler } from "../http";
import { roomStatus, roomView } from "../rules";
import type { RoomSnapshot } from "../store";

/**
 * Starts game `number` in a room of two, if it is not started yet. The first
 * game's colours are random; a rematch swaps the last game's colours.
 */
export async function startMatch(snapshot: RoomSnapshot, number: number, deps: OnlineDeps): Promise<void> {
  const [host, guest] = snapshot.members;
  if (!host || !guest) return;
  const previous = snapshot.match;
  const hostIsBlack = previous ? previous.whiteId === host.playerId : (deps.randomBytes(1)[0]! & 1) === 0;
  await deps.online.startMatch({
    roomId: snapshot.room.id,
    number,
    blackId: hostIsBlack ? host.playerId : guest.playerId,
    whiteId: hostIsBlack ? guest.playerId : host.playerId,
    startsAt: new Date(deps.now().getTime() + READY_MS),
  });
}

export const handleJoinRoom: OnlineHandler = (request, deps) =>
  guarded("joinRoom", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, ROOM_MAX_BODY, ["code"]);
    if (!body) return fail(400, "invalid", "Invalid request.");
    const player = await signedIn(request, deps, "joinRoom");
    if (isResponse(player)) return player;
    const now = deps.now();

    const known = await memberRoom(body["code"], player.id, deps);
    if (isResponse(known) && known.status !== 403) return known; // a bad code or no such room
    if (!isResponse(known)) {
      // Already in this room: back in.
      const response: RoomResponse = { room: roomView(known, player.id, now) };
      return ok(response);
    }

    const snapshot = (await deps.online.snapshot(body["code"] as string))!;
    const closed = closedProblem(snapshot, now);
    if (closed) return closed;
    if (snapshot.members.length >= 2 || roomStatus(snapshot, now) !== "waiting") return roomFail("roomFull");
    if (await deps.online.blockedBetween(snapshot.room.hostId, player.id)) return roomFail("roomNotFound");

    const member = { playerId: player.id, username: player.username, avatar: player.avatar, country: player.country };
    if ((await deps.online.addMember(snapshot.room.id, member, now)) === "full") return roomFail("roomFull");
    await startMatch((await deps.online.snapshot(snapshot.room.code))!, 1, deps);
    const response: RoomResponse = { room: roomView((await deps.online.snapshot(snapshot.room.code))!, player.id, now) };
    return ok(response);
  });
