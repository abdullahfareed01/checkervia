// The room functions with the one round steps of migration 10 (D153), on
// the in memory stores (oneRoundMemory.ts follows the SQL's rules; the SQL
// itself is tested in migration-10.test.ts): room-state in one database
// round, room-move in two, the same answers and stored rooms as without
// them, the earlier steps (D151) whenever the database does not have them,
// and every sign in check unchanged.
import { describe, expect, it } from "vitest";
import { handleCreateRoom } from "../../netlify/online/handlers/createRoom";
import { handleJoinRoom } from "../../netlify/online/handlers/joinRoom";
import { handleMakeMove } from "../../netlify/online/handlers/makeMove";
import { handleRoomState } from "../../netlify/online/handlers/roomState";
import { ROOM_LIMITS } from "../../netlify/online/http";
import { getLegalMoves, initialBoard } from "../../src/engine";
import { encodeMove } from "../../src/leaderboard/protocol";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import { AWAY_AFTER_MS, FORFEIT_AFTER_MS, READY_MS } from "../../src/online/protocol";
import { BLACK_WIN } from "../leaderboard/fixtures";
import { oneRoundMemory } from "./oneRoundMemory";
import { recordRounds } from "./roundRecorder";
import { call, later, player, world } from "./world";
import type { TestPlayer, World } from "./world";

const FIRST_BLACK_MOVE = encodeMove(getLegalMoves(initialBoard(), "black")[0]!);

function fastWorld(missing: { signIn?: boolean; save?: boolean } = {}): World {
  const w = world();
  w.deps = { ...w.deps, oneRound: oneRoundMemory(w, missing) };
  return w;
}

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

const state = (w: World, as: TestPlayer | null, code: string, extra: { device?: string | null; query?: Record<string, string> } = {}) =>
  call(handleRoomState, w, { as, query: { code, ...extra.query }, ...(extra.device !== undefined ? { device: extra.device } : {}) });
const move = (w: World, as: TestPlayer | null, code: string, ply: number, encoded: EncodedMove, extra: { device?: string | null } = {}) =>
  call(handleMakeMove, w, { as, body: { code, match: 1, ply, move: encoded }, ...extra });

describe("one round per request with migration 10 (D153)", () => {
  it("room-state: one round", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect((await state(w, host, code)).status).toBe(200);
    expect(db.rounds()).toEqual([["oneRound.signInWithRoom"]]);
  });

  it("room-move: two rounds, the sign of life with the sign in, the room's last use with the move", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    later(w, 4000);
    const db = recordRounds(w);
    expect((await move(w, host, code, 0, FIRST_BLACK_MOVE)).status).toBe(200);
    expect(db.rounds()).toEqual([["oneRound.signInWithRoom"], ["oneRound.saveMoveAndUse"]]);
    const stored = (await w.online.snapshot(code))!;
    expect(stored.match!.moves).toEqual([FIRST_BLACK_MOVE]);
    expect(stored.room.usedAt.getTime()).toBe(w.clock.time);
    expect(stored.members.find((m) => m.playerId === host.id)!.seenAt.getTime()).toBe(w.clock.time);
  });

  it("a refused move: one round, the sign of life stored, nothing else", async () => {
    const w = fastWorld();
    const { guest, code } = await startedRoom(w);
    later(w, 4000);
    const db = recordRounds(w);
    expect(await move(w, guest, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 409, body: { code: "notYourTurn" } });
    expect(db.rounds()).toEqual([["oneRound.signInWithRoom"]]);
    expect((await w.online.snapshot(code))!.members.find((m) => m.playerId === guest.id)!.seenAt.getTime()).toBe(w.clock.time);
  });

  it("gives the same answers and stores the same rooms as without it, through a whole game", async () => {
    const plain = world();
    const fast = fastWorld();
    const runs = await Promise.all([plain, fast].map(async (w) => {
      const answers: unknown[] = [];
      const { host, guest, code } = await startedRoom(w);
      const stranger = await player(w, "Stranger");
      answers.push((await state(w, stranger, code)).body);
      for (const [ply, encoded] of BLACK_WIN.entries()) {
        const mover = ply % 2 === 0 ? host : guest;
        const other = ply % 2 === 0 ? guest : host;
        later(w, 900);
        answers.push((await state(w, other, code, { query: { since: String(ply), ...(ply % 5 === 0 ? { away: "1" } : {}) } })).body);
        answers.push((await move(w, other, code, ply, encoded)).body); // not their turn
        answers.push((await move(w, mover, code, ply, encoded)).body);
        answers.push((await move(w, mover, code, ply, encoded)).body); // the same move again
      }
      answers.push((await state(w, host, code)).body);
      // The host's device differs between the two worlds (the test helper
      // numbers devices across worlds), so its keyed hash is left out.
      const stored = (await w.online.snapshot(code))!;
      return { answers, stored: { ...stored, room: { ...stored.room, deviceHash: "same" } } };
    }));
    expect(runs[1]!.answers).toEqual(runs[0]!.answers);
    expect(runs[1]!.stored).toEqual(runs[0]!.stored);
  });

  it("a forfeit that is due is settled as before", async () => {
    for (const w of [world(), fastWorld()]) {
      const { host, code } = await startedRoom(w);
      later(w, AWAY_AFTER_MS + FORFEIT_AFTER_MS + 1000);
      const end = (await state(w, host, code)).body.room!;
      expect(end.status).toBe("finished");
      expect(end.match).toMatchObject({ winner: "black", reason: "forfeit" });
    }
  });
});

describe("the earlier steps while the database does not have migration 10 (D153)", () => {
  it("neither function: the rounds of D151, and the same answers", async () => {
    const w = fastWorld({ signIn: true, save: true });
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect((await state(w, host, code)).status).toBe(200);
    expect(db.rounds().slice(1)).toEqual([["online.snapshot", "store.hitRateLimit", "store.hitRateLimit", "store.playerByTokenHash"], ["online.touchMember"]]);
    db.reset();
    expect((await move(w, host, code, 0, FIRST_BLACK_MOVE)).status).toBe(200);
    expect(db.rounds()).toEqual([
      ["oneRound.signInWithRoom"],
      ["online.snapshot", "store.hitRateLimit", "store.hitRateLimit", "store.playerByTokenHash"],
      ["oneRound.saveMoveAndUse"],
      ["online.saveMove"],
      ["online.touchMember", "online.touchRoom"],
    ]);
    expect((await w.online.snapshot(code))!.match!.moves).toEqual([FIRST_BLACK_MOVE]);
  });

  it("only the move function missing: the move is stored and the room used, in the earlier way", async () => {
    const w = fastWorld({ save: true });
    const { host, code } = await startedRoom(w);
    later(w, 2000);
    const db = recordRounds(w);
    expect((await move(w, host, code, 0, FIRST_BLACK_MOVE)).status).toBe(200);
    expect(db.rounds()).toEqual([["oneRound.signInWithRoom"], ["oneRound.saveMoveAndUse"], ["online.saveMove"], ["online.touchRoom"]]);
    const stored = (await w.online.snapshot(code))!;
    expect(stored.room.usedAt.getTime()).toBe(w.clock.time);
    expect(stored.members.find((m) => m.playerId === host.id)!.seenAt.getTime()).toBe(w.clock.time);
  });
});

describe("the sign in and the checks are unchanged with migration 10 (D153)", () => {
  it("a request without a valid device never reaches the database", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    const db = recordRounds(w);
    expect(await state(w, host, code, { device: "short" })).toMatchObject({ status: 400, body: { code: "invalid" } });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE, { device: null })).toMatchObject({ status: 400 });
    expect(db.names()).toEqual([]);
  });

  it("without a profile: 401, and nothing about the room is sent or stored", async () => {
    const w = fastWorld();
    const { code } = await startedRoom(w);
    const before = await w.online.snapshot(code);
    const anonymous = await state(w, null, code);
    expect(anonymous).toMatchObject({ status: 401, body: { code: "noProfile" } });
    expect(anonymous.body.room).toBeUndefined();
    expect(await move(w, null, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 401 });
    expect(await w.online.snapshot(code)).toEqual(before);
  });

  it("a hidden player is refused like an unknown one, and not touched", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    const before = await w.online.snapshot(code);
    w.store.hidePlayer(host.id);
    expect(await state(w, host, code)).toMatchObject({ status: 401, body: { code: "noProfile" } });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 401 });
    expect(await w.online.snapshot(code)).toEqual(before);
  });

  it("a stranger with a profile gets notMember and leaves no trace", async () => {
    const w = fastWorld();
    const { code } = await startedRoom(w);
    const stranger = await player(w, "Stranger");
    const before = await w.online.snapshot(code);
    expect(await state(w, stranger, code)).toMatchObject({ status: 403, body: { code: "notMember" } });
    expect(await move(w, stranger, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 403, body: { code: "notMember" } });
    expect(await w.online.snapshot(code)).toEqual(before);
    expect(await state(w, stranger, "ZZZZZZ")).toMatchObject({ status: 404, body: { code: "roomNotFound" } });
  });

  it("a bad code is 400 with a profile and 401 without, as before", async () => {
    const w = fastWorld();
    const { host } = await startedRoom(w);
    const db = recordRounds(w);
    expect(await state(w, host, "abc")).toMatchObject({ status: 400, body: { code: "invalid" } });
    expect(await state(w, null, "abc")).toMatchObject({ status: 401 });
    expect(db.names()).not.toContain("oneRound.signInWithRoom");
  });

  it("past the rate limit: 429, the move is not stored and the player is not touched", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    for (let i = 0; i < ROOM_LIMITS.move.perDevice; i++) await move(w, host, code, 5, FIRST_BLACK_MOVE);
    const seen = (await w.online.snapshot(code))!.members.find((m) => m.playerId === host.id)!.seenAt.getTime();
    later(w, 1000);
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 429, body: { code: "rateLimited" } });
    const stored = (await w.online.snapshot(code))!;
    expect(stored.match!.moves).toEqual([]);
    expect(stored.members.find((m) => m.playerId === host.id)!.seenAt.getTime()).toBe(seen);
  });

  it("an expired room is shown as expired and not touched", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    later(w, 24 * 3_600_000 + 1000);
    const before = await w.online.snapshot(code);
    expect((await state(w, host, code)).body.room!.status).toBe("expired");
    expect(await w.online.snapshot(code)).toEqual(before);
    expect(w.logs).toEqual([]);
  });

  it("a storage error is still the calm 503", async () => {
    const w = fastWorld();
    const { host, code } = await startedRoom(w);
    w.deps = { ...w.deps, oneRound: { ...w.deps.oneRound!, signInWithRoom: async () => { throw Object.assign(new Error("down"), { code: "PGRST000" }); } } };
    expect(await state(w, host, code)).toMatchObject({ status: 503 });
    expect(await move(w, host, code, 0, FIRST_BLACK_MOVE)).toMatchObject({ status: 503 });
  });
});
