// D85 on the server: the AI's reports for abandoned games and the 30 day
// suspension. report-abandon counts a game once; the fourth report suspends
// the account for 30 days and starts the count again; a suspended account
// cannot submit a win; only the player sees their own reports. The
// Supabase adapter and migration 4 (in PGlite) do the same.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetProfile } from "../../netlify/leaderboard/handlers/getProfile";
import { handleReportAbandon } from "../../netlify/leaderboard/handlers/reportAbandon";
import { handleSubmitWin } from "../../netlify/leaderboard/handlers/submitWin";
import type { LeaderboardDeps, LeaderboardHandler, LeaderboardRequest } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken } from "../../netlify/leaderboard/security";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";
import reportAbandon from "../../netlify/functions/report-abandon";
import { REPORT_LIMIT, SUSPENSION_DAYS } from "../../src/leaderboard/protocol";
import { BLACK_WIN } from "./fixtures";

const START = Date.parse("2026-11-18T12:00:00Z");
const DAY = 86_400_000;

function world() {
  const clock = { time: START };
  const store = createMemoryStore(() => clock.time);
  const deps: LeaderboardDeps = { store, salt: "test salt", now: () => new Date(clock.time), newToken, log: () => {} };
  return { store, deps, clock };
}
type World = ReturnType<typeof world>;

let ids = 0;
const gameId = () => `00000000-0000-4000-a000-${String(++ids).padStart(12, "0")}`;

async function call(handler: LeaderboardHandler, w: World, options: { body?: unknown; query?: Record<string, string>; token?: string; method?: string } = {}) {
  const request: LeaderboardRequest = {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    body: options.body === undefined ? "" : JSON.stringify(options.body),
    query: new URLSearchParams(options.query ?? {}),
    authorization: options.token ? `Bearer ${options.token}` : null,
    deviceId: "device-ffffffffffffffff",
    ip: "203.0.113.11",
  };
  const response = await handler(request, w.deps);
  return { status: response.status, body: response.body as Record<string, unknown> };
}

async function claim(w: World, username: string): Promise<string> {
  const response = await call(handleClaimUsername, w, { body: { username, country: "none", avatar: "a07" } });
  expect(response.status).toBe(201);
  return response.body["token"] as string;
}

const report = (w: World, token: string, id = gameId(), phase = "middle") => call(handleReportAbandon, w, { token, body: { gameId: id, level: 3, phase } });

describe("report-abandon", () => {
  it("counts each abandoned game once; the fourth report suspends the account for 30 days and starts the count again", async () => {
    const w = world();
    const token = await claim(w, "Slow_Mover");
    expect((await report(w, token, gameId(), "start")).body).toEqual({ reports: 1, totalReports: 1, suspendedUntil: null });
    const same = gameId();
    expect((await report(w, token, same)).body).toEqual({ reports: 2, totalReports: 2, suspendedUntil: null });
    expect((await report(w, token, same)).body).toEqual({ reports: 2, totalReports: 2, suspendedUntil: null }); // a retry
    expect((await report(w, token)).body).toEqual({ reports: 3, totalReports: 3, suspendedUntil: null });
    const until = new Date(START + SUSPENSION_DAYS * DAY).toISOString();
    expect((await report(w, token)).body).toEqual({ reports: 0, totalReports: REPORT_LIMIT, suspendedUntil: until });
    // While suspended a report only adds to the total.
    expect((await report(w, token)).body).toEqual({ reports: 0, totalReports: 5, suspendedUntil: until });
    // After the 30 days: not suspended, counting from zero again.
    w.clock.time = START + SUSPENSION_DAYS * DAY + 1;
    expect((await report(w, token)).body).toEqual({ reports: 1, totalReports: 6, suspendedUntil: null });
  });

  it("needs a profile, a game id, a level and a phase", async () => {
    const w = world();
    const token = await claim(w, "Checks_All");
    expect((await call(handleReportAbandon, w, { body: { gameId: gameId(), level: 3, phase: "start" } })).status).toBe(401);
    for (const body of [
      { gameId: "nope", level: 3, phase: "start" },
      { gameId: gameId(), level: 9, phase: "start" },
      { gameId: gameId(), level: 3, phase: "later" },
      { gameId: gameId(), level: 3, phase: "start", extra: 1 },
    ]) {
      expect((await call(handleReportAbandon, w, { token, body })).status).toBe(400);
    }
    expect((await call(handleReportAbandon, w, { token, method: "GET" })).status).toBe(405);
  });

  it("the Netlify wrapper answers the calm 503 before the Supabase variables are set", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const response = await reportAbandon(new Request("https://example.test/.netlify/functions/report-abandon", { method: "POST", body: "{}" }));
      expect(response.status).toBe(503);
    } finally {
      console.error = original;
    }
  });
});

describe("a suspended account", () => {
  it("cannot submit a win until the suspension ends", async () => {
    const w = world();
    const token = await claim(w, "Benched");
    for (let n = 0; n < REPORT_LIMIT; n++) await report(w, token);
    const win = { gameId: gameId(), level: 4, mode: "vs-ai", colour: "black", moves: BLACK_WIN };
    expect(await call(handleSubmitWin, w, { token, body: win })).toMatchObject({ status: 403, body: { code: "suspended" } });
    w.clock.time = START + SUSPENSION_DAYS * DAY + 1;
    expect((await call(handleSubmitWin, w, { token, body: win })).status).toBe(201);
  });

  it("only the player sees their reports and suspension in the profile", async () => {
    const w = world();
    const token = await claim(w, "Own_Eyes");
    const other = await claim(w, "Someone_Else");
    for (let n = 0; n < REPORT_LIMIT + 1; n++) await report(w, token);
    const own = (await call(handleGetProfile, w, { token, query: { username: "own_eyes" } })).body;
    expect(own["conduct"]).toEqual({ reports: 0, totalReports: 5, suspendedUntil: new Date(START + SUSPENSION_DAYS * DAY).toISOString() });
    expect((await call(handleGetProfile, w, { query: { username: "own_eyes" } })).body).not.toHaveProperty("conduct");
    expect((await call(handleGetProfile, w, { token: other, query: { username: "own_eyes" } })).body).not.toHaveProperty("conduct");
  });
});

function fakeSupabase(answer: (url: URL) => { status: number; body: unknown }) {
  const seen: { url: URL; body: unknown }[] = [];
  const store = createSupabaseStore("https://project.supabase.co", "service-key-for-tests", async (input, init) => {
    const url = new URL(String(input));
    seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const { status, body } = answer(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { seen, store };
}

describe("the Supabase adapter (D85)", () => {
  it("adds a report through add_report and reads the conduct through player_conduct", async () => {
    const row = { reports: 2, total_reports: "7", suspended_until: null };
    const { seen, store } = fakeSupabase(() => ({ status: 200, body: row }));
    expect(await store.addReport({ playerId: "p1", gameId: "g1", level: 2, phase: "start" }, REPORT_LIMIT, SUSPENSION_DAYS)).toEqual({ reports: 2, totalReports: 7, suspendedUntil: null });
    expect(seen[0]!.url.pathname).toBe("/rest/v1/rpc/add_report");
    expect(seen[0]!.body).toEqual({ p_player: "p1", p_game: "g1", p_level: 2, p_phase: "start", p_limit: 4, p_days: 30 });
    const until = "2026-12-18T12:00:00+00:00";
    const suspended = fakeSupabase(() => ({ status: 200, body: { reports: 0, total_reports: 4, suspended_until: until } }));
    expect(await suspended.store.conduct("p1")).toEqual({ reports: 0, totalReports: 4, suspendedUntil: new Date(until) });
    expect(suspended.seen[0]!.url.pathname).toBe("/rest/v1/rpc/player_conduct");
  });

  it("before migration 4: no reports, nobody suspended, but a report fails (the browser sends it again later)", async () => {
    const { store } = fakeSupabase(() => ({ status: 404, body: { code: "PGRST202", message: "Could not find the function" } }));
    expect(await store.conduct("p1")).toEqual({ reports: 0, totalReports: 0, suspendedUntil: null });
    await expect(store.addReport({ playerId: "p1", gameId: "g1", level: 2, phase: "start" }, 4, 30)).rejects.toThrow("PGRST202");
  });

  it("any other failure still fails", async () => {
    const { store } = fakeSupabase(() => ({ status: 500, body: { code: "57014", message: "timeout" } }));
    await expect(store.conduct("p1")).rejects.toThrow("57014");
  });
});

describe("migration 4 in PGlite (D85)", () => {
  const sql = (name: string) => readFileSync(new URL(`../../docs/07-deployment/${name}`, import.meta.url), "utf8");
  const SUPABASE_LIKE = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `;

  it("counts once per game, suspends at the fourth for 30 days, keeps it from the public roles and cannot run twice", async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_LIKE);
    for (const name of ["leaderboard-migration.sql", "leaderboard-migration-2.sql", "leaderboard-migration-3.sql", "leaderboard-migration-4.sql"]) await db.exec(sql(name));
    const player = "00000000-0000-4000-8000-00000000000a";
    await db.query("insert into players (id, username, username_key, token_hash, device_hash, ip_hash) values ($1, 'Slow_One', 'slow_one', 't', 'd', 'i')", [player]);
    type Row = { reports: number; total_reports: number | string; suspended_until: Date | string | null };
    const add = async (game: string, phase = "middle") =>
      (await db.query<Row>("select * from add_report($1, $2, 3::smallint, $3, 4, 30)", [player, game, phase])).rows[0]!;
    const game = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

    expect(await add(game(1), "start")).toMatchObject({ reports: 1, suspended_until: null });
    expect(Number((await add(game(1))).total_reports)).toBe(1); // the same game again
    await add(game(2));
    await add(game(3));
    const fourth = await add(game(4));
    expect(fourth.reports).toBe(0);
    expect(Number(fourth.total_reports)).toBe(4);
    const days = (new Date(fourth.suspended_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    // While suspended: the total only.
    const fifth = await add(game(5));
    expect([fifth.reports, Number(fifth.total_reports)]).toEqual([0, 5]);
    // The suspension ends: counting again from zero.
    await db.query("update players set suspended_until = now() - interval '1 minute' where id = $1", [player]);
    expect((await db.query<Row>("select * from player_conduct($1)", [player])).rows[0]).toMatchObject({ reports: 0, suspended_until: null });
    expect(await add(game(6))).toMatchObject({ reports: 1, suspended_until: null });

    const error = (run: Promise<unknown>) => run.then(() => "no error", (caught: unknown) => String((caught as Error).message));
    expect(await error(db.query("insert into player_reports (player_id, game_id, level, phase) values ($1, $2, 3, 'later')", [player, game(9)]))).toMatch(/check constraint/);
    expect(await error(db.exec(`set role anon; select * from player_conduct('${player}');`))).toMatch(/permission denied/);
    await db.exec("reset role");
    expect(await error(db.exec("set role anon; select * from player_reports;"))).toMatch(/permission denied/);
    await db.exec("reset role");
    expect(await error(db.exec(sql("leaderboard-migration-4.sql")))).toMatch(/already exists/);
  }, 60_000);
});
