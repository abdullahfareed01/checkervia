// Migration 6 (online rooms, D140 to D145) in PGlite, after migrations 1 to 4
// as in a live project, with Supabase's roles and default grants made
// first: the tables, their checks, what the public roles cannot do, the
// cascades, the cleanup, and the one step move store the adapter relies on.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(new URL(`../../docs/07-deployment/${name}`, import.meta.url), "utf8");

const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const TABLES = ["online_blocks", "online_emotes", "online_matches", "online_members", "online_reports", "online_rooms"];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  for (const name of ["leaderboard-migration.sql", "leaderboard-migration-2.sql", "leaderboard-migration-3.sql", "leaderboard-migration-4.sql", "leaderboard-migration-6.sql"]) {
    await db.exec(sql(name));
  }
}, 60_000);

async function inTransaction(run: () => Promise<void>): Promise<void> {
  await db.exec("begin");
  try {
    await run();
  } finally {
    await db.exec("rollback");
  }
}

async function errorOf(statement: string, params: unknown[] = []): Promise<string> {
  await db.exec("savepoint probe");
  try {
    await db.query(statement, params);
    return "no error";
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await db.exec("rollback to savepoint probe");
  }
}

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

async function player(username: string): Promise<string> {
  const id = uuid();
  await db.query("insert into players (id, username, username_key, token_hash, device_hash, ip_hash) values ($1, $2::text, lower($2::text), $3, 'd', 'i')", [id, username, `t ${id}`]);
  return id;
}

async function room(code: string, hostId: string, usedAt = "2026-11-18T12:00:00Z"): Promise<string> {
  const id = uuid();
  await db.query("insert into online_rooms (id, code, host_id, device_hash, created_at, used_at) values ($1, $2, $3, 'dev', $4, $4)", [id, code, hostId, usedAt]);
  await db.query("insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 0, 'Host', $3)", [id, hostId, usedAt]);
  return id;
}

const count = async (table: string, where = "true", params: unknown[] = []) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params)).rows[0]!.n);

describe("migration 6", () => {
  it("makes the six tables with Row Level Security on", async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'online%' order by relname",
    );
    expect(tables.rows).toEqual(TABLES.map((relname) => ({ relname, relrowsecurity: true })));
  });

  it.each(["anon", "authenticated"])("%s can read and write no room table and call no function", (role) =>
    inTransaction(async () => {
      await db.exec(`set local role ${role}`);
      for (const table of TABLES) {
        expect(await errorOf(`select * from ${table}`)).toMatch(/permission denied/);
        expect(await errorOf(`delete from ${table}`)).toMatch(/permission denied/);
      }
      expect(await errorOf("select online_cleanup(now(), now())")).toMatch(/permission denied/);
    }),
  );

  it("the service role can use everything", () =>
    inTransaction(async () => {
      await db.exec("set local role service_role");
      for (const table of TABLES) expect(await errorOf(`select * from ${table}`)).toBe("no error");
      expect(await errorOf("select online_cleanup(now(), now())")).toBe("no error");
    }),
  );

  it("cannot be run twice", () =>
    inTransaction(async () => {
      const second = await db.exec(sql("leaderboard-migration-6.sql")).then(
        () => "no error",
        (error: Error) => error.message,
      );
      expect(second).toMatch(/already exists/);
    }),
  );
});

describe("the checks", () => {
  it("room codes: six characters without I, L, O, 0 or 1, each code once", () =>
    inTransaction(async () => {
      const host = await player("Host1");
      await room("ABCDEF", host);
      for (const bad of ["ABCDE0", "abcdef", "ABCDEI", "ABCDEFG", "ABCDL2"]) {
        expect(await errorOf("insert into online_rooms (code, host_id, device_hash, created_at, used_at) values ($1, $2, 'd', now(), now())", [bad, host])).toMatch(/check constraint/);
      }
      expect(await errorOf("insert into online_rooms (code, host_id, device_hash, created_at, used_at) values ('ABCDEF', $1, 'd', now(), now())", [host])).toMatch(/duplicate key/);
    }),
  );

  it("a room has one host seat and one friend seat", () =>
    inTransaction(async () => {
      const [host, friend, third] = [await player("Host2"), await player("Friend2"), await player("Third2")];
      const id = await room("BCDEFG", host);
      await db.query("insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 1, 'Friend', now())", [id, friend]);
      expect(await errorOf("insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 1, 'Third', now())", [id, third])).toMatch(/duplicate key/);
      expect(await errorOf("insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 2, 'Third', now())", [id, third])).toMatch(/check constraint/);
      expect(await errorOf("insert into online_members (room_id, player_id, seat, username, country, seen_at) values ($1, $2, 1, 'X', 'pk', now())", [id, third])).toMatch(/check constraint/);
    }),
  );

  it("games: two different players, one number each, the move count kept with the moves, an end reason with every end", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host3"), await player("Friend3")];
      const id = await room("CDEFGH", host);
      const insert = "insert into online_matches (room_id, number, black_id, white_id, starts_at, moves, move_count, finished, reason) values ($1, $2, $3, $4, now(), $5, $6, $7, $8)";
      expect(await errorOf(insert, [id, 1, host, friend, "[]", 0, false, null])).toBe("no error");
      await db.query(insert, [id, 1, host, friend, "[]", 0, false, null]);
      expect(await errorOf(insert, [id, 1, friend, host, "[]", 0, false, null])).toMatch(/duplicate key/);
      expect(await errorOf(insert, [id, 2, host, host, "[]", 0, false, null])).toMatch(/check constraint/);
      expect(await errorOf(insert, [id, 3, host, friend, "[[40,33]]", 0, false, null])).toMatch(/check constraint/);
      expect(await errorOf(insert, [id, 4, host, friend, "[]", 0, true, null])).toMatch(/check constraint/);
      expect(await errorOf(insert, [id, 5, host, friend, "[]", 0, true, "draw"])).toMatch(/check constraint/);
      // Not a list: refused before the checks even finish.
      expect(await errorOf(insert, [id, 6, host, friend, "{}", 0, false, null])).toMatch(/check constraint|non-array/);
    }),
  );

  it("emotes from the fixed list's shape, reports with a known reason, no blocking yourself", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host4"), await player("Friend4")];
      const id = await room("DEFGHJ", host);
      expect(await errorOf("insert into online_emotes (room_id, player_id, emote, created_at) values ($1, $2, 'gg', now())", [id, host])).toBe("no error");
      expect(await errorOf("insert into online_emotes (room_id, player_id, emote, created_at) values ($1, $2, 'Hello there!', now())", [id, host])).toMatch(/check constraint/);
      const report = "insert into online_reports (reporter_id, reported_id, room_code, reason, created_at) values ($1, $2, 'DEFGHJ', $3, now())";
      expect(await errorOf(report, [host, friend, "spam"])).toBe("no error");
      await db.query(report, [host, friend, "spam"]);
      expect(await errorOf(report, [host, friend, "stalling"])).toMatch(/duplicate key/);
      expect(await errorOf(report, [friend, host, "insult"])).toMatch(/check constraint/);
      expect(await errorOf(report, [host, host, "spam"])).toMatch(/check constraint/);
      expect(await errorOf("insert into online_blocks (blocker_id, blocked_id, created_at) values ($1, $1, now())", [host])).toMatch(/check constraint/);
    }),
  );
});

describe("the move store the adapter uses", () => {
  it("stores a move only on top of the move count it expects, and never after the end", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host5"), await player("Friend5")];
      const id = await room("EFGHJK", host);
      const match = uuid();
      await db.query("insert into online_matches (id, room_id, number, black_id, white_id, starts_at) values ($1, $2, 1, $3, $4, now())", [match, id, host, friend]);
      const save = (moves: string, size: number, expected: number) =>
        db.query("update online_matches set moves = $1, move_count = $2 where id = $3 and move_count = $4 and finished = false returning id", [moves, size, match, expected]);
      expect((await save("[[40,33]]", 1, 0)).rows).toHaveLength(1);
      // A second request that read the same game: nothing changes.
      expect((await save("[[42,33]]", 1, 0)).rows).toHaveLength(0);
      await db.query("update online_matches set finished = true, reason = 'resign', winner_id = $2 where id = $1", [match, friend]);
      expect((await save("[[40,33],[17,24]]", 2, 1)).rows).toHaveLength(0);
    }),
  );
});

describe("deleting", () => {
  it("a room takes its players, games and reactions with it", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host6"), await player("Friend6")];
      const id = await room("FGHJKM", host);
      await db.query("insert into online_members (room_id, player_id, seat, username, seen_at) values ($1, $2, 1, 'F', now())", [id, friend]);
      await db.query("insert into online_matches (room_id, number, black_id, white_id, starts_at) values ($1, 1, $2, $3, now())", [id, host, friend]);
      await db.query("insert into online_emotes (room_id, player_id, emote, created_at) values ($1, $2, 'gg', now())", [id, host]);
      await db.query("delete from online_rooms where id = $1", [id]);
      for (const table of ["online_members", "online_matches", "online_emotes"]) expect(await count(table, "room_id = $1", [id])).toBe(0);
    }),
  );

  it("online_cleanup deletes rooms unused since the cut off and old reports, and keeps the rest", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host7"), await player("Friend7")];
      const old = await room("GHJKMN", host, "2026-10-01T00:00:00Z");
      const fresh = await room("HJKMNP", host, "2026-11-17T00:00:00Z");
      // Old by its last action, but a player was seen in it lately.
      const seen = await room("JKMNPQ", host, "2026-10-01T00:00:00Z");
      await db.query("update online_members set seen_at = '2026-11-16T00:00:00Z' where room_id = $1", [seen]);
      await db.query("insert into online_reports (reporter_id, reported_id, room_code, reason, created_at) values ($1, $2, 'GHJKMN', 'spam', '2026-01-01'), ($2, $1, 'GHJKMN', 'name', '2026-11-01')", [host, friend]);
      await db.query("select online_cleanup('2026-10-19T00:00:00Z', '2026-05-22T00:00:00Z')");
      expect(await count("online_rooms", "id = $1", [old])).toBe(0);
      expect(await count("online_members", "room_id = $1", [old])).toBe(0);
      expect(await count("online_rooms", "id = any($1)", [[fresh, seen]])).toBe(2);
      expect(await count("online_reports")).toBe(1);
    }),
  );

  it("a removed player takes their rooms, seats and blocks with them", () =>
    inTransaction(async () => {
      const [host, friend] = [await player("Host8"), await player("Friend8")];
      await room("KMNPQR", host);
      await db.query("insert into online_blocks (blocker_id, blocked_id, created_at) values ($1, $2, now())", [friend, host]);
      await db.query("delete from players where id = $1", [host]);
      expect(await count("online_rooms", "host_id = $1", [host])).toBe(0);
      expect(await count("online_blocks", "blocked_id = $1", [host])).toBe(0);
    }),
  );
});
