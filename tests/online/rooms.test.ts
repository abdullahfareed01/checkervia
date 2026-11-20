// The online room functions (D140 to D143) with the in memory stores and a
// fake clock: the room's life from create to leave, the colours, the turn
// order, illegal, out of turn, duplicate and replayed moves, the forfeit
// after a disconnect, coming back, rematches, the limits, and that online
// games never touch the AI's record or the leaderboard.
import { describe, expect, it } from "vitest";
import { handleCreateRoom } from "../../netlify/online/handlers/createRoom";
import { handleJoinRoom } from "../../netlify/online/handlers/joinRoom";
import { handleLeaveRoom, handleRematch, handleResign } from "../../netlify/online/handlers/matchActions";
import { handleMakeMove } from "../../netlify/online/handlers/makeMove";
import { handleRoomState } from "../../netlify/online/handlers/roomState";
import { roomCodeFrom } from "../../netlify/online/rules";
import { ROOM_LIMITS } from "../../netlify/online/http";
import { getLegalMoves, initialBoard } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import { AWAY_AFTER_MS, FORFEIT_AFTER_MS, MAX_OPEN_ROOMS, READY_MS, ROOM_CODE_PATTERN } from "../../src/online/protocol";
import type { RoomView } from "../../src/online/protocol";
import { BLACK_WIN } from "../leaderboard/fixtures";
import { replayMoves } from "../../src/online/game";
import { drawnGame } from "./drawnGame";
import { call, later, player, world } from "./world";
import type { TestPlayer, World } from "./world";

const FIRST_BLACK_MOVE = encodeMove(getLegalMoves(initialBoard(), "black")[0]!);

async function create(w: World, host: TestPlayer) {
  const created = await call(handleCreateRoom, w, { as: host, body: {} });
  expect(created.status).toBe(201);
  return created.body.room!;
}

/** A room with two players whose countdown is over: the host is Black (the coin says so). */
async function startedRoom(w: World, hostName = "Hosty", guestName = "Guesty") {
  const host = await player(w, hostName);
  const guest = await player(w, guestName, { country: "GB", avatar: "a12" });
  const { code } = await create(w, host);
  w.coin.byte = 0;
  const joined = await call(handleJoinRoom, w, { as: guest, body: { code } });
  expect(joined.status).toBe(200);
  later(w, READY_MS);
  return { host, guest, code };
}

const state = (w: World, as: TestPlayer, code: string, query: Record<string, string> = {}) => call(handleRoomState, w, { as, query: { code, ...query } });
const move = (w: World, as: TestPlayer, code: string, ply: number, encoded: EncodedMove, match = 1) =>
  call(handleMakeMove, w, { as, body: { code, match, ply, move: encoded } });

describe("room codes", () => {
  it("are six characters from the alphabet without I, L, O, 0 or 1", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const code = roomCodeFrom((count) => Uint8Array.from({ length: count }, (_, index) => (seed * 31 + index * 17) % 256));
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it("skip bytes that would make some characters likelier than others", () => {
    // 248 and above are skipped: only the 5 and the 10 are used.
    const bytes = [255, 250, 248, 5, 249, 10, 251, 252, 253, 254, 255, 255];
    expect(roomCodeFrom(() => Uint8Array.from(bytes)).slice(0, 2)).toBe("FM");
  });
});

describe("making and joining a room", () => {
  it("needs a profile", async () => {
    const w = world();
    expect((await call(handleCreateRoom, w, { body: {} })).status).toBe(401);
    expect((await call(handleJoinRoom, w, { body: { code: "ABCDEF" } })).status).toBe(401);
  });

  it("makes a waiting room with a code, the host alone in it", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const room = await create(w, host);
    expect(room.code).toMatch(ROOM_CODE_PATTERN);
    expect(room).toMatchObject({ status: "waiting", host: true, opponent: null, match: null, you: { username: "Hosty", country: "PK", avatar: "a07", colour: null } });
  });

  it("refuses bad bodies and codes", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    expect((await call(handleCreateRoom, w, { as: host, body: { extra: 1 } })).status).toBe(400);
    expect((await call(handleCreateRoom, w, { as: host, body: "x".repeat(500) })).status).toBe(400);
    expect((await call(handleJoinRoom, w, { as: host, body: { code: "abc" } })).status).toBe(400);
    expect((await call(handleJoinRoom, w, { as: host, body: { code: "ABCDE0" } })).status).toBe(400);
    const missing = await call(handleJoinRoom, w, { as: host, body: { code: "ABCDEF" } });
    expect(missing).toMatchObject({ status: 404, body: { code: "roomNotFound" } });
    expect((await call(handleCreateRoom, w, { as: host, body: {}, device: "short" })).status).toBe(400);
  });

  it("joining fills the room and starts the first game after the ready countdown, with both players seen", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const guest = await player(w, "Guesty", { country: "GB", avatar: "a12" });
    const { code } = await create(w, host);
    const joined = (await call(handleJoinRoom, w, { as: guest, body: { code } })).body.room!;
    expect(joined).toMatchObject({ status: "ready", host: false, you: { username: "Guesty" }, opponent: { username: "Hosty", country: "PK", avatar: "a07", presence: "online", left: false } });
    expect(joined.match).toMatchObject({ number: 1, startsInMs: READY_MS, moveCount: 0, toMove: "black", winner: null });
    const hostView = (await state(w, host, code)).body.room!;
    expect(hostView.opponent).toMatchObject({ username: "Guesty", country: "GB", avatar: "a12" });
    later(w, READY_MS);
    expect((await state(w, host, code)).body.room!.status).toBe("playing");
  });

  it("gives the two players opposite colours, at random (the coin)", async () => {
    for (const [byte, hostColour] of [[0, "black"], [1, "white"]] as const) {
      const w = world();
      const host = await player(w, "Hosty");
      const guest = await player(w, "Guesty");
      const { code } = await create(w, host);
      w.coin.byte = byte;
      const joined = (await call(handleJoinRoom, w, { as: guest, body: { code } })).body.room!;
      expect(joined.opponent!.colour).toBe(hostColour);
      expect(joined.you.colour).toBe(hostColour === "black" ? "white" : "black");
    }
  });

  it("a third player finds the room full; the players themselves just come back in", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    const third = await player(w, "Thirdy");
    expect(await call(handleJoinRoom, w, { as: third, body: { code } })).toMatchObject({ status: 409, body: { code: "roomFull" } });
    expect((await call(handleJoinRoom, w, { as: host, body: { code } })).body.room!.host).toBe(true);
    expect((await call(handleJoinRoom, w, { as: guest, body: { code } })).body.room!.host).toBe(false);
    // A stranger cannot read the room or move in it.
    expect((await state(w, third, code)).status).toBe(403);
    expect((await move(w, third, code, 0, FIRST_BLACK_MOVE)).status).toBe(403);
  });

  it("a room nobody used for a day has expired", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const guest = await player(w, "Guesty");
    const { code } = await create(w, host);
    later(w, 24 * 3_600_000 + 1000);
    expect(await call(handleJoinRoom, w, { as: guest, body: { code } })).toMatchObject({ status: 410, body: { code: "roomExpired" } });
    expect((await state(w, host, code)).body.room!.status).toBe("expired");
  });

  it("is deleted 30 days after its last use, when someone makes a room", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const { code } = await create(w, host);
    later(w, 31 * 86_400_000);
    await create(w, await player(w, "Other"));
    expect(w.online.rooms.some((room) => room.code === code)).toBe(false);
  });
});

describe("the limits on rooms", () => {
  it("a new room closes the host's waiting room", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const first = await create(w, host);
    await create(w, host);
    expect((await state(w, host, first.code)).body.room!.status).toBe("closed");
  });

  it(`one device keeps at most ${MAX_OPEN_ROOMS} rooms with games going`, async () => {
    const w = world();
    const host = await player(w, "Hosty");
    for (let index = 0; index < MAX_OPEN_ROOMS; index += 1) {
      const { code } = await create(w, host);
      await call(handleJoinRoom, w, { as: await player(w, `Guest${index}`), body: { code } });
    }
    expect(await call(handleCreateRoom, w, { as: host, body: {} })).toMatchObject({ status: 409, body: { code: "tooManyRooms" } });
  });

  it("joining is rate limited, so codes cannot be tried one after another", async () => {
    const w = world();
    const guest = await player(w, "Guesty");
    let last = 0;
    for (let index = 0; index <= ROOM_LIMITS.joinRoom.perDevice; index += 1) last = (await call(handleJoinRoom, w, { as: guest, body: { code: "ABCDEF" } })).status;
    expect(last).toBe(429);
  });
});

describe("moves", () => {
  it("wait for the countdown", async () => {
    const w = world();
    const host = await player(w, "Hosty");
    const guest = await player(w, "Guesty");
    const { code } = await create(w, host);
    w.coin.byte = 0;
    await call(handleJoinRoom, w, { as: guest, body: { code } });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 409, body: { code: "notStarted" } });
  });

  it("follow the turn order: Black first, then each side in turn", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    expect(await move(w, guest, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 409, body: { code: "notYourTurn" } });
    const played = await move(w, host, code, 0, FIRST_BLACK_MOVE);
    expect(played.status).toBe(200);
    expect(played.body.room!.match).toMatchObject({ moveCount: 1, toMove: "white", from: 0, moves: [FIRST_BLACK_MOVE] });
    expect(await move(w, host, code, 1, BLACK_WIN[1]!)).toMatchObject({ status: 409, body: { code: "notYourTurn" } });
  });

  it("refuses a move that is not legal, and moves of the wrong shape", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    expect(await move(w, host, code, 0, [40, 32])).toMatchObject({ status: 422, body: { code: "illegal" } });
    expect((await move(w, host, code, 0, [40, 99])).status).toBe(400);
    expect((await move(w, host, code, 0, [40])).status).toBe(400);
    expect((await call(handleMakeMove, w, { as: host, body: { code, match: 1, ply: 0, move: FIRST_BLACK_MOVE, extra: true } })).status).toBe(400);
  });

  it("the same move sent twice is stored once; an old or a future ply is stale", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    expect((await move(w, host, code, 0, FIRST_BLACK_MOVE)).status).toBe(200);
    const again = await move(w, host, code, 0, FIRST_BLACK_MOVE);
    expect(again.status).toBe(200);
    expect(again.body.room!.match!.moveCount).toBe(1);
    // A different move replayed at an old ply, or the opponent claiming it.
    expect(await move(w, host, code, 0, encodeMove(getLegalMoves(initialBoard(), "black")[1]!))).toMatchObject({ status: 409, body: { code: "stale" } });
    expect(await move(w, guest, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 409, body: { code: "stale" } });
    expect(await move(w, guest, code, 5, BLACK_WIN[1]!)).toMatchObject({ status: 409, body: { code: "stale" } });
    expect(await move(w, guest, code, 1, BLACK_WIN[1]!, 2)).toMatchObject({ status: 409, body: { code: "stale" } });
  });

  it("a whole game: the board decides the winner, then no more moves", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    for (const [ply, encoded] of BLACK_WIN.entries()) {
      const result = await move(w, ply % 2 === 0 ? host : guest, code, ply, encoded);
      expect(result.status).toBe(200);
    }
    const end = (await state(w, guest, code)).body.room!;
    expect(end.status).toBe("finished");
    expect(end.match).toMatchObject({ winner: "black", reason: "board", moveCount: BLACK_WIN.length });
    expect(await move(w, guest, code, BLACK_WIN.length, [9, 18])).toMatchObject({ status: 409, body: { code: "gameOver" } });
  });

  it("a drawn game (D89): the server ends it with no winner, then no more moves", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    const drawn = drawnGame();
    for (const [ply, encoded] of drawn.moves.entries()) {
      const result = await move(w, ply % 2 === 0 ? host : guest, code, ply, encoded);
      expect(result.status).toBe(200);
    }
    const end = (await state(w, host, code)).body.room!;
    expect(end.status).toBe("finished");
    expect(end.match).toMatchObject({ winner: null, reason: drawn.reason, moveCount: drawn.moves.length });
    const next = drawn.moves.length % 2 === 0 ? host : guest;
    expect(await move(w, next, code, drawn.moves.length, [9, 18])).toMatchObject({ status: 409, body: { code: "gameOver" } });
    // A rematch works after a draw as after any game.
    await call(handleRematch, w, { as: host, body: { code, match: 1 } });
    expect((await call(handleRematch, w, { as: guest, body: { code, match: 1 } })).body.room!.match).toMatchObject({ number: 2, winner: null, reason: null });
  }, 20_000); // a whole game of about 100 moves, each replayed by the server
  it("the online replay refuses a move after the game was drawn", () => {
    const drawn = drawnGame();
    expect(replayMoves(drawn.moves)).toMatchObject({ drawn: drawn.reason, winner: null });
    expect(replayMoves([...drawn.moves, drawn.moves[drawn.moves.length - 2]!])).toBeNull();
  });

  it("sends only the moves the browser does not have yet", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    for (const [ply, encoded] of BLACK_WIN.slice(0, 4).entries()) await move(w, ply % 2 === 0 ? host : guest, code, ply, encoded);
    expect((await state(w, guest, code, { since: "3" })).body.room!.match).toMatchObject({ from: 3, moves: [BLACK_WIN[3]], moveCount: 4 });
    // After a reload the browser has nothing: everything comes back.
    expect((await state(w, guest, code)).body.room!.match!.moves).toEqual(BLACK_WIN.slice(0, 4));
    expect((await state(w, guest, code, { since: "-1" })).status).toBe(400);
  });
});

describe("presence, disconnects and the forfeit", () => {
  it("shows the opponent away while their tab is hidden, and offline after 12 seconds without a word", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    await state(w, guest, code, { away: "1" });
    expect((await state(w, host, code)).body.room!.opponent!.presence).toBe("away");
    later(w, AWAY_AFTER_MS + 1);
    const view = (await state(w, host, code)).body.room!;
    expect(view.opponent).toMatchObject({ presence: "offline", forfeitInMs: FORFEIT_AFTER_MS - 1 });
  });

  it("the game goes on when the player comes back within the countdown", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    await state(w, guest, code);
    later(w, AWAY_AFTER_MS + FORFEIT_AFTER_MS - 1000);
    expect((await state(w, host, code)).body.room!.status).toBe("playing");
    // Back (a reload): the whole game comes back and goes on.
    const back = (await state(w, guest, code)).body.room!;
    expect(back.status).toBe("playing");
    expect((await state(w, host, code)).body.room!.opponent).toMatchObject({ presence: "online", forfeitInMs: null });
  });

  it("after the countdown the player who stayed wins by forfeit", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    await state(w, guest, code);
    for (let waited = 0; waited <= AWAY_AFTER_MS + FORFEIT_AFTER_MS; waited += 5000) {
      later(w, 5000);
      await state(w, host, code);
    }
    const view = (await state(w, host, code)).body.room!;
    expect(view.status).toBe("finished");
    expect(view.match).toMatchObject({ winner: "black", reason: "forfeit" });
    // The one who left sees the same when they come back.
    expect((await state(w, guest, code)).body.room!.match).toMatchObject({ winner: "black", reason: "forfeit" });
  });
});

describe("resign, rematch and leave", () => {
  it("resigning gives the game to the opponent", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    const resigned = await call(handleResign, w, { as: guest, body: { code, match: 1 } });
    expect(resigned.body.room!.match).toMatchObject({ winner: "black", reason: "resign" });
    expect(await call(handleResign, w, { as: host, body: { code, match: 1 } })).toMatchObject({ status: 409, body: { code: "gameOver" } });
  });

  it("a rematch needs both players and swaps the colours", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    expect(await call(handleRematch, w, { as: host, body: { code, match: 1 } })).toMatchObject({ status: 409, body: { code: "gameOn" } });
    await call(handleResign, w, { as: guest, body: { code, match: 1 } });
    const asked = (await call(handleRematch, w, { as: host, body: { code, match: 1 } })).body.room!;
    expect(asked.rematch).toBe("you");
    expect((await state(w, guest, code)).body.room!.rematch).toBe("opponent");
    const accepted = (await call(handleRematch, w, { as: guest, body: { code, match: 1 } })).body.room!;
    expect(accepted).toMatchObject({ status: "ready", rematch: "none", you: { colour: "black" }, opponent: { colour: "white" } });
    expect(accepted.match).toMatchObject({ number: 2, moveCount: 0, startsInMs: READY_MS });
    // An old game's number is stale now.
    expect((await call(handleResign, w, { as: host, body: { code, match: 1 } })).status).toBe(409);
  });

  it("leaving during a game loses it, and closes the room", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    await call(handleLeaveRoom, w, { as: host, body: { code } });
    const view: RoomView = (await state(w, guest, code)).body.room!;
    expect(view).toMatchObject({ status: "closed", opponent: { left: true, presence: "offline" } });
    expect(view.match).toMatchObject({ winner: "white", reason: "left" });
    expect(await call(handleJoinRoom, w, { as: await player(w, "Late"), body: { code } })).toMatchObject({ status: 410, body: { code: "roomClosed" } });
    expect(await call(handleRematch, w, { as: guest, body: { code, match: 1 } })).toMatchObject({ status: 410 });
  });
});

describe("online games and the AI", () => {
  it("never touch the AI's record, the profile counts or the leaderboard", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    for (const [ply, encoded] of BLACK_WIN.entries()) await move(w, ply % 2 === 0 ? host : guest, code, ply, encoded);
    expect(await w.store.aiRecord()).toMatchObject({ games: 0, aiWins: 0, aiLosses: 0, resigned: 0 });
    for (const counts of await w.store.levelCounts(host.id)) expect(counts).toMatchObject({ wins: 0, losses: 0, games: 0 });
    expect((await w.store.rankedPage(4, null, 0, 10)).total).toBe(0);
  });
});
