import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { handleAdminApi } from "../../netlify/admin/api";
import { csvCell, playersCsv, statusLabels } from "../../src/admin/players";
import type { PlayerRow } from "../../src/admin/protocol";
import { encodeCursor } from "../../src/admin/protocol";
import { PlayerCards, Players, playerQuery } from "../../src/admin/shell/Players";
import { PlayerDetailContent } from "../../src/admin/shell/PlayerDetail";
import { demoPlayerDetail } from "../../src/admin/dev/demo";
import { ADMIN_ID, NOW, adminToken, bearer, deps, fakeStore, request } from "./fakes";

const row: PlayerRow = { id: "99999999-9999-4999-8999-999999999999", username: "Player_Two", avatar: null, country: "PK",
  joinedAt: "2026-11-01T08:00:00Z", lastActiveAt: "2026-11-16T11:00:00Z", hidden: false, suspendedUntil: null,
  suspensionKind: null, deviceBanned: false, wins: 10, winsByLevel: [1, 2, 3, 4], games: 24, losses: 12, draws: 2,
  resigned: 3, abandoned: 1, reports: 1, reporters: 1 };
function world() {
  const players = vi.fn(async () => [{ row, sortValue: row.joinedAt }]);
  const w = deps(fakeStore({ players }));
  const token = adminToken(); w.auth.state.valid.add(token);
  return { w, token, players };
}
const exportRequest = (token: string, params: object = {}) => request({ op: "playersExport", params }, bearer(token));

describe("audited player page exports", () => {
  it("uses validated filters and cursor bounds, then records the exact page scope", async () => {
    const { w, token, players } = world();
    const cursor = encodeCursor(4, row.id);
    expect(await handleAdminApi(exportRequest(token, { search: "Player", country: "PK", limit: 25, sort: "wins", cursor }), w)).toMatchObject({ status: 200, body: { rows: [row], next: null } });
    expect(players).toHaveBeenCalledWith(expect.objectContaining({ search: "Player", country: "PK", sort: "wins", limit: 26, after: { value: "4", id: row.id } }));
    expect(w.store.state.logs).toEqual([expect.objectContaining({ adminId: ADMIN_ID, action: "player.export", outcome: "ok", details: { scope: "page", rows: 1, filters: { search: "Player", country: "PK", limit: 25, sort: "wins", cursor } } })]);
    expect(JSON.stringify(w.store.state.logs)).not.toContain(token);
  });
  it("refuses anonymous exports without reading or auditing player data", async () => {
    const { w, players } = world();
    expect((await handleAdminApi(request({ op: "playersExport" }), w)).status).toBe(401);
    expect(players).not.toHaveBeenCalled(); expect(w.store.state.logs).toEqual([]);
  });
  it.each([{ limit: 1000 }, { search: "x".repeat(65) }, { unknown: true }, { country: "ZZ" }, { cursor: "forged" }])("refuses invalid export parameters %j", async (params) => {
    const { w, token, players } = world();
    expect((await handleAdminApi(exportRequest(token, params), w)).status).toBe(400);
    expect(players).not.toHaveBeenCalled(); expect(w.store.state.logs).toEqual([]);
  });
  it("does not release export records if saving the audit entry fails", async () => {
    const { w, token } = world();
    w.store.log = async () => { throw new Error("private failure"); };
    const response = await handleAdminApi(exportRequest(token), w);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response)).not.toContain(row.username);
    expect(JSON.stringify([response, w.logged])).not.toContain("private failure");
  });
  it.each(["players", "playersExport"])("rejects reversed date ranges for %s before a database query", async (op) => {
    for (const params of [{ joinedFrom: "2026-11-18", joinedTo: "2026-11-01" }, { activeFrom: "2026-11-18", activeTo: "2026-11-01" }]) {
      const { w, token, players } = world();
      expect((await handleAdminApi(request({ op, params }, bearer(token)), w)).status).toBe(400);
      expect(players).not.toHaveBeenCalled();
    }
  });
});

describe("CSV records", () => {
  it.each(["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =cmd", "\t=cmd", "\r=cmd", "\n=cmd"])("neutralizes spreadsheet formulas %j", (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });
  it("quotes commas, quotes and newlines without dropping data", () => {
    expect(csvCell('A,"B"\nC')).toBe('"A,""B""\nC"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });
  it("exports only passed rows and all four levels, with CRLF records", () => {
    const csv = playersCsv([row]);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"1","2","3","4","24","12","2","3","1"');
    expect(csv).toContain('"Player_Two"');
    expect(csv).not.toMatch(/token|device_hash|ip_hash/);
    expect(playersCsv([]).split("\r\n")).toHaveLength(2);
  });
});

describe("player screen", () => {
  it("builds explicit UTC date bounds and omits unused filters", () => {
    expect(playerQuery({ search: "  Player  ", status: "", country: "none", level: "4", sort: "wins", desc: false,
      joinedFrom: "2026-11-01", joinedTo: "2026-11-18", activeFrom: "", activeTo: "" })).toEqual({
      search: "Player", country: "none", level: 4, sort: "wins", desc: false, limit: 25,
      joinedFrom: "2026-11-01T00:00:00.000Z", joinedTo: "2026-11-18T23:59:59.999Z",
    });
  });
  it("does not label expired suspensions active as banned, and shows independent restrictions", () => {
    expect(statusLabels({ ...row, suspendedUntil: "2026-11-01", suspensionKind: "admin" }, NOW)).toEqual(["Active"]);
    expect(statusLabels({ ...row, suspendedUntil: "2026-12-01", suspensionKind: "admin", hidden: true, deviceBanned: true }, NOW)).toEqual(["Suspended", "Hidden", "Device banned"]);
    expect(statusLabels({ ...row, suspensionKind: "permanent" }, NOW)).toEqual(["Banned"]);
  });
  it("offers labelled filters and loading status with no fabricated players", () => {
    const html = renderToStaticMarkup(createElement(Players));
    for (const text of ["Username", "Status", "Country", "Level", "Sort by", "Direction", "Joined from", "Active through", "Apply filters", "Export this page", "Loading players"]) expect(html).toContain(text);
    expect(html).not.toContain('class="adm-player-name"');
  });
  it("keeps verified wins, reported games, draws, resignations, abandoned games and unique reporters distinct", () => {
    const html = renderToStaticMarkup(createElement(PlayerCards, { rows: [row], now: NOW, onOpen: () => {} }));
    for (const text of ["View player Player_Two", "Pakistan", "Verified wins", "Draws", "Resigned", "Abandoned", "Unique reporters", "Strongest 4"]) expect(html).toContain(text);
  });
  it("shows read-only profile details, privacy markers and bounded history without moderation controls", () => {
    const html = renderToStaticMarkup(createElement(PlayerDetailContent, { detail: demoPlayerDetail(row) }));
    for (const text of ["Player_Two", "Player ID", "Games and verified wins", "Moderation status", "Latest 50 games", "latest 100", "Reports against this player", "Admin history", "device123456", "abandoned"]) expect(html).toContain(text);
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/token_hash|device_hash|ip_hash/);
  });
});
