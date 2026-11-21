// The database rounds of the room functions (D151): room-state in two
// rounds (the sign in checks with the room read, then the sign of life) and
// room-move in three (the same first round, the move, then both signs of
// life together), with the move's answer built without reading the room
// again. A round is a set of store calls that overlap in time; each call
// here takes a few real milliseconds, as a trip to the database would. The
// sign in, the limits and every check answer as before.
import { describe, expect, it } from "vitest";
import { handleCreateRoom } from "../../netlify/online/handlers/createRoom";
import { handleJoinRoom } from "../../netlify/online/handlers/joinRoom";
import { handleMakeMove } from "../../netlify/online/handlers/makeMove";
import { handleRoomState } from "../../netlify/online/handlers/roomState";
import { ROOM_LIMITS } from "../../netlify/online/http";
import { roomView } from "../../netlify/online/rules";
import { getLegalMoves, initialBoard } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import { READY_MS } from "../../src/online/protocol";
import { BLACK_WIN } from "../leaderboard/fixtures";
import { recordRounds } from "./roundRecorder";
import { call, later, player, world } from "./world";
import type { TestPlayer, World } from "./world";

const FIRST_BLACK_MOVE = encodeMove(getLegalMoves(initialBoard(), "black")[0]!);

async function startedRoom(w: World) {
  const host = await player(w, "Hosty");
  const guest = await player(w, "Guesty", { country: "GB", avatar: "a12" });
  const created = await call(handleCreateRoom, w, { as: host, body: {} });
  const code = created.body.room!.code;
  w.coin.byte = 0; // the host plays Black
  expect((await call(handleJoinRoom, w, { as: guest, body: { code } })).status).toBe(200);
  later(w, READY_MS);
  return { host, guest, code };
}

const state = (w: World, as: TestPlayer | null, code: unknown, extra: { device?: string | null } = {}) =>
  call(handleRoomState, w, { as, query: { code: String(code) }, ...extra });
const move = (w: World, as: TestPlayer | null, code: string, ply: number, encoded: EncodedMove, extra: { device?: string | null } = {}) =>
  call(handleMakeMove, w, { as, body: { code, match: 1, ply, move: encoded }, ...extra });

const SIGN_IN_AND_ROOM = ["online.snapshot", "store.hitRateLimit", "store.hitRateLimit", "store.playerByTokenHash"];

describe("database rounds (D151)", () => {
  it("room-state: two rounds, the room read with the sign in checks, then the sign of life", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect((await state(w, host, code)).status).toBe(200);
    expect(db.rounds()).toEqual([SIGN_IN_AND_ROOM, ["online.touchMember"]]);
  });

  it("room-move: three rounds, the move alone, then both signs of life together, and no second read", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect((await move(w, host, code, 0, FIRST_BLACK_MOVE)).status).toBe(200);
    expect(db.rounds()).toEqual([SIGN_IN_AND_ROOM, ["online.saveMove"], ["online.touchMember", "online.touchRoom"]]);
    expect(db.names().filter((name) => name === "online.snapshot")).toHaveLength(1);
  });

  it("a refused move still stores the sign of life, in two rounds, and nothing else", async () => {
    const w = world();
    const { guest, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect(await move(w, guest, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 409, body: { code: "notYourTurn" } });
    expect(db.rounds()).toEqual([SIGN_IN_AND_ROOM, ["online.touchMember"]]);
  });

  it("a retried move is answered from the room as read, in two rounds", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    const first = await move(w, host, code, 0, FIRST_BLACK_MOVE);
    const db = recordRounds(w);
    const again = await move(w, host, code, 0, FIRST_BLACK_MOVE);
    expect(again.status).toBe(200);
    expect(again.body.room!.match).toEqual(first.body.room!.match);
    expect(db.rounds()).toEqual([SIGN_IN_AND_ROOM, ["online.touchMember"]]);
  });

  it("each move's answer is what reading the room again gives, through a whole game to its end", async () => {
    const w = world();
    const { host, guest, code } = await startedRoom(w);
    for (const [ply, encoded] of BLACK_WIN.entries()) {
      const mover = ply % 2 === 0 ? host : guest;
      later(w, 700);
      const answer = await move(w, mover, code, ply, encoded);
      expect(answer.status).toBe(200);
      const stored = (await w.online.snapshot(code))!;
      expect(answer.body.room).toEqual(roomView(stored, mover.id, new Date(w.clock.time), ply));
    }
    expect((await state(w, guest, code)).body.room!.match).toMatchObject({ winner: "black", reason: "board" });
  });

  it("the move and both signs of life are stored", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    later(w, 5000);
    await move(w, host, code, 0, FIRST_BLACK_MOVE);
    const stored = (await w.online.snapshot(code))!;
    expect(stored.match!.moves).toEqual([FIRST_BLACK_MOVE]);
    expect(stored.room.usedAt.getTime()).toBe(w.clock.time);
    expect(stored.members.find((m) => m.playerId === host.id)!.seenAt.getTime()).toBe(w.clock.time);
  });
});

describe("the sign in and the checks are unchanged (D151)", () => {
  it("a request without a valid device touches no store at all", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect(await state(w, host, code, { device: "short" })).toMatchObject({ status: 400, body: { code: "invalid" } });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE, { device: null })).toMatchObject({ status: 400 });
    expect(db.names()).toEqual([]);
  });

  it("without a profile: 401, before the code is looked at; nothing about the room is stored or sent", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    const before = (await w.online.snapshot(code))!;
    const db = recordRounds(w);
    const anonymous = await state(w, null, code);
    expect(anonymous).toMatchObject({ status: 401, body: { code: "noProfile" } });
    expect(anonymous.body.room).toBeUndefined();
    expect(await state(w, null, "not a code")).toMatchObject({ status: 401 });
    expect(await move(w, null, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 401 });
    expect(db.names().filter((name) => !["online.snapshot", "store.hitRateLimit", "store.playerByTokenHash"].includes(name))).toEqual([]);
    expect(await w.online.snapshot(code)).toEqual(before);
    expect((await state(w, host, code)).body.room!.match!.moveCount).toBe(0);
  });

  it("a bad code with a profile is still 400, with no room read", async () => {
    const w = world();
    const { host } = await startedRoom(w);
    const db = recordRounds(w);
    expect(await state(w, host, "abc")).toMatchObject({ status: 400, body: { code: "invalid" } });
    expect(db.names()).not.toContain("online.snapshot");
  });

  it("a stranger with a profile gets notMember and leaves no trace", async () => {
    const w = world();
    const { code } = await startedRoom(w);
    const stranger = await player(w, "Stranger");
    const before = (await w.online.snapshot(code))!;
    const db = recordRounds(w);
    expect(await state(w, stranger, code)).toMatchObject({ status: 403, body: { code: "notMember" } });
    expect(await move(w, stranger, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 403, body: { code: "notMember" } });
    expect(db.names()).not.toContain("online.touchMember");
    expect(db.names()).not.toContain("online.saveMove");
    expect(await w.online.snapshot(code)).toEqual(before);
    expect(await state(w, stranger, "ZZZZZZ")).toMatchObject({ status: 404, body: { code: "roomNotFound" } });
  });

  it("the rate limit still comes first: past it, even a member's valid move is refused and not stored", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    for (let i = 0; i < ROOM_LIMITS.move.perDevice; i++) await move(w, host, code, 5, FIRST_BLACK_MOVE);
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 429, body: { code: "rateLimited" } });
    expect((await w.online.snapshot(code))!.match!.moves).toEqual([]);
  });

  it("an expired room is shown as expired and its members are not touched", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    later(w, 24 * 3_600_000 + 1000);
    const db = recordRounds(w);
    expect((await state(w, host, code)).body.room!.status).toBe("expired");
    expect(db.names()).not.toContain("online.touchMember");
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 410, body: { code: "roomExpired" } });
  });

  it("a storage error in the room read is still the calm 503", async () => {
    const w = world();
    const { host, code } = await startedRoom(w);
    w.deps = { ...w.deps, online: { ...w.deps.online, snapshot: async () => { throw Object.assign(new Error("down"), { code: "PGRST000" }); } } };
    expect(await state(w, host, code)).toMatchObject({ status: 503 });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 503 });
    expect(await state(w, null, code)).toMatchObject({ status: 401 });
  });
});
