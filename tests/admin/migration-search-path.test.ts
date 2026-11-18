import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { adminDb, migrationSql, rows } from "./pg";

let db: PGlite;
let before: unknown;
beforeAll(async () => {
  db = await adminDb();
  before = await rows(db, "select utc_day('2026-11-19T02:00:00+05:00'::timestamptz)::text as day, admin_like('a%b_c') as search, admin_has_rooms() as rooms");
  await db.exec(migrationSql("admin-migration-8.sql"));
}, 120000);
afterAll(async () => { await db?.close(); });

describe("admin helper search paths", () => {
  it("pins all three advisor findings to the intended schema", async () => {
    const helpers = await rows<{ name: string; config: string[] }>(db, "select proname as name, proconfig as config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('utc_day','admin_like','admin_has_rooms') order by proname");
    expect(helpers).toHaveLength(3);
    for (const helper of helpers) expect(helper.config, helper.name).toContain("search_path=public");
  });

  it("preserves UTC dates, literal search escaping and optional room detection", async () => {
    expect(await rows(db, "select utc_day('2026-11-19T02:00:00+05:00'::timestamptz)::text as day, admin_like('a%b_c') as search, admin_has_rooms() as rooms")).toEqual(before);
  });

  it("preserves server-only execution privileges", async () => {
    const permissions = await rows<{ name: string; anonymous: boolean; authenticated: boolean; server: boolean }>(db, "select proname as name, has_function_privilege('anon',p.oid,'execute') as anonymous, has_function_privilege('authenticated',p.oid,'execute') as authenticated, has_function_privilege('service_role',p.oid,'execute') as server from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('utc_day','admin_like','admin_has_rooms')");
    for (const permission of permissions) expect(permission).toMatchObject({ anonymous: false, authenticated: false, server: true });
  });

  it("is safe to repeat without changing game records", async () => {
    const counts = await rows(db, "select (select count(*) from players)::int as players, (select count(*) from game_results)::int as games");
    await db.exec(migrationSql("admin-migration-8.sql"));
    expect(await rows(db, "select (select count(*) from players)::int as players, (select count(*) from game_results)::int as games")).toEqual(counts);
  });
});
