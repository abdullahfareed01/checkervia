// GET ?code=&since=&away= with the player's token: the room as this player
// sees it, with the moves after the first `since`. Each call is also the
// player's sign of life (away=1 while their tab is hidden); a forfeit that
// is due is settled first. Asked about once a second during a game.
//
// Two database rounds (D151): the sign in checks with the room read, then
// the sign of life.
import { fail, guarded, ok } from "../../leaderboard/http";
import type { RoomResponse } from "../../../src/online/protocol";
import { isResponse, loadedMemberRoom, signedInWithRoom } from "../http";
import type { OnlineHandler } from "../http";
import { roomView } from "../rules";
import { startMatch } from "./joinRoom";

export const handleRoomState: OnlineHandler = (request, deps) =>
  guarded("roomState", deps, async () => {
    if (request.method !== "GET") return fail(405, "method", "Method not allowed.");
    const since = Number(request.query.get("since") ?? "0");
    if (!Number.isInteger(since) || since < 0 || since > 10_000) return fail(400, "invalid", "Invalid request.");
    const code = request.query.get("code");
    const signed = await signedInWithRoom(request, deps, "roomState", code);
    if (isResponse(signed)) return signed;
    const player = signed.player;

    const member = await loadedMemberRoom(code, signed.room, player.id, deps, request.query.get("away") === "1");
    if (isResponse(member)) return member;
    if (member.touch) await member.touch();
    let snapshot = member.snapshot;
    // Two players and no game: the join stopped half way. Start it now.
    if (snapshot.members.length === 2 && !snapshot.match && !snapshot.room.closedAt) {
      await startMatch(snapshot, 1, deps);
      snapshot = (await deps.online.snapshot(snapshot.room.code)) ?? snapshot;
    }
    const response: RoomResponse = { room: roomView(snapshot, player.id, deps.now(), since) };
    return ok(response);
  });
