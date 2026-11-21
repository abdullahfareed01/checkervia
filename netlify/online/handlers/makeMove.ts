// POST { code, match, ply, move } with the player's token: one move in the
// current game. The server checks everything itself, from what it stored:
// the game is on and has started, it is this player's colour to move, `ply`
// is the next move's number, and the move is in the rules engine's legal
// list for the position after every stored move. The same move sent again
// (a retry after a lost answer) is answered like the first time and stored
// once; any other repeat or an old ply is refused as stale.
//
// Three database rounds (D151): the sign in checks with the room read; the
// move, stored only if the game still has the moves the checks saw; then
// the player's sign of life and the room's last use, together. The answer
// is the room as it was read with this move added, not read again.
import { fail, guarded, ok, parseBody } from "../../leaderboard/http";
import type { LeaderboardResponse } from "../../leaderboard/http";
import { decodeMove, isEncodedMove, replayMoves } from "../../../src/online/game";
import { MAX_GAME_MOVES } from "../../../src/online/protocol";
import type { RoomResponse } from "../../../src/online/protocol";
import { closedProblem, isResponse, loadedMemberRoom, roomFail, ROOM_MAX_BODY, signedInWithRoom } from "../http";
import type { OnlineHandler } from "../http";
import type { Finish, RoomSnapshot } from "../store";
import { colourOf, roomView, toMoveOf } from "../rules";

const sameEncoded = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index]);

export const handleMakeMove: OnlineHandler = (request, deps) =>
  guarded("makeMove", deps, async () => {
    if (request.method !== "POST") return fail(405, "method", "Method not allowed.");
    const body = parseBody(request.body, ROOM_MAX_BODY, ["code", "match", "ply", "move"]);
    const { match: number, ply, move } = body ?? {};
    if (!body || !Number.isInteger(number) || !Number.isInteger(ply) || (ply as number) < 0 || !isEncodedMove(move)) {
      return fail(400, "invalid", "Invalid request.");
    }
    const signed = await signedInWithRoom(request, deps, "move", body["code"]);
    if (isResponse(signed)) return signed;
    const player = signed.player;
    const now = deps.now();

    const member = await loadedMemberRoom(body["code"], signed.room, player.id, deps);
    if (isResponse(member)) return member;
    const { snapshot } = member;
    let saved = false;

    // Every check and the move itself; the sign of life is stored after,
    // whatever the answer (as each room request does).
    const play = async (): Promise<LeaderboardResponse> => {
      const answer = (since: number) => {
        const response: RoomResponse = { room: roomView(snapshot, player.id, now, since) };
        return ok(response);
      };
      const closed = closedProblem(snapshot, now);
      if (closed) return closed;
      const match = snapshot.match;
      if (!match || match.number !== number) return roomFail("stale");
      const colour = colourOf(match, player.id)!;

      // A retry of a move that was stored: the same answer again.
      if ((ply as number) < match.moves.length) {
        const mine = ((ply as number) % 2 === 0 ? "black" : "white") === colour;
        return mine && sameEncoded(match.moves[ply as number]!, move) ? answer(ply as number) : roomFail("stale");
      }
      if (match.finished) return roomFail("gameOver");
      if (match.startsAt.getTime() > now.getTime()) return roomFail("notStarted");
      if (ply !== match.moves.length) return roomFail("stale");
      if (toMoveOf(match) !== colour) return roomFail("notYourTurn");
      if (match.moves.length >= MAX_GAME_MOVES) return roomFail("tooLong");

      const game = replayMoves(match.moves);
      if (!game) {
        deps.log("makeMove: stored game does not replay");
        return fail(503, "unavailable", "Online play is not available right now.");
      }
      if (game.winner || game.drawn) {
        deps.log("makeMove: stored game is over but not finished");
        return roomFail("gameOver");
      }
      if (!decodeMove(game.board, colour, move)) return roomFail("illegal");
      const moves = [...match.moves, move];
      // The game after this move: won on the board, or drawn by the rules of every game (D89).
      const played = replayMoves(moves);
      if (!played) return roomFail("illegal");
      const finish: Finish | null =
        played.winner === colour ? { winnerId: player.id, reason: "board" } : played.drawn ? { winnerId: null, reason: played.drawn } : null;
      if ((await deps.online.saveMove(match.id, match.moves.length, moves, finish, now)) === "conflict") return roomFail("stale");
      saved = true;

      // The room as stored now: the game had exactly the moves read above
      // (saveMove checks it), plus this one; the room is used now.
      const after: RoomSnapshot = {
        ...snapshot,
        room: { ...snapshot.room, usedAt: now },
        match: { ...match, moves, ...(finish ? { finished: true, winnerId: finish.winnerId, reason: finish.reason } : {}) },
      };
      const response: RoomResponse = { room: roomView(after, player.id, now, ply as number) };
      return ok(response);
    };

    const response = await play();
    await Promise.all([member.touch?.(), saved ? deps.online.touchRoom(snapshot.room.id, now) : undefined]);
    return response;
  });
