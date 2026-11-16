// The other things a player can do in a room, each a POST with the token:
// - resign { code, match }: the current game goes to the opponent.
// - rematch { code, match }: after a game, asks for another one; when the
//   opponent asked already, the next game starts with the colours swapped.
// - leave { code }: the player leaves and the room closes. Leaving during a
//   game loses it.
import { fail, guarded, ok, parseBody } from "../../leaderboard/http";
import type { LeaderboardRequest, LeaderboardResponse } from "../../leaderboard/http";
import type { RoomResponse } from "../../../src/online/protocol";
import { closedProblem, isResponse, memberRoom, roomFail, ROOM_MAX_BODY, signedIn } from "../http";
import type { OnlineDeps, OnlineHandler } from "../http";
import { otherMember, roomView } from "../rules";
import type { RoomSnapshot } from "../store";
import { startMatch } from "./joinRoom";

type Action = (snapshot: RoomSnapshot, playerId: string, deps: OnlineDeps, body: Record<string, unknown>) => Promise<LeaderboardResponse | null>;

/** The shared steps: the body, the sign in, the room; then `act`, then the room as it is after. */
function roomAction(name: string, keys: readonly string[], act: Action): OnlineHandler {
  return (request: LeaderboardRequest, deps: OnlineDeps) =>
    guarded(name, deps, async () => {
      if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
      const body = parseBody(request.body, ROOM_MAX_BODY, keys);
      if (!body || (keys.includes("match") && !Number.isInteger(body["match"]))) return fail(400, "invalid", "Invalid request.");
      const player = await signedIn(request, deps, "roomAction");
      if (isResponse(player)) return player;
      const snapshot = await memberRoom(body["code"], player.id, deps);
      if (isResponse(snapshot)) return snapshot;
      const refused = await act(snapshot, player.id, deps, body);
      if (refused) return refused;
      const after = (await deps.online.snapshot(snapshot.room.code)) ?? snapshot;
      const response: RoomResponse = { room: roomView(after, player.id, deps.now(), Number.MAX_SAFE_INTEGER) };
      return ok(response);
    });
}

/** The current game, if it is game `number`; else the refusal. */
function currentMatch(snapshot: RoomSnapshot, number: unknown, deps: OnlineDeps) {
  const closed = closedProblem(snapshot, deps.now());
  if (closed) return closed;
  if (!snapshot.match || snapshot.match.number !== number) return roomFail("stale");
  return snapshot.match;
}

export const handleResign = roomAction("resign", ["code", "match"], async (snapshot, playerId, deps, body) => {
  const match = currentMatch(snapshot, body["match"], deps);
  if (isResponse(match)) return match;
  if (match.finished) return roomFail("gameOver");
  const opponent = otherMember(snapshot, playerId)!;
  await deps.online.finishMatch(match.id, { winnerId: opponent.playerId, reason: "resign" }, deps.now());
  await deps.online.touchRoom(snapshot.room.id, deps.now());
  return null;
});

export const handleRematch = roomAction("rematch", ["code", "match"], async (snapshot, playerId, deps, body) => {
  const match = currentMatch(snapshot, body["match"], deps);
  if (isResponse(match)) return match;
  if (!match.finished) return roomFail("gameOn");
  const asked = await deps.online.requestRematch(snapshot.room.id, playerId);
  // Both want another game: it starts (a second start of the same number does nothing).
  if (asked !== null && asked !== playerId) await startMatch(snapshot, match.number + 1, deps);
  await deps.online.touchRoom(snapshot.room.id, deps.now());
  return null;
});

export const handleLeaveRoom = roomAction("leave", ["code"], async (snapshot, playerId, deps) => {
  const now = deps.now();
  const { match } = snapshot;
  const opponent = otherMember(snapshot, playerId);
  if (match && !match.finished && opponent && !snapshot.room.closedAt) {
    await deps.online.finishMatch(match.id, { winnerId: opponent.playerId, reason: "left" }, now);
  }
  await deps.online.leave(snapshot.room.id, playerId, now);
  return null;
});
