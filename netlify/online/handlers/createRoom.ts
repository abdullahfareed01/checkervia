// POST {} with the player's token: a new room with a fresh random code, the
// player in it as the host. Making a room closes the player's other rooms,
// except one where a game is being played; one device or player keeps at
// most MAX_OPEN_ROOMS open. Old rooms are deleted here too (ROOM_KEEP_DAYS).
import { fail, guarded, ok, parseBody } from "../../leaderboard/http";
import { saltedHash } from "../../leaderboard/security";
import { MAX_OPEN_ROOMS, ROOM_IDLE_HOURS, ROOM_KEEP_DAYS } from "../../../src/online/protocol";
import type { RoomResponse } from "../../../src/online/protocol";
import { isResponse, roomFail, ROOM_MAX_BODY, signedIn } from "../http";
import type { OnlineHandler } from "../http";
import { roomCodeFrom, roomStatus, roomView } from "../rules";

// Reports are kept longer than rooms, for a person to look at (D94).
export const REPORT_KEEP_DAYS = 180;
const CODE_TRIES = 5;

export const handleCreateRoom: OnlineHandler = (request, deps) =>
  guarded("createRoom", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    if (!parseBody(request.body, ROOM_MAX_BODY, [])) return fail(400, "invalid", "Invalid request.");
    const player = await signedIn(request, deps, "createRoom");
    if (isResponse(player)) return player;
    const now = deps.now();

    await deps.online.cleanup(now, ROOM_KEEP_DAYS, REPORT_KEEP_DAYS);
    // A new room replaces the player's rooms that are not in a game.
    for (const hosted of await deps.online.hostedRooms(player.id)) {
      if (!["ready", "playing"].includes(roomStatus(hosted, now))) await deps.online.closeRoom(hosted.room.id, now);
    }
    const deviceHash = await saltedHash(deps.salt, "device", request.deviceId!);
    const since = new Date(now.getTime() - ROOM_IDLE_HOURS * 3_600_000);
    if ((await deps.online.openRoomCount(player.id, deviceHash, since)) >= MAX_OPEN_ROOMS) return roomFail("tooManyRooms");

    const host = { playerId: player.id, username: player.username, avatar: player.avatar, country: player.country };
    for (let attempt = 0; attempt < CODE_TRIES; attempt += 1) {
      const code = roomCodeFrom(deps.randomBytes);
      const created = await deps.online.createRoom({ code, hostId: player.id, deviceHash, at: now }, host);
      if (created === "codeTaken") continue;
      const snapshot = (await deps.online.snapshot(code))!;
      const response: RoomResponse = { room: roomView(snapshot, player.id, now) };
      return ok(response, 201);
    }
    deps.log("createRoom: no free room code");
    return fail(503, "unavailable", "Online play is not available right now.");
  });
