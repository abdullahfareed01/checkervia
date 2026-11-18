import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { overviewRange } from "../../src/admin/analytics";
import { demoAuditPage, demoCountries, demoOverview, demoResigned, demoWinners } from "../../src/admin/dev/demo";
import { encodeCursor } from "../../src/admin/protocol";
import { Countries, CountriesTable, resignationSeries, Resigned, ResignedTables, Winners, WinnersTables } from "../../src/admin/shell/AnalyticsReports";
import { Audit, AuditRows } from "../../src/admin/shell/Audit";
import { handleAdminApi } from "../../netlify/admin/api";
import { createSupabaseAdminStore } from "../../netlify/admin/supabaseAdminStore";
import { adminToken, bearer, deps, fakeStore, NOW, passwordToken, request } from "./fakes";

const operations = ["countries", "winners", "resigned"] as const;
function world() {
  const store = fakeStore();
  const calls = operations.map((op) => vi.spyOn(store, op));
  const w = deps(store), token = adminToken();
  w.auth.state.valid.add(token);
  return { w, token, calls };
}
describe("guarded analytics reports", () => {
  it.each(operations)("defaults %s to the bounded server UTC period", async (op) => {
    const { w, token, calls } = world();
    const result = await handleAdminApi(request({ op, params: {} }, bearer(token)), w);
    expect(result).toMatchObject({ status: 200, body: { range: overviewRange("30", NOW) } });
    expect(calls[operations.indexOf(op)]).toHaveBeenCalledTimes(1);
  });
  it.each(operations)("rejects invalid or unbounded %s inputs before data access", async (op) => {
    for (const params of [{ period: null }, { period: 7 }, { period: "365" }, { period: "all", limit: 99999 }, { period: "30", since: "1900-01-01" }]) {
      const { w, token, calls } = world();
      expect((await handleAdminApi(request({ op, params }, bearer(token)), w)).status).toBe(400);
      expect(calls.every((call) => call.mock.calls.length === 0)).toBe(true);
    }
  });
  it.each(operations)("requires verified second factor and same origin for %s", async (op) => {
    const { w, token, calls } = world(), pending = passwordToken();
    w.auth.state.valid.add(pending);
    expect((await handleAdminApi(request({ op }), w)).status).toBe(401);
    expect((await handleAdminApi(request({ op }, bearer(pending)), w)).status).toBe(403);
    expect((await handleAdminApi(request({ op }, { ...bearer(token), origin: "https://other.example" }), w)).status).toBe(400);
    expect(calls.every((call) => call.mock.calls.length === 0)).toBe(true);
  });
  it.each([0, 5, 1.1, "2", null, false])("rejects invalid ranking level %j", async (level) => {
    const { w, token, calls } = world();
    expect((await handleAdminApi(request({ op: "winners", params: { level } }, bearer(token)), w)).status).toBe(400);
    expect(calls[1]).not.toHaveBeenCalled();
  });
  it.each(operations)("enforces read throttling and redacts %s storage errors", async (op) => {
    const { w, token } = world();
    w.store[op] = async () => { throw new Error("private database detail"); };
    const response = await handleAdminApi(request({ op }, bearer(token)), w);
    expect(response.status).toBe(503);
    expect(JSON.stringify([response, w.logged])).not.toContain("private database detail");
    w.store.state.limits.set("admin:read:user:", 1);
    expect((await handleAdminApi(request({ op }, bearer(token)), w)).status).toBe(429);
  });
});

describe("analytics storage reads", () => {
  function adapter(broken = "") {
    const sent: { rpc: string; params: Record<string, unknown> }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const rpc = String(input).split("/").at(-1)!;
      sent.push({ rpc, params: JSON.parse(String(init?.body)) });
      const bodies: Record<string, unknown> = {
        admin_countries: [{ country: "", players: "2", signups: "1", games: "9", online_now: "3" }],
        admin_overview: { levels: [{ level: "2", games: "9", wins: "3", losses: "5", draws: "1", resigned: "2", abandoned: "1" }] },
        admin_rankings: [{ rank: "1", player_id: "p", username: "Player", country: null, wins: "3", best_moves: null, games: "9" }],
        admin_top_winners: [{ player_id: "p", username: "Player", hidden: true, wins: "30", games: "100" }],
        admin_daily_levels: [{ day: "2026-11-16", level: "2", games: "9", resigned: "2", abandoned: "1" }],
        admin_resigners: [{ player_id: "p", username: "Player", resigned: "2", abandoned: "1", games: "9" }],
      };
      return new Response(JSON.stringify(rpc === broken ? { code: "42883", message: "private SQL" } : bodies[rpc]), { status: rpc === broken ? 400 : 200, headers: { "content-type": "application/json" } });
    };
    return { store: createSupabaseAdminStore("https://project.supabase.co", "sb_secret_test", fetcher), sent };
  }
  it("maps country counters and preserves the no flag bucket", async () => {
    const { store, sent } = adapter();
    expect((await store.countries(overviewRange("all", NOW))).rows).toEqual([{ country: "", players: 2, signups: 1, games: 9, onlineNow: 3 }]);
    expect(sent).toEqual([{ rpc: "admin_countries", params: { p_since: null } }]);
  });
  it("bounds ranking and all time lists and keeps verified wins separate from results", async () => {
    const { store, sent } = adapter(), range = overviewRange("7", NOW);
    expect(await store.winners(range, 2)).toMatchObject({ level: 2, rows: [{ rank: 1, wins: 3, games: 9, bestMoves: null }], top: [{ hidden: true, wins: 30 }], levels: [{ wins: 3, losses: 5, draws: 1 }] });
    expect(sent).toContainEqual({ rpc: "admin_rankings", params: { p_since: range.since, p_level: 2, p_limit: 25 } });
    expect(sent).toContainEqual({ rpc: "admin_top_winners", params: { p_limit: 25 } });
    expect(sent).toHaveLength(3);
  });
  it("bounds daily charts while all time resignation totals use all history", async () => {
    const { store, sent } = adapter(), range = overviewRange("all", NOW);
    expect(await store.resigned(range)).toMatchObject({ rows: [{ resigned: 2, abandoned: 1 }], daily: [{ day: "2026-11-16", level: 2, resigned: 2 }], levels: [{ games: 9 }] });
    expect(sent).toContainEqual({ rpc: "admin_daily_levels", params: { p_from: range.from, p_to: range.to } });
    expect(sent).toContainEqual({ rpc: "admin_resigners", params: { p_since: null, p_limit: 25 } });
    expect(sent).toHaveLength(3);
  });
  it.each(["admin_rankings", "admin_top_winners", "admin_overview"])("fails the whole ranking snapshot when %s fails", async (rpc) => {
    await expect(adapter(rpc).store.winners(overviewRange("30", NOW), 1)).rejects.toThrow("storage error 42883");
  });
  it.each(["admin_daily_levels", "admin_resigners"])("fails the whole resignation snapshot when %s fails", async (rpc) => {
    await expect(adapter(rpc).store.resigned(overviewRange("30", NOW))).rejects.toThrow("storage error 42883");
  });
});

describe("analytics presentation and development samples", () => {
  it.each([Countries, Winners, Resigned, Audit])("shows loading without fabricating records", (Component) => {
    const html = renderToStaticMarkup(createElement(Component));
    expect(html).toContain("Loading"); expect(html).toContain('aria-busy="true"'); expect(html).not.toContain("Player_");
  });
  it("keeps country current totals stable and explains chosen flags", () => {
    const seven = demoCountries("7"), all = demoCountries("all");
    expect(seven.rows.reduce((sum, row) => sum + row.players, 0)).toBe(60);
    expect(seven.rows.map((row) => row.onlineNow)).toEqual(all.rows.map((row) => row.onlineNow));
    expect(seven.rows.reduce((sum, row) => sum + row.games, 0)).toBe(demoOverview("7").totals.games);
    const html = renderToStaticMarkup(createElement(CountriesTable, { data: seven }));
    for (const text of ["Pakistan", "No flag", "chosen by players", "current totals"]) expect(html).toContain(text);
  });
  it("explains ranking visibility, all time winners and which side won", () => {
    const html = renderToStaticMarkup(createElement(WinnersTables, { data: demoWinners("7", 4) }));
    for (const text of ["Strongest public ranking", "AI wins", "all levels, all time", "Hidden profile", "separate count"]) expect(html).toContain(text);
  });
  it("preserves daily totals by level and inserts missing zero days", () => {
    const data = demoResigned("7");
    for (const row of data.levels) for (const key of ["games", "wins", "losses", "draws", "resigned", "abandoned"] as const) expect(data.daily.filter((day) => day.level === row.level).reduce((sum, day) => sum + day[key], 0)).toBe(row[key]);
    const series = resignationSeries({ ...data, range: { ...data.range, from: "2026-11-14", to: "2026-11-16" }, daily: [{ day: "2026-11-15", level: 1, games: 10, wins: 2, losses: 8, draws: 0, resigned: 3, abandoned: 1 }] }, 1);
    expect(series.labels).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
    expect(series.series.map((row) => row.values)).toEqual([[0, 3, 0], [0, 1, 0]]);
    expect(resignationSeries({ ...data, daily: [] }, 4).series[0]!.values.every((value) => value === 0)).toBe(true);
    const html = renderToStaticMarkup(createElement(ResignedTables, { data: demoResigned("all"), level: 0 }));
    expect(html).toContain("latest 90 days"); expect(html).toContain("never increase the resignation count");
  });
  it("renders explicit empty reports", () => {
    expect(renderToStaticMarkup(createElement(CountriesTable, { data: demoCountries("7", true) }))).toContain("No country records");
    expect(renderToStaticMarkup(createElement(WinnersTables, { data: demoWinners("7", 1, true) }))).toContain("No ranked wins");
    expect(renderToStaticMarkup(createElement(ResignedTables, { data: demoResigned("7", true), level: 0 }))).toContain("No resignations");
  });
  it("paginates and filters sample audit entries without duplicates", () => {
    const first = demoAuditPage({ limit: 25 }), next = demoAuditPage({ limit: 25, cursor: first.next! });
    expect(first.rows).toHaveLength(25); expect(next.rows).toHaveLength(25);
    expect(new Set([...first.rows, ...next.rows].map((row) => row.id)).size).toBe(50);
    expect(demoAuditPage({ action: "player.view" }).rows.every((row) => row.action === "player.view")).toBe(true);
    expect(demoAuditPage({ search: "does not exist" }).rows).toEqual([]);
    expect(demoAuditPage({ cursor: encodeCursor(1, "") }).rows).toEqual([]);
    expect(demoAuditPage({ limit: 25 }, false, NOW).rows).toEqual(demoAuditPage({ limit: 25 }, false, NOW).rows);
  });
  it("escapes audit reasons and details and offers no edit actions", () => {
    const sample = demoAuditPage({ limit: 1 }).rows[0]!;
    const html = renderToStaticMarkup(createElement(AuditRows, { rows: [{ ...sample, reason: "<script>unsafe</script>", details: { note: "<img src=x>" } }] }));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("Entry details"); expect(html).not.toContain("<button");
    expect(renderToStaticMarkup(createElement(AuditRows, { rows: [] }))).toContain("No audit entries");
  });
});
