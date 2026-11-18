// The real deployed game schema (draws + AI cooldowns) must coexist with admin.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SUPABASE_LIKE, addPlayer, addResult, migrationSql, one, rows, uuid } from "./pg";
let db: PGlite;
let player: string;
beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } }); await db.exec(SUPABASE_LIKE);
  for (const name of ["leaderboard-migration.sql", "leaderboard-migration-2.sql", "leaderboard-migration-3.sql", "leaderboard-migration-4.sql", "leaderboard-migration-5.sql", "ai-migration-6.sql"]) await db.exec(migrationSql(name));
  player = await addPlayer(db, "IntegrationUser", { country: "PK" });
  await addResult(db, player, 4, "loss");
  await db.query("insert into game_results(player_id,game_id,level,result) values($1,$2,4,'draw')", [player, uuid()]);
  await db.exec("select set_ai_provider_cooldown('test-provider', '2027-01-01', 'quota')");
  await db.exec(migrationSql("leaderboard-migration-7.sql"));
}, 120000);
afterAll(async () => { await db?.close(); });

describe("real game and admin integration", () => {
  it("backfills draws and losses without altering AI provider cooldowns", async () => {
    const stats = await one<{ games: number; draws: number; losses: number }>(db, "select games,draws,losses from player_stats where player_id=$1", [player]);
    expect(stats).toEqual({ games: 2, draws: 1, losses: 1 });
    expect(await rows(db, "select provider,last_error_code from ai_provider_cooldowns")).toEqual([{ provider: "test-provider", last_error_code: "quota" }]);
    expect((await one<{ d: number }>(db, "select draws::int as d from ai_record() where level=4")).d).toBe(1);
  });
  it("updates the dashboard summaries as real game reports are written", async () => {
    const before = await one<{ n: number }>(db, "select games as n from player_stats where player_id=$1", [player]);
    await db.query("insert into game_results(player_id,game_id,level,result,resigned) values($1,$2,2,'loss',true)", [player, uuid()]);
    const stats = await one<{ games: number; resigned: number }>(db, "select games,resigned from player_stats where player_id=$1", [player]);
    expect(stats.games).toBe(before.n + 1); expect(stats.resigned).toBe(1);
    const overview = await one<{ totals: { games: number; resigned: number } }>(db, "select admin_overview(null) as totals");
    expect(overview.totals.games).toBe(stats.games); expect(overview.totals.resigned).toBe(1);
  });
  it("deduplicates visitor writes and expires or ends visible-game sessions", async () => {
    await db.exec("select count_visit('2026-11-18','daily-mark-123456789','visit-limit',1000); select count_visit('2026-11-18','daily-mark-123456789','visit-limit',1000)");
    expect((await one<{ visitors: number }>(db, "select visitors from daily_visitors where day='2026-11-18'")).visitors).toBe(1);
    await db.exec("select presence_beat('device-session-123456','ai',4::smallint,'PK',75,'beat-limit',120)");
    expect((await one<{ n: number }>(db, "select (admin_overview(null)->>'onlineNow')::int as n")).n).toBe(1);
    expect((await one<{ ended: boolean }>(db, "select game_presence_end('device-session-123456','beat-limit',120) as ended")).ended).toBe(true);
    expect((await one<{ n: number }>(db, "select (admin_overview(null)->>'onlineNow')::int as n")).n).toBe(0);
  });
  it("keeps all traffic RPCs closed to browsers and available only to the server role", async () => {
    for (const signature of ["count_visit(date,text,text,integer)", "presence_beat(text,text,smallint,text,integer,text,integer)", "game_presence_end(text,text,integer)"]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const allowed = await one<{ yes: boolean }>(db, "select has_function_privilege($1,$2,'execute') as yes", [role, signature]);
        expect(allowed.yes).toBe(role === "service_role");
      }
    }
  });
});
