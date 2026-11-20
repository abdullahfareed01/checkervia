// Migration 9 (D150) in PGlite, on a database like the live one (migrations
// 1 to 4, 7 and 8): rights, one email per profile, cascades when a profile
// goes, the erasure queue and the clean up of unused code requests.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addPlayer, adminDb, errorAs, errorOf, migrationSql, one, rows, uuid } from "../admin/pg";

const hash = (text: string) => text.padEnd(64, "0").slice(0, 64);
let db: PGlite;

async function authUser(email: string): Promise<string> {
  const id = uuid();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}
const link = (player: string, user: string, email: string) =>
  one<{ outcome: string }>(db, "select account_link($1, $2, $3, 'a•••@b•••.co') as outcome", [player, user, hash(email)]).then((row) => row.outcome);

beforeAll(async () => {
  db = await adminDb();
  await db.exec(migrationSql("admin-migration-8.sql"));
  await db.exec(migrationSql("accounts-migration-9.sql"));
}, 120_000);

describe("rights", () => {
  const tables = ["player_accounts", "player_tokens", "player_saves", "account_codes", "account_erasures"];

  it("has Row Level Security on the new tables and gives the public roles nothing", async () => {
    for (const name of tables) {
      expect((await one<{ rls: boolean }>(db, "select relrowsecurity as rls from pg_class where relname = $1", [name])).rls).toBe(true);
      for (const role of ["anon", "authenticated"] as const) expect(await errorAs(db, role, `select * from ${name}`)).toMatch(/permission denied/);
    }
  });

  it("lets only the service role run the functions, each with a fixed search path", async () => {
    for (const fn of ["account_link(uuid,uuid,text,text)", "account_queue_stale_codes(timestamp with time zone)", "account_queue_erasure()"]) {
      for (const role of ["anon", "authenticated"]) {
        expect((await one<{ can: boolean }>(db, "select has_function_privilege($1, $2, 'execute') as can", [role, fn])).can, `${role} ${fn}`).toBe(false);
      }
      const config = await one<{ config: string[] | null }>(db, "select proconfig as config from pg_proc where oid = $1::regprocedure", [fn]);
      expect(config.config).toContain("search_path=public");
    }
    expect((await one<{ can: boolean }>(db, "select has_function_privilege('service_role', 'account_link(uuid,uuid,text,text)', 'execute') as can")).can).toBe(true);
  });

  it("stops at once if run a second time", async () => {
    expect(await errorOf(db, migrationSql("accounts-migration-9.sql"))).toMatch(/already exists/);
  });
});

describe("one email, one profile", () => {
  it("links once each way", async () => {
    const ada = await addPlayer(db, "AdaLink");
    const grace = await addPlayer(db, "GraceLink");
    const user = await authUser("ada@b.co");
    expect(await link(ada, user, "ada@b.co")).toBe("linked");
    expect(await link(ada, await authUser("ada2@b.co"), "ada2@b.co")).toBe("profileLinked");
    expect(await link(grace, user, "other@b.co")).toBe("emailTaken");
    expect(await link(grace, await authUser("x@b.co"), "ada@b.co")).toBe("emailTaken");
  });
});

describe("when a profile goes", () => {
  it("its link, device keys and saves go too, and its Auth user is queued for deletion", async () => {
    const player = await addPlayer(db, "Leaving");
    const user = await authUser("leaving@b.co");
    await link(player, user, "leaving@b.co");
    await db.query("insert into player_tokens (token_hash, player_id, device_hash) values ($1, $2, 'device')", [hash("token"), player]);
    await db.query("insert into player_saves (player_id, collection, settings) values ($1, '{}', '{}')", [player]);
    await db.query("delete from players where id = $1", [player]);
    for (const table of ["player_accounts", "player_tokens", "player_saves"]) {
      expect((await rows(db, `select 1 from ${table} where player_id = $1`, [player])).length, table).toBe(0);
    }
    expect((await rows(db, "select 1 from account_erasures where auth_user_id = $1", [user])).length).toBe(1);
  });

  it("removing only the email also queues its Auth user", async () => {
    const player = await addPlayer(db, "Unlinking");
    const user = await authUser("unlinking@b.co");
    await link(player, user, "unlinking@b.co");
    await db.query("delete from player_accounts where player_id = $1", [player]);
    expect((await rows(db, "select 1 from account_erasures where auth_user_id = $1", [user])).length).toBe(1);
  });

  it("refuses an oversized save", async () => {
    const player = await addPlayer(db, "Hoarder");
    const big = JSON.stringify({ x: "y".repeat(9000) });
    expect(await errorOf(db, "insert into player_saves (player_id, collection, settings) values ($1, $2::jsonb, '{}')", [player, big])).toMatch(/check constraint/);
  });
});

describe("unused code requests", () => {
  it("are forgotten after a day; only never linked users we made are queued", async () => {
    const made = await authUser("made@b.co");
    const linkedUser = await authUser("kept@b.co");
    await link(await addPlayer(db, "Kept"), linkedUser, "kept@b.co");
    const old = "2026-11-01T00:00:00Z";
    await db.query("insert into account_codes (email_hash, auth_user_id, created_user, requested_at) values ($1, $2, true, $3), ($4, $5, true, $3), ($6, null, false, $3), ($7, $8, true, now())",
      [hash("made"), made, old, hash("kept"), linkedUser, hash("none"), hash("fresh"), await authUser("fresh@b.co")]);
    const queued = await one<{ n: number }>(db, "select account_queue_stale_codes('2026-11-19T00:00:00Z') as n");
    expect(queued.n).toBe(1);
    expect((await rows(db, "select 1 from account_erasures where auth_user_id = $1", [made])).length).toBe(1);
    expect((await rows(db, "select 1 from account_erasures where auth_user_id = $1", [linkedUser])).length).toBe(0);
    expect((await rows<{ email_hash: string }>(db, "select email_hash from account_codes")).map((row) => row.email_hash)).toEqual([hash("fresh")]);
  });
});
