// The SQL migration, run in PGlite (Postgres compiled to WebAssembly, in
// process). Supabase's roles and default grants are recreated first, so the
// test also proves that the migration takes every right away from the
// public roles. The ranking function must order exactly as ranking.ts does.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { rankPlayers } from "../../src/leaderboard/ranking";

const migration = readFileSync(new URL("../../docs/07-deployment/leaderboard-migration.sql", import.meta.url), "utf8");

// What a new Supabase project already has: three API roles, the service
// role bypassing Row Level Security, and default grants on new tables and
// functions for all three (which the migration must take back from two).
const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  await db.exec(migration);
}, 60_000);

// Each test works in a transaction that is rolled back, so tests stay apart.
async function inTransaction(run: () => Promise<void>): Promise<void> {
  await db.exec("begin");
  try {
    await run();
  } finally {
    await db.exec("rollback");
  }
}

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

async function player(username: string, options: { hidden?: boolean; id?: string } = {}): Promise<string> {
  const id = options.id ?? uuid();
  await db.query(
    "insert into players (id, username, username_key, token_hash, device_hash, ip_hash, hidden) values ($1, $2::text, lower($2::text), $3, 'd', 'i', $4)",
    [id, username, `token ${id}`, options.hidden ?? false],
  );
  return id;
}

async function win(playerId: string, level: number, moveCount: number, createdAt: string, hidden = false): Promise<void> {
  await db.query(
    "insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats, created_at, hidden) values ($1, $2, $3, '[]', $7, $4, '{}', $5, $6)",
    [playerId, uuid(), level, moveCount, createdAt, hidden, `moves ${++next}`],
  );
}

const ranked = async (level: number, since: string | null) =>
  (await db.query<{ rank: number; player_id: string; wins: number; best_moves: number }>("select * from leaderboard_ranked($1, $2)", [level, since])).rows;

// Runs inside a savepoint, so an expected error does not end the test's transaction.
async function errorOf(sql: string, params: unknown[] = []): Promise<string> {
  await db.exec("savepoint probe");
  try {
    await db.query(sql, params);
    return "no error";
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await db.exec("rollback to savepoint probe");
  }
}

describe("the migration", () => {
  it("creates the four tables with Row Level Security on", async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname",
    );
    expect(tables.rows).toEqual([
      { relname: "game_results", relrowsecurity: true },
      { relname: "players", relrowsecurity: true },
      { relname: "rate_limits", relrowsecurity: true },
      { relname: "wins", relrowsecurity: true },
    ]);
  });

  it.each(["anon", "authenticated"])("%s can read no table and call no function", (role) =>
    inTransaction(async () => {
      await db.exec(`set local role ${role}`);
      for (const table of ["players", "wins", "game_results", "rate_limits"]) {
        expect(await errorOf(`select * from ${table}`)).toMatch(/permission denied/);
      }
      expect(await errorOf("select * from leaderboard_ranked(4, null)")).toMatch(/permission denied/);
      expect(await errorOf("select * from player_level_stats($1)", [uuid()])).toMatch(/permission denied/);
      expect(await errorOf("select * from hit_rate_limit('k', 60, 1)")).toMatch(/permission denied/);
    }),
  );

  it("the service role can use everything", () =>
    inTransaction(async () => {
      await db.exec("set local role service_role");
      expect(await errorOf("select * from players")).toBe("no error");
      expect(await errorOf("select * from leaderboard_ranked(4, null)")).toBe("no error");
      expect(await errorOf("select * from hit_rate_limit('k', 60, 1)")).toBe("no error");
    }),
  );
});

describe("the constraints", () => {
  it("usernames are unique without case", () =>
    inTransaction(async () => {
      await player("Checkers_Fan");
      expect(await errorOf("insert into players (username, username_key, token_hash, device_hash, ip_hash) values ('CHECKERS_fan', 'checkers_fan', 't2', 'd', 'i')")).toMatch(/duplicate key/);
    }),
  );

  it.each([
    ["too short", "ab", "ab"],
    ["starts with a digit", "1abc", "1abc"],
    ["has a space", "a b c", "a b c"],
    ["a key that is not the lower case name", "Fan", "Fan"],
  ])("refuses a username that %s", (_label, username, key) =>
    inTransaction(async () => {
      expect(await errorOf("insert into players (username, username_key, token_hash, device_hash, ip_hash) values ($1, $2, 't', 'd', 'i')", [username, key])).toMatch(/check constraint/);
    }),
  );

  it("refuses a bad country, level or move count", () =>
    inTransaction(async () => {
      expect(await errorOf("insert into players (username, username_key, country, token_hash, device_hash, ip_hash) values ('Abc', 'abc', 'pk', 't', 'd', 'i')")).toMatch(/check constraint/);
      const id = await player("Levels");
      expect(await errorOf("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 5, '[]', 'h', 1, '{}')", [id, uuid()])).toMatch(/check constraint/);
      expect(await errorOf("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 4, '[]', 'h', 0, '{}')", [id, uuid()])).toMatch(/check constraint/);
    }),
  );

  it("refuses a game id twice, and the same moves twice for one player and level", () =>
    inTransaction(async () => {
      const id = await player("Dupes");
      const game = uuid();
      await db.query("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 4, '[]', 'h1', 20, '{}')", [id, game]);
      expect(await errorOf("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 4, '[]', 'h2', 20, '{}')", [id, game])).toMatch(/duplicate key/);
      expect(await errorOf("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 4, '[]', 'h1', 20, '{}')", [id, uuid()])).toMatch(/duplicate key/);
      // The same moves on another level are a different win.
      expect(await errorOf("insert into wins (player_id, game_id, level, moves, moves_hash, move_count, stats) values ($1, $2, 3, '[]', 'h1', 20, '{}')", [id, uuid()])).toBe("no error");
    }),
  );

  it("deleting a player removes their wins and results (removal on request)", () =>
    inTransaction(async () => {
      const id = await player("Leaving");
      await win(id, 4, 20, "2026-11-18T10:00:00Z");
      await db.query("insert into game_results (player_id, game_id, level, result) values ($1, $2, 4, 'loss')", [id, uuid()]);
      await db.query("delete from players where id = $1", [id]);
      const left = await db.query<{ count: number }>("select (select count(*) from wins) + (select count(*) from game_results) as count");
      expect(Number(left.rows[0]!.count)).toBe(0);
    }),
  );
});

describe("leaderboard_ranked", () => {
  it("orders exactly as ranking.ts: wins, fewest moves, first to get there, then id", () =>
    inTransaction(async () => {
      const ids = await Promise.all(["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((name, index) => player(name, { id: `00000000-0000-4000-8000-00000000000${index + 1}` })));
      const [a, b, c, d, e] = ids as [string, string, string, string, string];
      const wins: [string, number, string][] = [
        [a, 30, "2026-11-16T01:00:00Z"], [a, 25, "2026-11-17T01:00:00Z"], // 2 wins, best 25
        [b, 25, "2026-11-16T02:00:00Z"], [b, 40, "2026-11-16T03:00:00Z"], // 2 wins, best 25, got there first
        [c, 22, "2026-11-16T04:00:00Z"], [c, 50, "2026-11-18T01:00:00Z"], // 2 wins, best 22
        [d, 10, "2026-11-16T05:00:00Z"], // 1 win
        [e, 10, "2026-11-16T05:00:00Z"], // 1 win, the same in every way as d
      ];
      for (const [id, moves, at] of wins) await win(id, 4, moves, at);

      const sql = await ranked(4, null);
      const ts = rankPlayers(wins.map(([playerId, moveCount, at]) => ({ playerId, moveCount, createdAt: Date.parse(at) })));
      expect(sql.map((row) => [Number(row.rank), row.player_id, Number(row.wins), row.best_moves])).toEqual(
        ts.map((row) => [row.rank, row.playerId, row.wins, row.bestMoves]),
      );
      expect(sql.map((row) => row.player_id)).toEqual([c, b, a, d, e]);
    }),
  );

  it("counts only the level asked and wins since the start of the period", () =>
    inTransaction(async () => {
      const id = await player("Periods");
      await win(id, 4, 20, "2026-11-15T23:59:59Z"); // Sunday, last week
      await win(id, 4, 21, "2026-11-16T00:00:00Z"); // Monday 00:00 UTC, this week
      await win(id, 3, 22, "2026-11-17T00:00:00Z"); // another level
      expect((await ranked(4, "2026-11-16T00:00:00Z")).map((row) => Number(row.wins))).toEqual([1]);
      expect((await ranked(4, null)).map((row) => Number(row.wins))).toEqual([2]);
      expect((await ranked(3, null)).map((row) => Number(row.wins))).toEqual([1]);
      expect(await ranked(2, null)).toEqual([]);
    }),
  );

  it("leaves out hidden players and hidden wins", () =>
    inTransaction(async () => {
      const shown = await player("Shown");
      const hidden = await player("Hidden", { hidden: true });
      await win(shown, 4, 20, "2026-11-16T01:00:00Z");
      await win(shown, 4, 20, "2026-11-16T02:00:00Z", true);
      await win(hidden, 4, 20, "2026-11-16T01:00:00Z");
      const rows = await ranked(4, null);
      expect(rows.map((row) => [row.player_id, Number(row.wins)])).toEqual([[shown, 1]]);
    }),
  );
});

describe("player_level_stats", () => {
  it("counts wins, best moves, losses and games for each level", () =>
    inTransaction(async () => {
      const id = await player("Stats");
      await win(id, 4, 30, "2026-11-16T01:00:00Z");
      await win(id, 4, 24, "2026-11-16T02:00:00Z");
      await win(id, 4, 10, "2026-11-16T03:00:00Z", true); // hidden: not counted
      for (const [level, result] of [[4, "win"], [4, "win"], [4, "loss"], [1, "loss"]] as const) {
        await db.query("insert into game_results (player_id, game_id, level, result) values ($1, $2, $3, $4)", [id, uuid(), level, result]);
      }
      const rows = (await db.query<Record<string, unknown>>("select * from player_level_stats($1)", [id])).rows;
      expect(rows.map((row) => [row["level"], Number(row["wins"]), row["best_moves"], Number(row["losses"]), Number(row["games"])])).toEqual([
        [1, 0, null, 1, 1],
        [2, 0, null, 0, 0],
        [3, 0, null, 0, 0],
        [4, 2, 24, 1, 3],
      ]);
    }),
  );
});

describe("hit_rate_limit", () => {
  it("allows up to the limit in a window, then refuses with the seconds left", () =>
    inTransaction(async () => {
      const hit = async () => (await db.query<{ allowed: boolean; retry_after_seconds: number }>("select * from hit_rate_limit('submitWin:ip:abc', 3600, 3)")).rows[0]!;
      const results = [await hit(), await hit(), await hit(), await hit()];
      expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
      expect(results[3]!.retry_after_seconds).toBeGreaterThanOrEqual(1);
      expect(results[3]!.retry_after_seconds).toBeLessThanOrEqual(3600);
      // Another key has its own count.
      expect((await db.query<{ allowed: boolean }>("select * from hit_rate_limit('submitWin:ip:other', 3600, 3)")).rows[0]!.allowed).toBe(true);
    }),
  );
});
