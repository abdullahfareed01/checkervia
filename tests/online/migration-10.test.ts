// Migration 10 (D153) in PGlite, after migrations 1 to 4 and the rooms
// migration, as in a live project, through the real adapter
// (createSupabaseOneRound) with a fake HTTP layer that runs each RPC as
// PostgREST would: functions only, no rights for the public roles, the rate
// limit counters, the player by token (with and without the saved progress
// table), the room as read, the sign of life only when allowed, the move
// stored with the room's last use, and the fallback when the functions are
// missing.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "../../netlify/leaderboard/security";
import { createSupabaseOneRound, MISSING_RETRY_MS } from "../../netlify/online/supabaseStore";
import type { RoomSignIn } from "../../netlify/online/store";

const sql = (name: string) => readFileSync(new URL(`../../docs/07-deployment/${name}`, import.meta.url), "utf8");
const MIGRATION = sql("rooms-migration-10.sql");

const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;
const EARLIER = ["leaderboard-migration.sql", "leaderboard-migration-2.sql", "leaderboard-migration-3.sql", "leaderboard-migration-4.sql", "leaderboard-migration-6.sql"];

async function database(withMigration10: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  for (const name of EARLIER) await db.exec(sql(name));
  if (withMigration10) await db.exec(MIGRATION);
  return db;
}

/** PostgREST's RPC on PGlite: POST /rest/v1/rpc/<name> with named arguments. */
function rpcOver(db: PGlite) {
  const requests: { name: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const name = url.pathname.replace("/rest/v1/rpc/", "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ name, body });
    const keys = Object.keys(body);
    const values = keys.map((key) => (key === "p_moves" ? JSON.stringify(body[key]) : body[key]));
    try {
      const result = await db.query<{ result: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as result`, values);
      return new Response(JSON.stringify(result.rows[0]!.result), { status: 200, headers: { "content-type": "application/json" } });
    } catch (error) {
      const code = (error as { code?: string }).code ?? "XX000";
      const missing = code === "42883";
      return new Response(JSON.stringify({ code: missing ? "PGRST202" : code, message: "error" }), { status: missing ? 404 : 400, headers: { "content-type": "application/json" } });
    }
  }) as typeof fetch;
  return { requests, fetchImpl };
}

const NOW = new Date("2026-11-21T10:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

let db: PGlite;
let ids: { host: string; guest: string; stranger: string; hidden: string; room: string; match: string };
const TOKENS = { host: "host-token", guest: "guest-token", stranger: "stranger-token", hidden: "hidden-token" };

async function addPlayer(name: string, token: string, hidden = false): Promise<string> {
  const row = await db.query<{ id: string }>(
    `insert into players (username, username_key, token_hash, device_hash, ip_hash, hidden) values ($1, lower($1), $2, 'd', 'i', $3) returning id`,
    [name, await sha256Hex(token), hidden],
  );
  return row.rows[0]!.id;
}

beforeAll(async () => {
  db = await database(true);
  const host = await addPlayer("Hosty", TOKENS.host);
  const guest = await addPlayer("Guesty", TOKENS.guest);
  const stranger = await addPlayer("Stranger", TOKENS.stranger);
  const hidden = await addPlayer("Hidden", TOKENS.hidden, true);
  const room = (await db.query<{ id: string }>(`insert into online_rooms (code, host_id, device_hash, created_at, used_at) values ('ABCDEF', $1, 'dev', $2, $2) returning id`, [host, minutes(-10)])).rows[0]!.id;
  await db.query(`insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 1, 'Guesty', $3), ($1, $4, 0, 'Hosty', $3)`, [room, guest, minutes(-1), host]);
  await db.query(`insert into online_matches (room_id, number, black_id, white_id, starts_at, finished, winner_id, reason) values ($1, 1, $2, $3, $4, true, $2, 'resign')`, [room, host, guest, minutes(-9)]);
  const match = (await db.query<{ id: string }>(`insert into online_matches (room_id, number, black_id, white_id, starts_at) values ($1, 2, $3, $2, $4) returning id`, [room, host, guest, minutes(-5)])).rows[0]!.id;
  ids = { host, guest, stranger, hidden, room, match };
}, 60_000);

async function inTransaction(run: () => Promise<void>): Promise<void> {
  await db.exec("begin");
  try {
    await run();
  } finally {
    await db.exec("rollback");
  }
}

const signIn = async (token: string | null, change: Partial<RoomSignIn> = {}): Promise<RoomSignIn> => ({
  code: "ABCDEF",
  tokenHash: token === null ? null : await sha256Hex(token),
  counters: [
    { key: `room:roomState:ip:${Math.random()}`, limit: 400 },
    { key: `room:roomState:device:${Math.random()}`, limit: 150 },
  ],
  windowSeconds: 60,
  now: NOW,
  away: false,
  idleHours: 24,
  ...change,
});

const seenAt = async (playerId: string) =>
  (await db.query<{ seen_at: Date; away: boolean }>(`select seen_at, away from online_members where room_id = $1 and player_id = $2`, [ids.room, playerId])).rows[0];

describe("migration 10: what it is", () => {
  it("creates or replaces two functions and changes no table, column, index, policy or data", () => {
    const outside = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, "").replace(/--.*$/gm, "");
    expect(outside.match(/create or replace function public\.\w+/g)).toEqual(["create or replace function public.online_room_poll", "create or replace function public.online_save_move"]);
    expect(outside).not.toMatch(/\b(create|alter|drop)\s+(table|index|policy|view|trigger|type|schema|extension)\b/i);
    expect(outside).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("can be run again", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it("only the service role may call the functions", async () => {
    for (const fn of ["online_room_poll(text, text, text[], integer[], integer, timestamptz, boolean, integer)", "online_save_move(uuid, uuid, integer, jsonb, boolean, uuid, text, timestamptz)"]) {
      const rights = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
        `select has_function_privilege('anon', 'public.${fn}', 'execute') as anon, has_function_privilege('authenticated', 'public.${fn}', 'execute') as authenticated, has_function_privilege('service_role', 'public.${fn}', 'execute') as service`,
      );
      expect(rights.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});

describe("online_room_poll through the adapter", () => {
  it("answers the member's player, the room with its players by seat and only the latest game, and stores the sign of life", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      const answer = (await store.signInWithRoom(await signIn(TOKENS.host, { away: true })))!;
      expect(answer.counters).toEqual([{ allowed: true, retryAfterSeconds: expect.any(Number) }, { allowed: true, retryAfterSeconds: expect.any(Number) }]);
      expect(answer.player).toMatchObject({ id: ids.host, username: "Hosty", usernameKey: "hosty", hidden: false, usernameChangedAt: null });
      expect(answer.room!.room).toMatchObject({ id: ids.room, code: "ABCDEF", hostId: ids.host, closedAt: null, rematchBy: null });
      expect(answer.room!.room.usedAt).toEqual(minutes(-10));
      expect(answer.room!.members.map((m) => [m.seat, m.username])).toEqual([[0, "Hosty"], [1, "Guesty"]]);
      // As read, before the sign of life.
      expect(answer.room!.members[0]!.seenAt).toEqual(minutes(-1));
      expect(answer.room!.match).toMatchObject({ id: ids.match, number: 2, blackId: ids.guest, whiteId: ids.host, moves: [], finished: false, winnerId: null, reason: null });
      expect(answer.touched).toBe(true);
      expect(await seenAt(ids.host)).toEqual({ seen_at: NOW, away: true });
    });
  });

  it("counts every counter and says when one is used up; then nothing is stored", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      const counters = [{ key: "room:roomState:ip:same", limit: 5 }, { key: "room:roomState:device:same", limit: 2 }];
      const answers = [];
      for (let i = 0; i < 3; i++) answers.push((await store.signInWithRoom(await signIn(TOKENS.guest, { counters })))!);
      expect(answers.map((a) => a.counters.map((c) => c.allowed))).toEqual([[true, true], [true, true], [true, false]]);
      expect(answers.map((a) => a.touched)).toEqual([true, true, false]);
      const hits = await db.query<{ key: string; hits: number }>(`select key, hits from rate_limits where key like 'room:roomState:%:same' order by key`);
      expect(hits.rows).toEqual([{ key: "room:roomState:device:same", hits: 3 }, { key: "room:roomState:ip:same", hits: 3 }]);
      expect((await seenAt(ids.guest))!.seen_at).toEqual(NOW);
    });
  });

  it("no token, an unknown token, a hidden player or a stranger: nothing is stored", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      const none = (await store.signInWithRoom(await signIn(null)))!;
      expect(none.player).toBeNull();
      expect((await store.signInWithRoom(await signIn("nobody's token")))!.player).toBeNull();
      const hidden = (await store.signInWithRoom(await signIn(TOKENS.hidden)))!;
      expect(hidden.player).toMatchObject({ id: ids.hidden, hidden: true });
      const stranger = (await store.signInWithRoom(await signIn(TOKENS.stranger)))!;
      expect(stranger.player!.id).toBe(ids.stranger);
      expect([none, hidden, stranger].map((a) => a.touched)).toEqual([false, false, false]);
      expect((await seenAt(ids.host))!.seen_at).toEqual(minutes(-1));
      expect((await seenAt(ids.guest))!.seen_at).toEqual(minutes(-1));
    });
  });

  it("an unknown code: no room and nothing stored; a closed room is still a sign of life, as before", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      expect(await store.signInWithRoom(await signIn(TOKENS.host, { code: "ZZZZZZ" }))).toMatchObject({ room: null, touched: false });
      await db.query(`update online_rooms set closed_at = $1 where id = $2`, [minutes(-2), ids.room]);
      expect((await store.signInWithRoom(await signIn(TOKENS.host)))!.touched).toBe(true);
    });
  });

  it("an expired room (no use, presence included, for the idle hours) is not touched", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      const later = new Date(minutes(-1).getTime() + 24 * 3_600_000 + 1000);
      expect((await store.signInWithRoom(await signIn(TOKENS.host, { now: later })))!.touched).toBe(false);
      // Exactly at the limit it has not expired yet (roomStatus counts it the same way).
      const edge = new Date(minutes(-1).getTime() + 24 * 3_600_000);
      expect((await store.signInWithRoom(await signIn(TOKENS.host, { now: edge })))!.touched).toBe(true);
    });
  });

  it("finds a key from a login on another device when the saved progress table exists, and works without it", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      expect((await store.signInWithRoom(await signIn("second-device-token")))!.player).toBeNull();
      await db.exec(`create table public.player_tokens (token_hash text primary key, player_id uuid not null references public.players (id) on delete cascade, device_hash text not null, created_at timestamptz not null default now())`);
      await db.query(`insert into player_tokens (token_hash, player_id, device_hash) values ($1, $2, 'd2')`, [await sha256Hex("second-device-token"), ids.guest]);
      const answer = (await store.signInWithRoom(await signIn("second-device-token")))!;
      expect(answer.player!.id).toBe(ids.guest);
      expect(answer.touched).toBe(true);
    });
  });
});

describe("online_save_move through the adapter", () => {
  const move = [[40, 33]];
  it("stores the move and the room's last use together", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      expect(await store.saveMoveAndUse(ids.match, ids.room, 0, move, null, NOW)).toBe("saved");
      const game = (await db.query<{ moves: unknown; move_count: number; finished: boolean }>(`select moves, move_count, finished from online_matches where id = $1`, [ids.match])).rows[0];
      expect(game).toEqual({ moves: move, move_count: 1, finished: false });
      expect((await db.query<{ used_at: Date }>(`select used_at from online_rooms where id = $1`, [ids.room])).rows[0]!.used_at).toEqual(NOW);
    });
  });

  it("refuses a game that moved on, a finished game or another room's game, and then leaves the room as it was", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      expect(await store.saveMoveAndUse(ids.match, ids.room, 3, move, null, NOW)).toBe("conflict");
      const other = (await db.query<{ id: string }>(`insert into online_rooms (code, host_id, device_hash, created_at, used_at) values ('BCDEFG', $1, 'dev', $2, $2) returning id`, [ids.host, minutes(-3)])).rows[0]!.id;
      expect(await store.saveMoveAndUse(ids.match, other, 0, move, null, NOW)).toBe("conflict");
      const finished = (await db.query<{ id: string }>(`select id from online_matches where room_id = $1 and number = 1`, [ids.room])).rows[0]!.id;
      expect(await store.saveMoveAndUse(finished, ids.room, 0, move, null, NOW)).toBe("conflict");
      expect((await db.query<{ used_at: Date }>(`select used_at from online_rooms where id = $1`, [ids.room])).rows[0]!.used_at).toEqual(minutes(-10));
      expect((await db.query<{ move_count: number }>(`select move_count from online_matches where id = $1`, [ids.match])).rows[0]!.move_count).toBe(0);
    });
  });

  it("a finishing move stores the result", async () => {
    await inTransaction(async () => {
      const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpcOver(db).fetchImpl);
      expect(await store.saveMoveAndUse(ids.match, ids.room, 0, move, { winnerId: ids.guest, reason: "board" }, NOW)).toBe("saved");
      const game = (await db.query(`select finished, winner_id, reason, finished_at from online_matches where id = $1`, [ids.match])).rows[0];
      expect(game).toEqual({ finished: true, winner_id: ids.guest, reason: "board", finished_at: NOW });
      // A draw has no winner.
      await db.query(`update online_matches set finished = false, winner_id = null, reason = null, finished_at = null, move_count = 0, moves = '[]' where id = $1`, [ids.match]);
      expect(await store.saveMoveAndUse(ids.match, ids.room, 0, move, { winnerId: null, reason: "repetition" }, NOW)).toBe("saved");
      expect((await db.query(`select finished, winner_id, reason from online_matches where id = $1`, [ids.match])).rows[0]).toEqual({ finished: true, winner_id: null, reason: "repetition" });
    });
  });
});

describe("before migration 10 is run", () => {
  it("both steps answer null, so the functions use their earlier steps, and the database is not asked again for a while", async () => {
    const plain = await database(false);
    const rpc = rpcOver(plain);
    let clock = NOW.getTime();
    const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", rpc.fetchImpl, () => clock);
    expect(await store.signInWithRoom(await signIn(TOKENS.host))).toBeNull();
    expect(await store.saveMoveAndUse(ids.match, ids.room, 0, [[40, 33]], null, NOW)).toBeNull();
    expect(rpc.requests.map((r) => r.name)).toEqual(["online_room_poll", "online_save_move"]);
    expect(await store.signInWithRoom(await signIn(TOKENS.host))).toBeNull();
    expect(rpc.requests).toHaveLength(2);
    // Run now: after the wait it is asked again and used.
    await plain.exec(MIGRATION);
    clock += MISSING_RETRY_MS + 1;
    expect(await store.signInWithRoom(await signIn(TOKENS.host, { code: "ZZZZZZ" }))).toMatchObject({ room: null, touched: false, player: null });
    expect(rpc.requests).toHaveLength(3);
    await plain.close();
  }, 60_000);

  it("the read only check in migrations-run-order.md answers false before and true after", async () => {
    const doc = readFileSync(new URL("../../docs/07-deployment/migrations-run-order.md", import.meta.url), "utf8");
    const row = doc.split("\n").find((line) => line.startsWith("| 12 | `rooms-migration-10.sql`"))!;
    const check = [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]!).pop()!;
    expect(check).toMatch(/^select .* as applied/);
    const plain = await database(false);
    expect((await plain.query<{ applied: boolean }>(check)).rows[0]!.applied).toBe(false);
    await plain.exec(MIGRATION);
    expect((await plain.query<{ applied: boolean }>(check)).rows[0]!.applied).toBe(true);
    await plain.close();
  }, 60_000);

  it("other database errors are not taken for a missing function", async () => {
    const broken = (async () => new Response(JSON.stringify({ code: "57014", message: "canceling statement" }), { status: 500, headers: { "content-type": "application/json" } })) as typeof fetch;
    const store = createSupabaseOneRound("https://example.supabase.co", "sb_secret_test", broken);
    await expect(store.signInWithRoom(await signIn(TOKENS.host))).rejects.toMatchObject({ code: "57014" });
    await expect(store.saveMoveAndUse(ids.match, ids.room, 0, [], null, NOW)).rejects.toMatchObject({ code: "57014" });
  });
});
