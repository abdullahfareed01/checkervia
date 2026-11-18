// Migration 7 in PGlite (D101): rights, the append only audit log, the
// allow list, the suspension functions the game reads (D102) and the
// summary tables the triggers keep.
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addPlayer, addResult, addWin, adminDb, errorAs, errorOf, migrationSql, one, rows, uuid } from "./pg";

let db: PGlite;
beforeAll(async () => {
  db = await adminDb();
}, 120_000);

describe("rights", () => {
  it("has Row Level Security on every table and gives the public roles nothing", async () => {
    const tables = await rows<{ name: string; rls: boolean }>(
      db,
      "select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'",
    );
    expect(tables.length).toBeGreaterThanOrEqual(16);
    expect(tables.filter((table) => !table.rls)).toEqual([]);
    for (const { name } of tables) {
      for (const role of ["anon", "authenticated"]) {
        const can = await one<{ any: boolean }>(
          db,
          `select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert') or has_table_privilege($1, $2, 'update') or has_table_privilege($1, $2, 'delete') as any`,
          [role, `public.${name}`],
        );
        expect(can.any, `${role} on ${name}`).toBe(false);
      }
    }
    expect(await errorAs(db, "anon", "select * from admin_users")).toMatch(/permission denied/);
    expect(await errorAs(db, "authenticated", "select * from admin_audit")).toMatch(/permission denied/);
  });

  it("lets no public role run any function, and the service role run the admin ones", async () => {
    const functions = await rows<{ name: string; signature: string }>(
      db,
      "select p.proname as name, p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
    );
    expect(functions.filter((fn) => fn.name.startsWith("admin_")).length).toBeGreaterThan(30);
    for (const fn of functions) {
      for (const role of ["anon", "authenticated"]) {
        const can = await one<{ can: boolean }>(db, "select has_function_privilege($1, $2, 'execute') as can", [role, fn.signature]);
        expect(can.can, `${role} may run ${fn.signature}`).toBe(false);
      }
    }
    for (const name of ["admin_players", "admin_log", "admin_suspend", "presence_beat", "count_visit", "player_conduct"]) {
      const signature = functions.find((fn) => fn.name === name)!.signature;
      expect((await one<{ can: boolean }>(db, "select has_function_privilege('service_role', $1, 'execute') as can", [signature])).can).toBe(true);
    }
    expect(await errorAs(db, "anon", "select * from admin_overview(null)")).toMatch(/permission denied/);
    expect(await errorAs(db, "authenticated", "select admin_log(null, 'auth.signin', 'ok', null, null, null, null, null)")).toMatch(/permission denied/);
  });

  it("cannot be run twice", async () => {
    expect(await errorOf(db, migrationSql("leaderboard-migration-7.sql"))).toMatch(/already exists/);
  });
});

describe("the audit log", () => {
  it("is append only, for the owner and for the service role", async () => {
    await db.query("select admin_log(null, 'auth.signin', 'refused', null, null, null, '{\"why\": \"password\"}', 'ip')");
    expect(await errorOf(db, "update admin_audit set reason = 'changed'")).toMatch(/append only/);
    expect(await errorOf(db, "delete from admin_audit")).toMatch(/append only/);
    expect(await errorOf(db, "truncate admin_audit")).toMatch(/append only/);
    expect(await errorAs(db, "service_role", "update admin_audit set reason = 'x'")).toMatch(/permission denied/);
    expect(await errorAs(db, "service_role", "delete from admin_audit")).toMatch(/permission denied/);
    expect(await errorAs(db, "service_role", "select admin_log(null, 'auth.signin', 'ok', null, null, null, null, null)")).toBe("no error");
  });

  it("refuses odd actions, outcomes and oversized details", async () => {
    expect(await errorOf(db, "select admin_log(null, 'Drop Table', 'ok', null, null, null, null, null)")).toMatch(/check constraint/);
    expect(await errorOf(db, "select admin_log(null, 'auth.signin', 'maybe', null, null, null, null, null)")).toMatch(/check constraint/);
    expect(await errorOf(db, "select admin_log(null, 'auth.signin', 'ok', repeat('x', 501), null, null, null, null)")).toMatch(/check constraint/);
    expect(await errorOf(db, "select admin_log(null, 'auth.signin', 'ok', null, null, null, jsonb_build_object('x', repeat('y', 5000)), null)")).toMatch(/check constraint/);
  });

  it("pages newest first by id, with search, action group and player", async () => {
    const player = await addPlayer(db, "Audit_Target");
    for (let index = 0; index < 7; index++) {
      await db.query("select admin_log(null, $1, 'ok', $2, $3, 'Audit_Target', null, null)", [index % 2 ? "player.hide" : "player.view", `reason ${index}`, player]);
    }
    const first = await rows<{ id: number; action: string }>(db, "select * from admin_audit_page(null, null, $1, null, 3)", [player]);
    expect(first).toHaveLength(3);
    const second = await rows<{ id: number }>(db, "select * from admin_audit_page(null, null, $1, $2, 3)", [player, first[2]!.id]);
    expect(second.every((row) => row.id < first[2]!.id)).toBe(true);
    expect(await rows(db, "select * from admin_audit_page(null, 'player', $1, null, 50)", [player])).toHaveLength(7);
    expect(await rows(db, "select * from admin_audit_page(null, 'player.hide', $1, null, 50)", [player])).toHaveLength(3);
    expect(await rows(db, "select * from admin_audit_page('REASON 4', null, null, null, 50)")).toHaveLength(1);
    // A search text's own % and _ are plain characters.
    expect(await rows(db, "select * from admin_audit_page('%', null, null, null, 50)")).toHaveLength(0);
    expect(await rows(db, "select * from admin_audit_page('audit_t', null, null, null, 50)")).toHaveLength(7);
  });
});

describe("the allow list", () => {
  it("needs the same user id and email, and opens the authenticator window only when set", async () => {
    const user = uuid();
    await db.query("insert into auth.users (id, email) values ($1, 'owner@example.com')", [user]);
    await db.query("insert into admin_users (user_id, email, enroll_until) values ($1, 'owner@example.com', now() + interval '1 hour')", [user]);
    expect(await one(db, "select * from admin_gate($1, 'OWNER@example.com')", [user])).toEqual({ allowed: true, enroll_open: true });
    expect(await one(db, "select * from admin_gate($1, 'someone@example.com')", [user])).toEqual({ allowed: false, enroll_open: false });
    expect(await one(db, "select * from admin_gate($1, 'owner@example.com')", [uuid()])).toEqual({ allowed: false, enroll_open: false });
    await db.query("select admin_close_enrollment($1)", [user]);
    expect(await one(db, "select * from admin_gate($1, 'owner@example.com')", [user])).toEqual({ allowed: true, enroll_open: false });
    expect(await errorOf(db, "insert into admin_users (user_id, email) values ($1, 'Upper@Example.com')", [user])).toMatch(/check constraint|duplicate/);
    // Deleting the Auth user takes them off the list.
    await db.query("delete from auth.users where id = $1", [user]);
    expect(await one(db, "select * from admin_gate($1, 'owner@example.com')", [user])).toEqual({ allowed: false, enroll_open: false });
  });
});

describe("the suspension the game reads (D102)", () => {
  type Conduct = { reports: number; total_reports: number | string; suspended_until: Date | null; suspension_kind: string | null; revised_at: Date | null };
  const admin = "00000000-0000-4000-8000-0000000000ad";
  const report = (player: string, game: string) => one<Conduct>(db, "select * from add_report($1, $2, 2::smallint, 'middle', 4, 30)", [player, game]);

  it("an admin suspension has its kind, reason and revision, ends by itself and keeps the wins", async () => {
    const player = await addPlayer(db, "Suspend_Me");
    await addWin(db, player, 3);
    const until = await one<{ until: Date }>(db, "select admin_suspend($1, 'ip', $2, now() + interval '3 days', false, 'player.suspend', 'Spam names') as until", [admin, player]);
    const conduct = await one<Conduct>(db, "select * from player_conduct($1)", [player]);
    expect(conduct.suspension_kind).toBe("admin");
    expect(new Date(conduct.suspended_until!).getTime()).toBe(new Date(until.until).getTime());
    expect(conduct.revised_at).not.toBeNull();
    // While suspended by a person, a report only adds to the total.
    expect(await report(player, uuid())).toMatchObject({ reports: 0, suspension_kind: "admin" });
    // The end passes: lifted by itself, the wins are still there.
    await db.query("update players set suspended_until = now() - interval '1 second' where id = $1", [player]);
    expect(await one(db, "select suspended_until, suspension_kind from player_conduct($1)", [player])).toEqual({ suspended_until: null, suspension_kind: null });
    expect(await one(db, "select wins from player_stats where player_id = $1", [player])).toEqual({ wins: 1 });
    const logged = await rows<{ action: string; reason: string }>(db, "select action, reason from admin_audit where target_player = $1", [player]);
    expect(logged).toEqual([{ action: "player.suspend", reason: "Spam names" }]);
  });

  it("a permanent ban is a real date far away, and unsuspending lifts it with a new revision", async () => {
    const player = await addPlayer(db, "Banned_One");
    await db.query("select admin_suspend($1, 'ip', $2, null, true, 'player.ban', 'Cheating')", [admin, player]);
    const banned = await one<Conduct>(db, "select * from player_conduct($1)", [player]);
    expect(banned.suspension_kind).toBe("permanent");
    expect(new Date(banned.suspended_until!).toISOString()).toBe("9999-12-31T00:00:00.000Z");
    await db.query("select admin_unsuspend($1, 'ip', $2, 'Appeal accepted')", [admin, player]);
    const lifted = await one<Conduct>(db, "select * from player_conduct($1)", [player]);
    expect(lifted.suspended_until).toBeNull();
    expect(new Date(lifted.revised_at!).getTime()).toBeGreaterThanOrEqual(new Date(banned.revised_at!).getTime());
    expect(await errorOf(db, "select admin_suspend($1, 'ip', $2, now() - interval '1 day', false, 'player.suspend', 'x')", [admin, player])).toMatch(/future/);
  });

  it("the AI's fourth report still suspends for 30 days, as the kind 'reports'", async () => {
    const player = await addPlayer(db, "Slow_Again");
    for (let index = 0; index < 3; index++) await report(player, uuid());
    const fourth = await report(player, uuid());
    expect(fourth.suspension_kind).toBe("reports");
    expect(fourth.revised_at).toBeNull();
    const days = (new Date(fourth.suspended_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(await one(db, "select abandoned, reports from player_stats where player_id = $1", [player])).toEqual({ abandoned: 4, reports: 4 });
  });
});

describe("the summary tables", () => {
  it("count results, wins and hidden wins per player, and move a game when a win replaces a loss", async () => {
    const player = await addPlayer(db, "Counted");
    const game = await addResult(db, player, 2, "loss", { resigned: true });
    await addResult(db, player, 4, "loss");
    const win = await addWin(db, player, 4);
    expect(await one(db, "select wins, wins_4, games, games_2, games_4, losses, resigned from player_stats where player_id = $1", [player])).toEqual({
      wins: 1,
      wins_4: 1,
      games: 3,
      games_2: 1,
      games_4: 2,
      losses: 2,
      resigned: 1,
    });
    // A verified win for the resigned game (submit-win's upsert): no longer a resigned loss.
    await db.query("update game_results set result = 'win', resigned = false where player_id = $1 and game_id = $2", [player, game]);
    expect(await one(db, "select games, losses, resigned from player_stats where player_id = $1", [player])).toEqual({ games: 3, losses: 1, resigned: 0 });
    await db.query("update wins set hidden = true where id = $1", [win]);
    expect(await one(db, "select wins, wins_4 from player_stats where player_id = $1", [player])).toEqual({ wins: 0, wins_4: 0 });
    // The last activity moved with the results.
    expect((await one<{ last_seen_at: Date | null }>(db, "select last_seen_at from players where id = $1", [player])).last_seen_at).not.toBeNull();
  });

  it("counts sign ups and deletions per day, and deleting a player does not rewrite the past", async () => {
    const day = "2026-03-10T12:00:00Z";
    const player = await addPlayer(db, "Gone_Soon", { createdAt: day, country: "PK" });
    await addResult(db, player, 1, "loss", { at: day });
    const before = await one<{ registrations: number }>(db, "select registrations from daily_stats where day = '2026-03-10' and level = 0");
    expect(before.registrations).toBe(1);
    expect(await one(db, "select games, losses from daily_stats where day = '2026-03-10' and level = 1")).toEqual({ games: 1, losses: 1 });
    expect(await one(db, "select registrations, games from daily_country where day = '2026-03-10' and country = 'PK'")).toEqual({ registrations: 1, games: 1 });
    const total = async () => Number((await one<{ registered: number }>(db, "select (admin_overview(null) ->> 'registered')::int as registered")).registered);
    const registered = await total();
    await db.query("select admin_delete_player($1, 'ip', $2, 'Asked by email')", ["00000000-0000-4000-8000-0000000000ad", player]);
    expect(await total()).toBe(registered - 1);
    expect(await one(db, "select games, losses from daily_stats where day = '2026-03-10' and level = 1")).toEqual({ games: 1, losses: 1 });
    expect(await rows(db, "select * from player_stats where player_id = $1", [player])).toEqual([]);
    expect(await rows(db, "select * from daily_active where player_id = $1", [player])).toEqual([]);
    expect(await one(db, "select action, target_label from admin_audit where target_player = $1", [player])).toEqual({ action: "player.delete", target_label: "Gone_Soon" });
  });
});
