// Exercise the real upgrade with existing data, including failure halfway
// through: losing the result constraint must never leave a partial schema.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(new URL(`../../docs/07-deployment/${name}`, import.meta.url), "utf8");
const migration = sql("leaderboard-migration-5.sql");
const PLAYER = "00000000-0000-4000-8000-000000000001";
const HIDDEN = "00000000-0000-4000-8000-000000000002";

async function beforeDraws(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const name of ["leaderboard-migration.sql", ...[2, 3, 4].map((n) => `leaderboard-migration-${n}.sql`)]) await db.exec(sql(name));
  await db.exec(`
    insert into players (id,username,username_key,token_hash,device_hash,ip_hash,hidden) values
      ('${PLAYER}','Shown','shown','shown-token','d','i',false),
      ('${HIDDEN}','Hidden','hidden','hidden-token','d','i',true);
    insert into game_results (player_id,game_id,level,result,resigned) values
      ('${PLAYER}','10000000-0000-4000-8000-000000000001',4,'win',false),
      ('${PLAYER}','10000000-0000-4000-8000-000000000002',4,'loss',true),
      ('${PLAYER}','10000000-0000-4000-8000-000000000003',4,'loss',false),
      ('${HIDDEN}','10000000-0000-4000-8000-000000000004',4,'loss',true);
    insert into wins (player_id,game_id,level,moves,moves_hash,move_count,stats) values
      ('${PLAYER}','10000000-0000-4000-8000-000000000001',4,'[]','existing-win',21,'{}');
  `);
  return db;
}

async function errorCode(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

let db: PGlite;
let oldResults: unknown[];
let oldRanking: unknown[];
beforeAll(async () => {
  db = await beforeDraws();
  oldResults = (await db.query("select * from game_results order by game_id")).rows;
  oldRanking = (await db.query("select * from leaderboard_ranked(4,null)")).rows;
  await db.exec(migration);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("migration 5: existing games and draws", () => {
  it("preserves every existing result and the ranking", async () => {
    expect((await db.query("select * from game_results order by game_id")).rows).toEqual(oldResults);
    expect((await db.query("select * from leaderboard_ranked(4,null)")).rows).toEqual(oldRanking);
  });

  it("counts draws separately, without changing wins, losses or resignations", async () => {
    await db.exec("begin");
    try {
      await db.query("insert into game_results (player_id,game_id,level,result) values ($1,'10000000-0000-4000-8000-000000000005',4,'draw')", [PLAYER]);
      const ai = (await db.query("select * from ai_record()")).rows;
      expect(ai).toEqual([{ level: 4, games: 4, ai_wins: 2, ai_losses: 1, resigned: 1, draws: 1 }]);
      const profile = (await db.query("select * from player_level_stats($1) where level=4", [PLAYER])).rows;
      expect(profile).toEqual([{ level: 4, games: 4, wins: 1, best_moves: 21, losses: 2, resigned: 1, draws: 1 }]);
      expect((await db.query("select * from leaderboard_ranked(4,null)")).rows).toEqual(oldRanking);
    } finally {
      await db.exec("rollback");
    }
  });

  it("refuses invalid results, a resigned draw, and duplicate games", async () => {
    const insert = (result: string, resigned: boolean, game: string) => db.query(
      "insert into game_results (player_id,game_id,level,result,resigned) values ($1,$2,4,$3,$4)", [PLAYER, game, result, resigned],
    );
    const game = "10000000-0000-4000-8000-000000000001";
    expect(await errorCode(insert("draw", true, "10000000-0000-4000-8000-000000000006"))).toBe("23514");
    expect(await errorCode(insert("unknown", false, "10000000-0000-4000-8000-000000000007"))).toBe("23514");
    expect(await errorCode(insert("draw", false, game))).toBe("23505");
  });

  it("keeps RLS on all six tables and both changed functions private", async () => {
    const tables = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;
    expect(tables).toHaveLength(6);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      try {
        for (const query of ["select * from ai_record()", `select * from player_level_stats('${PLAYER}')`]) {
          expect(await errorCode(db.query(query))).toBe(role === "service_role" ? undefined : "42501");
        }
      } finally {
        await db.exec("reset role");
      }
    }
  });

  it("refuses a second application without changing existing results", async () => {
    try {
      expect(await errorCode(db.exec(migration))).toBe("42704");
    } finally {
      await db.exec("rollback");
    }
    expect((await db.query("select * from game_results order by game_id")).rows).toEqual(oldResults);
    expect((await db.query("select * from ai_record()")).rows[0]).toHaveProperty("draws", 0);
  });
});

it("rolls back the constraint change if a later function replacement fails", async () => {
  const old = await beforeDraws();
  try {
    // A dependent view forces DROP FUNCTION to fail after the constraint changes.
    await old.exec("create view audit_record as select * from ai_record()");
    expect(await errorCode(old.exec(migration))).toBe("2BP01");
    await old.exec("rollback");
    expect(await errorCode(old.query("insert into game_results (player_id,game_id,level,result) values ($1,'10000000-0000-4000-8000-000000000005',4,'draw')", [PLAYER]))).toBe("23514");
    expect((await old.query("select * from ai_record()")).rows[0]).not.toHaveProperty("draws");
    await old.exec("drop view audit_record");
    await old.exec(migration);
    expect((await old.query("select * from ai_record()")).rows[0]).toHaveProperty("draws", 0);
  } finally {
    await old.close();
  }
}, 60_000);
