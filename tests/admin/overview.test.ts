import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OVERVIEW_PERIODS, overviewRange } from "../../src/admin/analytics";
import type { OverviewData } from "../../src/admin/analytics";
import { Chart, chartPath } from "../../src/admin/shell/Chart";
import { OverviewCharts, OverviewNumbers, OverviewStats } from "../../src/admin/shell/OverviewStats";
import { handleAdminApi } from "../../netlify/admin/api";
import { createSupabaseAdminStore } from "../../netlify/admin/supabaseAdminStore";
import { adminToken, bearer, deps, fakeStore, passwordToken, request } from "./fakes";

function world() {
  const calls: unknown[] = [];
  const store = fakeStore();
  const inherited = store.overview;
  store.overview = async (range) => { calls.push(range); return inherited(range); };
  const w = deps(store);
  const token = adminToken();
  w.auth.state.valid.add(token);
  return { w, calls, token };
}
const call = (params: unknown, token: string) => request({ op: "overview", params }, bearer(token));

describe("overview UTC periods", () => {
  it.each(OVERVIEW_PERIODS)("includes today exactly once in %s", (period) => {
    const range = overviewRange(period, new Date("2026-01-01T23:59:59Z"));
    expect(range.to).toBe("2026-01-01");
    expect((Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1).toBe(period === "all" ? 90 : Number(period));
    expect(range.since).toBe(period === "all" ? null : `${range.from}T00:00:00.000Z`);
  });
  it("uses UTC rather than the caller's timezone and crosses leap day", () => {
    expect(overviewRange("7", new Date("2024-03-01T03:00:00+05:00"))).toMatchObject({ from: "2024-02-23", to: "2024-02-29" });
  });
});

describe("guarded overview reads", () => {
  it("defaults to 30 days and uses the server's clock", async () => {
    const { w, calls, token } = world();
    expect(await handleAdminApi(call({}, token), w)).toMatchObject({ status: 200, body: { range: { from: "2026-10-18", to: "2026-11-16", period: "30" } } });
    expect(calls).toHaveLength(1);
  });
  it.each(["7", "30", "90", "all"])("accepts the %s window", async (period) => {
    const { w, calls, token } = world();
    expect((await handleAdminApi(call({ period }, token), w)).status).toBe(200);
    expect(calls[0]).toMatchObject({ period, since: period === "all" ? null : expect.any(String) });
  });
  it.each(["365", "ALL", "", 7, null, false, [], {}, "7; drop table players"])("refuses an invalid period %j without a database read", async (period) => {
    const { w, calls, token } = world();
    expect((await handleAdminApi(call({ period }, token), w)).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it("does not accept custom unbounded dates or unknown parameters", async () => {
    const { w, calls, token } = world();
    expect((await handleAdminApi(call({ period: "all", from: "1900-01-01" }, token), w)).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it("requires a verified admin, second factor and own-site request", async () => {
    const { w, calls, token } = world();
    expect((await handleAdminApi(request({ op: "overview" }), w)).status).toBe(401);
    const pending = passwordToken();
    w.auth.state.valid.add(pending);
    expect((await handleAdminApi(call({}, pending), w)).status).toBe(403);
    expect((await handleAdminApi(request({ op: "overview" }, { ...bearer(token), origin: "https://other.example" }), w)).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it("preserves read rate limits and redacts storage errors", async () => {
    const { w, token } = world();
    w.store.overview = async () => { throw new Error("secret upstream response"); };
    const response = await handleAdminApi(call({}, token), w);
    expect(response.status).toBe(503);
    expect(JSON.stringify([response, w.logged])).not.toContain("secret upstream response");
    w.store.state.limits.set("admin:read:user:", 1);
    expect((await handleAdminApi(call({}, token), w)).status).toBe(429);
  });
});

const sample: OverviewData = {
  range: overviewRange("7", new Date("2026-11-16T12:00:00Z")),
  totals: { registered: 12, newPlayers: 3, visitors: 0, visitorsToday: 0, onlineNow: 0, games: 7, onlineGames: 0,
    resigned: 2, abandoned: 1, openReports: 4, suspended: 1,
    levels: [{ level: 4, games: 7, wins: 3, losses: 3, draws: 1, resigned: 2, abandoned: 1 }] },
  daily: [{ day: "2026-11-16", registered: 12, registrations: 1, deletions: 0, visitors: 0, active: 2,
    games: 7, wins: 3, losses: 3, draws: 1, resigned: 2, abandoned: 1, onlineGames: 0 }],
  weekly: [{ week: "2026-11-16", active: 2 }],
};

describe("overview storage adapter", () => {
  it("reads only summary functions, converts database numbers and keeps draws distinct and fills inactive weeks", async () => {
    const sent: { rpc: string; params: unknown; headers: Headers }[] = [];
    const fetcher: typeof fetch = vi.fn(async (input, init) => {
      const rpc = String(input).split("/").at(-1)!;
      sent.push({ rpc, params: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      const body = rpc === "admin_overview" ? { ...sample.totals, registered: "12", levels: [{ level: "4", games: "7", wins: "3", losses: "3", draws: "1", resigned: "2", abandoned: "1" }] }
        : rpc === "admin_daily" ? [{ ...sample.daily[0], onlineGames: undefined, online_games: "5", games: "7" }]
        : sample.weekly;
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    const store = createSupabaseAdminStore("https://project.supabase.co", "sb_secret_test", fetcher);
    expect(await store.overview(sample.range)).toMatchObject({ totals: sample.totals, daily: [{ games: 7, onlineGames: 5 }], weekly: [{ week: "2026-11-09", active: 0 }, ...sample.weekly] });
    expect(sent.map((s) => s.rpc).sort()).toEqual(["admin_daily", "admin_overview", "admin_weekly_active"]);
    expect(sent.find((s) => s.rpc === "admin_overview")?.params).toEqual({ p_since: "2026-11-10T00:00:00.000Z" });
    expect(sent.find((s) => s.rpc === "admin_daily")?.params).toEqual({ p_from: "2026-11-10", p_to: "2026-11-16" });
    expect(sent.every((s) => s.headers.get("apikey") === "sb_secret_test")).toBe(true);
  });
  it.each(["admin_overview", "admin_daily", "admin_weekly_active"])("fails the whole snapshot if %s fails", async (broken) => {
    const store = createSupabaseAdminStore("https://project.supabase.co", "sb_secret_test", async (input) => {
      const rpc = String(input).split("/").at(-1);
      return new Response(JSON.stringify(rpc === broken ? { code: "42883", message: "private database details" } : rpc === "admin_overview" ? sample.totals : []),
        { status: rpc === broken ? 400 : 200, headers: { "content-type": "application/json" } });
    });
    await expect(store.overview(overviewRange("all", new Date("2026-11-16")))).rejects.toThrow("storage error 42883");
  });
});

describe("overview charts and numbers", () => {
  it("uses a finite chart for a zero series and a visible point for a single day", () => {
    expect(chartPath([0, 0], 0)).toBe("M0.0,152.0 C166.7,152.0 333.3,152.0 500.0,152.0");
    expect(chartPath([5], 10)).toBe("M250.0,80.0");
    expect(chartPath([NaN, Infinity, -2], 1)).not.toMatch(/NaN|Infinity/);
    const html = renderToStaticMarkup(createElement(Chart, { title: "One day", labels: ["2026-11-16"], series: [{ label: "Wins", values: [5] }] }));
    expect(html).toContain('d="M250,8.0h0.01"');
    expect(html).toContain("Show data"); expect(html).toContain(" for one day</span>");
    expect(html).toContain('scope="col">Wins');
    expect(html).toContain('scope="row">2026-11-16');
    expect(html).toContain(">5</td>");
    expect(html).not.toContain("style=");
    // One series is named by the title; a legend appears from two series.
    expect(html).not.toContain('class="adm-chart-swatch"');
    expect(renderToStaticMarkup(createElement(Chart, { title: "Two", labels: ["2026-11-16"], series: [{ label: "Wins", values: [5] }, { label: "Losses", values: [2] }] }))).toContain('class="adm-chart-swatch"');
  });
  it("reports empty days without inventing a chart", () => {
    const html = renderToStaticMarkup(createElement(Chart, { title: "Empty", labels: [], series: [] }));
    expect(html).toContain("No daily records in this period.");
    expect(html).not.toContain("<svg");
  });
  it("shows the player's results and keeps resignations and abandonments separate", () => {
    const html = renderToStaticMarkup(createElement(OverviewNumbers, { data: sample }));
    expect(html).toMatch(/Resigned games[^]*?>2<\/span>/);
    expect(html).toMatch(/Abandoned games[^]*?>1<\/span>/);
    expect(html).toMatch(/Active players today[^]*?>2<\/span>/);
    const charts = renderToStaticMarkup(createElement(OverviewCharts, { data: sample }));
    expect(charts.match(/<svg/g)).toHaveLength(5);
    for (const label of ["Easy", "Medium", "Hard", "Strongest", "Draws", "partial", "UTC"]) expect(charts).toContain(label);
    expect(charts).toContain('<td>3</td><td>3</td><td>1</td>');
  });
  it("offers all periods and explains live traffic counting while loading", () => {
    const html = renderToStaticMarkup(createElement(OverviewStats));
    for (const label of ["7 days", "30 days", "90 days", "All time", "Loading statistics", "expire after 75 seconds", "UTC days"]) expect(html).toContain(label);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Registered players</dt>");
  });
});
