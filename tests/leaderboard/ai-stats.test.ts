// D75: the AI's record over every player. The report carries whether a loss
// was a resignation; get-ai-stats adds up every reported game (hidden
// players left out), open to everyone, totals only. Also the Supabase
// adapter's calls and the SQL (migration 3) in PGlite.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetAiStats } from "../../netlify/leaderboard/handlers/getAiStats";
import { LIMITS } from "../../netlify/leaderboard/handlers/limits";
import { handleReportGame } from "../../netlify/leaderboard/handlers/reportGame";
import type { LeaderboardDeps, LeaderboardHandler } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken } from "../../netlify/leaderboard/security";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";

const START = Date.parse("2026-11-18T12:00:00Z");
let ids = 0;
const gameId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

function world() {
  const clock = { time: START };
  const store = createMemoryStore(() => clock.time);
  const deps: LeaderboardDeps = { store, salt: "test salt", now: () => new Date(clock.time), newToken, log: () => {} };
  return { clock, store, deps };
}
type World = ReturnType<typeof world>;

async function call(handler: LeaderboardHandler, w: World, options: { body?: unknown; token?: string; method?: string; ip?: string; device?: string } = {}) {
  const response = await handler(
    {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      body: options.body === undefined ? "" : JSON.stringify(options.body),
      query: new URLSearchParams(),
      authorization: options.token ? `Bearer ${options.token}` : null,
      deviceId: options.device ?? "device-aaaaaaaaaaaaaaaa",
      ip: options.ip ?? "203.0.113.7",
    },
    w.deps,
  );
  return { status: response.status, body: response.body as Record<string, unknown> };
}

async function claim(w: World, username: string): Promise<string> {
  const response = await call(handleClaimUsername, w, { body: { username, country: "none", avatar: "a07" } });
  return response.body["token"] as string;
}

const report = (w: World, token: string, result: "win" | "loss", resigned?: unknown) =>
  call(handleReportGame, w, { token, body: { gameId: gameId(), level: 4, result, ...(resigned === undefined ? {} : { resigned }) } });

describe("the AI's record (get-ai-stats)", () => {
  it("adds up every player's games: the AI's wins, its losses and the resignations", async () => {
    const w = world();
    const ana = await claim(w, "Ana");
    const ben = await claim(w, "Ben");
    await report(w, ana, "loss");
    await report(w, ana, "loss", true);
    await report(w, ben, "win");
    await report(w, ben, "loss", true);
    const response = await call(handleGetAiStats, w);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ games: 4, aiWins: 3, aiLosses: 1, resigned: 2 });
    // The same per level: all four, in order (every report here is at level 4).
    const levels = response.body["levels"] as { level: number; games: number }[];
    expect(levels.map((row) => [row.level, row.games])).toEqual([[1, 0], [2, 0], [3, 0], [4, 4]]);
    expect(levels[3]).toEqual({ level: 4, games: 4, aiWins: 3, aiLosses: 1, resigned: 2 });
  });

  it("is open to everyone, needs no token and carries no names", async () => {
    const w = world();
    const token = await claim(w, "Secret_Name");
    await report(w, token, "loss");
    const response = await call(handleGetAiStats, w);
    expect(JSON.stringify(response.body)).not.toContain("Secret_Name");
    expect(Object.keys(response.body).sort()).toEqual(["aiLosses", "aiWins", "games", "levels", "resigned"]);
  });

  it("leaves hidden players out", async () => {
    const w = world();
    await report(w, await claim(w, "Shown"), "loss");
    await report(w, await claim(w, "Hidden"), "loss");
    w.store.hidePlayer(w.store.players[1]!.id);
    expect((await call(handleGetAiStats, w)).body).toMatchObject({ games: 1, aiWins: 1 });
  });

  it("only a loss can be a resignation, and the flag must be true or false", async () => {
    const w = world();
    const token = await claim(w, "Flags");
    expect((await report(w, token, "win", true)).status).toBe(400);
    expect((await report(w, token, "loss", "yes")).status).toBe(400);
    expect((await report(w, token, "loss", false)).status).toBe(200);
    expect((await report(w, token, "loss")).status).toBe(200); // older clients send no flag
  });

  it("is GET only and rate limited per IP address", async () => {
    const w = world();
    expect((await call(handleGetAiStats, w, { method: "POST", body: {} })).status).toBe(405);
    for (let index = 0; index < LIMITS.getAiStats.perIp; index += 1) expect((await call(handleGetAiStats, w)).status).toBe(200);
    expect((await call(handleGetAiStats, w)).status).toBe(429);
  });
});

// The Supabase adapter, against a fake HTTP layer (as in supabase-store.test.ts).
function fakeSupabase(answer: unknown) {
  const seen: { url: URL; method: string; body: unknown }[] = [];
  const store = createSupabaseStore("https://project.supabase.co", "service-key-for-tests", async (input, init) => {
    seen.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { seen, store };
}

describe("the Supabase adapter (D75)", () => {
  it("reads the AI's record through its SQL function", async () => {
    const { seen, store } = fakeSupabase([
      { level: 1, games: "4", ai_wins: 1, ai_losses: 3, resigned: "0" },
      { level: 4, games: "10", ai_wins: 7, ai_losses: 3, resigned: "2" },
    ]);
    expect(await store.aiRecord()).toEqual({
      games: 14,
      aiWins: 8,
      aiLosses: 6,
      resigned: 2,
      levels: [
        { level: 1, games: 4, aiWins: 1, aiLosses: 3, resigned: 0 },
        { level: 2, games: 0, aiWins: 0, aiLosses: 0, resigned: 0 },
        { level: 3, games: 0, aiWins: 0, aiLosses: 0, resigned: 0 },
        { level: 4, games: 10, aiWins: 7, aiLosses: 3, resigned: 2 },
      ],
    });
    expect(seen[0]!.url.pathname).toBe("/rest/v1/rpc/ai_record");
  });

  it("before migration 3 (no ai_record function) it counts the games from the table instead", async () => {
    const seen: URL[] = [];
    const store = createSupabaseStore("https://project.supabase.co", "service-key-for-tests", async (input, init) => {
      const url = new URL(String(input));
      seen.push(url);
      if (url.pathname === "/rest/v1/rpc/ai_record") {
        return new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      // Level n: n AI wins (player losses) and 10 times n AI losses.
      const level = Number(url.searchParams.get("level")!.replace("eq.", ""));
      const total = url.searchParams.get("result") === "eq.loss" ? level : 10 * level;
      expect(init?.method).toBe("HEAD");
      expect(url.searchParams.get("players.hidden")).toBe("eq.false");
      return new Response(null, { status: 200, headers: { "content-range": `*/${total}` } });
    });
    const record = await store.aiRecord();
    expect(record).toMatchObject({ games: 110, aiWins: 10, aiLosses: 100, resigned: 0 });
    expect(record.levels[2]).toEqual({ level: 3, games: 33, aiWins: 3, aiLosses: 30, resigned: 0 });
    expect(seen.filter((url) => url.pathname === "/rest/v1/game_results")).toHaveLength(8);
  });

  it("any other failure still fails (no made up numbers)", async () => {
    const store = createSupabaseStore("https://project.supabase.co", "service-key-for-tests", async () =>
      new Response(JSON.stringify({ code: "57014", message: "timeout" }), { status: 500, headers: { "content-type": "application/json" } }));
    await expect(store.aiRecord()).rejects.toThrow("57014");
  });

  it("sends the resignation flag only when true, so reports work before migration 3", async () => {
    const { seen, store } = fakeSupabase(null);
    await store.saveGameResult({ playerId: "p1", gameId: "g1", level: 4, result: "loss", resigned: true }, false);
    await store.saveGameResult({ playerId: "p1", gameId: "g2", level: 4, result: "loss", resigned: false }, false);
    expect(seen[0]!.body).toMatchObject({ resigned: true });
    expect(seen[1]!.body).not.toHaveProperty("resigned");
  });

  it("a verified win clears the resignation flag, and still saves before migration 3", async () => {
    const { seen, store } = fakeSupabase(null);
    await store.saveGameResult({ playerId: "p1", gameId: "g1", level: 4, result: "win" }, true);
    expect(seen[0]!.body).toMatchObject({ result: "win", resigned: false });

    const bodies: unknown[] = [];
    const before = createSupabaseStore("https://project.supabase.co", "service-key-for-tests", async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return "resigned" in body
        ? new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'resigned' column" }), { status: 400, headers: { "content-type": "application/json" } })
        : new Response(null, { status: 201 });
    });
    expect(await before.saveGameResult({ playerId: "p1", gameId: "g1", level: 4, result: "win" }, true)).toBe("added");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty("resigned");
  });
});

describe("migration 3 in PGlite (D75)", () => {
  const sql = (name: string) => readFileSync(new URL(`../../docs/07-deployment/${name}`, import.meta.url), "utf8");
  const SUPABASE_LIKE = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `;

  it("counts the record, refuses a resigned win, keeps it from the public roles and cannot run twice", async () => {
    const db = new PGlite();
    await db.exec(SUPABASE_LIKE);
    await db.exec(sql("leaderboard-migration.sql"));
    await db.exec(sql("leaderboard-migration-2.sql"));
    await db.exec(sql("leaderboard-migration-3.sql"));
    const player = async (id: string, username: string, hidden: boolean) =>
      db.query("insert into players (id, username, username_key, token_hash, device_hash, ip_hash, hidden) values ($1, $2::text, lower($2::text), $3, 'd', 'i', $4)", [id, username, `token ${id}`, hidden]);
    const result = async (playerId: string, game: string, outcome: string, resigned: boolean) =>
      db.query("insert into game_results (player_id, game_id, level, result, resigned) values ($1, $2, 4, $3, $4)", [playerId, game, outcome, resigned]);
    const a = "00000000-0000-4000-8000-00000000000a";
    const h = "00000000-0000-4000-8000-00000000000b";
    await player(a, "Shown_One", false);
    await player(h, "Hidden_One", true);
    await result(a, "00000000-0000-4000-8000-000000000001", "loss", true);
    await result(a, "00000000-0000-4000-8000-000000000002", "loss", false);
    await result(a, "00000000-0000-4000-8000-000000000003", "win", false);
    await result(h, "00000000-0000-4000-8000-000000000004", "loss", true);
    const rows = (await db.query<Record<string, unknown>>("select * from ai_record()")).rows;
    expect(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])))).toEqual([{ level: 4, games: 3, ai_wins: 2, ai_losses: 1, resigned: 1 }]);

    const error = (run: Promise<unknown>) => run.then(() => "no error", (caught: unknown) => String((caught as Error).message));
    expect(await error(result(a, "00000000-0000-4000-8000-000000000005", "win", true))).toMatch(/check constraint/);

    // The player's own counts now carry their resignations too.
    const stats = (await db.query<Record<string, unknown>>("select * from player_level_stats($1)", [a])).rows;
    expect(stats.map((row) => [row["level"], Number(row["losses"]), Number(row["games"]), Number(row["resigned"])])).toEqual([
      [1, 0, 0, 0],
      [2, 0, 0, 0],
      [3, 0, 0, 0],
      [4, 2, 3, 1],
    ]);
    // A verified win over a resigned loss of the same game clears the flag.
    const resignedGame = "00000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into game_results (player_id, game_id, level, result, resigned) values ($1, $2, 4, 'win', false) on conflict (player_id, game_id) do update set result = excluded.result, resigned = excluded.resigned",
      [a, resignedGame],
    );
    expect(Number((await db.query<{ resigned: unknown }>("select * from player_level_stats($1) where level = 4", [a])).rows[0]!.resigned)).toBe(0);
    expect(await error(db.exec(`set role anon; select * from player_level_stats('${a}');`))).toMatch(/permission denied/);
    await db.exec("reset role");
    expect(await error(db.exec("set role anon; select * from ai_record();"))).toMatch(/permission denied/);
    await db.exec("reset role");
    expect(await error(db.exec(sql("leaderboard-migration-3.sql")))).toMatch(/already exists/);
  }, 60_000);
});
