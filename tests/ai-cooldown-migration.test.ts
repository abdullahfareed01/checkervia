import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../docs/07-deployment/ai-migration-6.sql", import.meta.url), "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;");
  await db.exec(migration);
}, 60000);
afterAll(async () => { await db?.close(); });
describe("migration 6: private shared cooldowns", () => {
  it("permits service-role writes and does not shorten an existing cooldown", async () => {
    await db.exec("set role service_role");
    try {
      await db.query("select set_ai_provider_cooldown($1,$2,$3)", ["groq", "2026-11-19T00:00Z", "429"]);
      await db.query("select set_ai_provider_cooldown($1,$2,$3)", ["groq", "2026-11-18T00:00Z", "402"]);
      const rows = await db.query<{ provider: string; until: string; last_error_code: string }>("select provider,cooldown_until::text as until,last_error_code from ai_provider_cooldowns");
      expect(rows.rows).toEqual([{ provider: "groq", until: "2026-11-19 00:00:00+00", last_error_code: "429" }]);
    } finally { await db.exec("reset role"); }
  });
  it.each(["anon", "authenticated"])("denies table reads, writes and RPC calls to %s", async role => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from ai_provider_cooldowns")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("insert into ai_provider_cooldowns values ('test',now(),'429',now())")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select set_ai_provider_cooldown('test',now(),'429')")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role"); }
  });
  it("can be safely rerun and preserves cooldowns", async () => {
    const before = (await db.query("select * from ai_provider_cooldowns")).rows;
    await db.exec(migration);
    expect((await db.query("select * from ai_provider_cooldowns")).rows).toEqual(before);
    expect((await db.query<{ enabled: boolean }>("select relrowsecurity as enabled from pg_class where relname='ai_provider_cooldowns'")).rows[0]?.enabled).toBe(true);
  });
  it("rolls back a failed installation without touching existing tables", async () => {
    const isolated = new PGlite();
    try {
      await isolated.exec("create role anon; create role authenticated; create role service_role bypassrls; create table existing_data(id integer primary key); insert into existing_data values(7);");
      await expect(isolated.exec(migration.replace("commit;", "select missing_installation_check(); commit;"))).rejects.toBeDefined();
      await isolated.exec("rollback");
      expect((await isolated.query("select * from existing_data")).rows).toEqual([{ id: 7 }]);
      expect((await isolated.query("select to_regclass('public.ai_provider_cooldowns') as table_name")).rows).toEqual([{ table_name: null }]);
    } finally { await isolated.close(); }
  }, 30000);
});
