// Phase 3 (D110): the reports queue, live play and the moderator's actions.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { handleAdminApi } from "../../netlify/admin/api";
import { createSupabaseAdminStore, toLiveData, toReportRow } from "../../netlify/admin/supabaseAdminStore";
import { demoLive, demoPlayers, demoReportGroups, demoReportPage, demoReports } from "../../src/admin/dev/demo";
import { reasonOf, REPORT_GROUPS_MAX } from "../../src/admin/moderation";
import { LEVEL_NAMES } from "../../src/admin/players";
import { decodeCursor } from "../../src/admin/protocol";
import { ActionDialog } from "../../src/admin/shell/ActionDialog";
import * as act from "../../src/admin/shell/actions";
import { Live, LiveContent } from "../../src/admin/shell/Live";
import { ReportGroups, ReportRows, Reports } from "../../src/admin/shell/Reports";
import { daysLeft, SuspensionTable, Suspensions } from "../../src/admin/shell/Suspensions";
import { ADMIN_ID, adminToken, bearer, deps, fakeStore, NOW, passwordToken, request } from "./fakes";

const PLAYER = "55555555-5555-4555-8555-000000000001";
const GAME = "66666666-6666-4666-8666-000000000001";
const REASON = "Abandoned four games in a row";

function world() {
  const store = fakeStore();
  const w = deps(store), token = adminToken();
  w.auth.state.valid.add(token);
  const call = (op: string, params: Record<string, unknown> = {}) => handleAdminApi(request({ op, params }, bearer(token)), w);
  return { w, store, call };
}

describe("reasons", () => {
  it("accepts 3 to 500 characters after trimming and collapses spaces", () => {
    expect(reasonOf("  Rude   chat ")).toBe("Rude chat");
    expect(reasonOf("ab")).toBeNull(); expect(reasonOf("x".repeat(501))).toBeNull(); expect(reasonOf(42)).toBeNull();
    expect(reasonOf("x".repeat(500))).toHaveLength(500);
  });
});

describe("guarded phase 3 reads", () => {
  it("pages reports by time and key, newest first, with one extra row to detect more", async () => {
    const { store, call } = world();
    const rows = demoReports(demoPlayers(NOW), NOW).slice(0, 3);
    const spy = vi.spyOn(store, "reports").mockResolvedValue(rows);
    const answer = await call("reports", { status: "open", limit: 2 });
    expect(spy).toHaveBeenCalledWith({ status: "open", source: null, playerId: null, before: null, limit: 3 });
    const body = answer.body as { rows: unknown[]; next: string };
    expect(body.rows).toHaveLength(2);
    expect(decodeCursor(body.next)).toEqual([rows[1]!.createdAt, rows[1]!.key]);
    await call("reports", { cursor: body.next });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ before: { at: rows[1]!.createdAt, key: rows[1]!.key }, limit: 26 }));
  });
  it.each([{ status: "closed" }, { source: "chat" }, { playerId: "not-a-uuid" }, { limit: 0 }, { limit: 101 }, { cursor: "!!" }, { cursor: "eyJ4Ijox" }, { extra: 1 }])("refuses report filter %j before the database", async (params) => {
    const { store, call } = world();
    const spy = vi.spyOn(store, "reports");
    expect((await call("reports", params)).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
  it("groups reports with a server limit, and reads live counts with no input", async () => {
    const { store, call } = world();
    const groups = vi.spyOn(store, "reportGroups");
    expect((await call("reportGroups", { status: "open" })).status).toBe(200);
    expect(groups).toHaveBeenCalledWith("open", REPORT_GROUPS_MAX);
    expect((await call("reportGroups", { status: "any" })).status).toBe(400);
    expect((await call("live")).status).toBe(200);
    expect((await call("live", { since: "x" })).status).toBe(400);
  });
});

const ACTIONS: readonly [string, Record<string, unknown>][] = [
  ["reportStatus", { source: "ai", key: `${PLAYER}:${GAME}`, status: "dismissed" }],
  ["suspend", { playerId: PLAYER, mode: "suspend", days: 7 }],
  ["unsuspend", { playerId: PLAYER }],
  ["deviceBan", { playerId: PLAYER, ban: true }],
  ["hidePlayer", { playerId: PLAYER, hidden: true }],
  ["hideWin", { winId: GAME, hidden: true }],
  ["rename", { playerId: PLAYER, username: "Fresh_Name" }],
  ["resetProfile", { playerId: PLAYER, field: "avatar" }],
  ["deletePlayer", { playerId: PLAYER, confirm: true }],
];
const STORE_METHOD: Readonly<Record<string, string>> = { reportStatus: "setReportStatus" };

describe("guarded actions", () => {
  it.each(ACTIONS)("%s needs a reason, then runs once with the admin, address marker and trimmed reason", async (op, params) => {
    const { store, call } = world();
    const method = STORE_METHOD[op] ?? op;
    const spy = vi.spyOn(store, method as "unsuspend");
    for (const reason of [undefined, "", "  a ", "x".repeat(501), 7]) {
      const answer = await call(op, reason === undefined ? params : { ...params, reason });
      expect(answer).toMatchObject({ status: 400, body: { code: "reason" } });
    }
    expect(spy).not.toHaveBeenCalled();
    const answer = await call(op, { ...params, reason: `  ${REASON} ` });
    expect(answer.status).toBe(200);
    expect((answer.body as { done: boolean }).done).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toEqual({ adminId: ADMIN_ID, ipHash: expect.any(String), reason: REASON });
  });
  it.each(ACTIONS)("%s uses the write limit and refuses a token without the second factor", async (op, params) => {
    const { w, call } = world();
    w.store.state.limits.set("admin:write:user:", 1);
    expect((await call(op, { ...params, reason: REASON })).status).toBe(200);
    expect((await call(op, { ...params, reason: REASON })).status).toBe(429);
    const pending = passwordToken();
    w.auth.state.valid.add(pending);
    expect((await handleAdminApi(request({ op, params: { ...params, reason: REASON } }, bearer(pending)), w)).status).toBe(403);
  });
  it("answers 404 when the target no longer exists", async () => {
    const { store, call } = world();
    store.unsuspend = async () => false;
    store.suspend = async () => null;
    store.rename = async () => "notFound";
    expect((await call("unsuspend", { playerId: PLAYER, reason: REASON })).status).toBe(404);
    expect((await call("suspend", { playerId: PLAYER, mode: "ban", reason: REASON })).status).toBe(404);
    expect((await call("rename", { playerId: PLAYER, username: "Fresh_Name", reason: REASON })).status).toBe(404);
  });
  it("computes the end from the server clock and maps each mode to its audit action", async () => {
    const { store, call } = world();
    const spy = vi.spyOn(store, "suspend");
    await call("suspend", { playerId: PLAYER, mode: "suspend", days: 7, reason: REASON });
    expect(spy.mock.calls[0]!.slice(1)).toEqual([PLAYER, new Date(NOW.getTime() + 7 * 86_400_000), false, "player.suspend"]);
    await call("suspend", { playerId: PLAYER, mode: "change", days: 30, reason: REASON });
    expect(spy.mock.calls[1]![4]).toBe("player.extend");
    const banned = await call("suspend", { playerId: PLAYER, mode: "ban", reason: REASON });
    expect(spy.mock.calls[2]!.slice(2)).toEqual([null, true, "player.ban"]);
    expect((banned.body as { message: string }).message).toBe("Banned permanently.");
  });
  it.each([{ days: 0 }, { days: 3651 }, { days: 1.5 }, { days: "7" }, {}, { mode: "ban", days: 7 }, { mode: "forever", days: 7 }, { playerId: "x", days: 7 }])("refuses suspension %j", async (change) => {
    const { store, call } = world();
    const spy = vi.spyOn(store, "suspend");
    expect((await call("suspend", { playerId: PLAYER, mode: "suspend", reason: REASON, ...change })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
  it("matches report keys to their source", async () => {
    const { store, call } = world();
    const spy = vi.spyOn(store, "setReportStatus");
    for (const params of [{ source: "ai", key: GAME }, { source: "room", key: `${PLAYER}:${GAME}` }, { source: "ai", key: "x:y" }, { source: "ai", key: `${PLAYER}:${GAME}`, status: "closed" }])
      expect((await call("reportStatus", { status: "reviewed", ...params, reason: REASON })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect((await call("reportStatus", { source: "room", key: GAME, status: "actioned", reason: REASON })).status).toBe(200);
    expect(spy.mock.calls[0]!.slice(1)).toEqual(["room", GAME, "actioned"]);
  });
  it("applies the game's username rules and its comparison key, and reports a taken name", async () => {
    const { store, call } = world();
    const spy = vi.spyOn(store, "rename");
    for (const username of ["ab", "has space", "9Lives", "bad__name", "admin"]) expect((await call("rename", { playerId: PLAYER, username, reason: REASON })).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    await call("rename", { playerId: PLAYER, username: "Fresh_Name", reason: REASON });
    expect(spy.mock.calls[0]!.slice(1)).toEqual([PLAYER, "Fresh_Name", "fresh_name"]);
    store.rename = async () => "taken";
    expect(await call("rename", { playerId: PLAYER, username: "Fresh_Name", reason: REASON })).toMatchObject({ status: 409, body: { code: "taken" } });
  });
  it("deletes only with an explicit confirmation and toggles only with true or false", async () => {
    const { store, call } = world();
    const remove = vi.spyOn(store, "deletePlayer"), hide = vi.spyOn(store, "hidePlayer");
    for (const confirm of [undefined, "yes", 1]) expect((await call("deletePlayer", { playerId: PLAYER, confirm, reason: REASON })).status).toBe(400);
    for (const hidden of [undefined, "true", 1]) expect((await call("hidePlayer", { playerId: PLAYER, hidden, reason: REASON })).status).toBe(400);
    expect((await call("resetProfile", { playerId: PLAYER, field: "username", reason: REASON })).status).toBe(400);
    expect(remove).not.toHaveBeenCalled(); expect(hide).not.toHaveBeenCalled();
    expect((await call("hidePlayer", { playerId: PLAYER, hidden: false, reason: REASON })).body).toMatchObject({ message: "Player shown again." });
  });
  it("keeps storage errors private", async () => {
    const { store, w, call } = world();
    store.deletePlayer = async () => { throw new Error("private database detail"); };
    const answer = await call("deletePlayer", { playerId: PLAYER, confirm: true, reason: REASON });
    expect(answer.status).toBe(503);
    expect(JSON.stringify([answer, w.logged])).not.toContain("private database detail");
  });
});

describe("phase 3 storage adapter", () => {
  function adapter(answers: Record<string, unknown> = {}) {
    const sent: { rpc: string; params: Record<string, unknown> }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const rpc = String(input).split("/").at(-1)!;
      sent.push({ rpc, params: JSON.parse(String(init?.body ?? "{}")) });
      const broken = answers[rpc] === "broken", answer = rpc in answers ? answers[rpc] : true;
      return new Response(JSON.stringify(broken ? { code: "42501", message: "private" } : answer), { status: broken ? 400 : 200, headers: { "content-type": "application/json" } });
    };
    return { store: createSupabaseAdminStore("https://project.supabase.co", "sb_secret_test", fetcher), sent };
  }
  const context = { adminId: ADMIN_ID, ipHash: "hash", reason: REASON };
  it("sends every action with the admin, the address marker and the reason, in one call", async () => {
    const { store, sent } = adapter({ admin_suspend: "2026-11-23T12:00:00+00:00", admin_force_rename: "taken" });
    expect(await store.suspend(context, PLAYER, new Date("2026-11-23T12:00:00Z"), false, "player.suspend")).toBe("2026-11-23T12:00:00.000Z");
    expect(await store.rename(context, PLAYER, "Fresh_Name", "fresh_name")).toBe("taken");
    expect(await store.setReportStatus(context, "ai", `${PLAYER}:${GAME}`, "dismissed")).toBe(true);
    expect(sent).toEqual([
      { rpc: "admin_suspend", params: { p_admin: ADMIN_ID, p_ip_hash: "hash", p_player: PLAYER, p_until: "2026-11-23T12:00:00.000Z", p_permanent: false, p_action: "player.suspend", p_reason: REASON } },
      { rpc: "admin_force_rename", params: { p_admin: ADMIN_ID, p_ip_hash: "hash", p_player: PLAYER, p_username: "Fresh_Name", p_username_key: "fresh_name", p_reason: REASON } },
      { rpc: "admin_set_report_status", params: { p_admin: ADMIN_ID, p_ip_hash: "hash", p_source: "ai", p_key: `${PLAYER}:${GAME}`, p_status: "dismissed", p_note: REASON } },
    ]);
  });
  it("treats anything but true as a missing target, and throws only the error code", async () => {
    const { store } = adapter({ admin_unsuspend: false, admin_suspend: null });
    expect(await store.unsuspend(context, PLAYER)).toBe(false);
    expect(await store.suspend(context, PLAYER, null, true, "player.ban")).toBeNull();
    await expect(adapter({ admin_delete_player: "broken" }).store.deletePlayer(context, PLAYER)).rejects.toThrow("storage error 42501");
  });
  it("maps reports, groups and live counts from the database's shapes", async () => {
    const { store, sent } = adapter({
      admin_reports: [{ source: "room", key: GAME, reported_id: PLAYER, reported: "P", reporter_id: ADMIN_ID, reporter: "R", reason: "Rude chat", detail: null, game: "ABC", level: null, created_at: "2026-11-16 10:00:00+00", status: "weird", review_note: null }],
      admin_report_groups: [{ player_id: PLAYER, username: "P", country: "PK", reports: "4", reporters: "2", open: "3", last_at: "2026-11-16 10:00:00+00", suspended_until: null, hidden: false }],
    });
    expect((await store.reports({ status: null, source: "room", playerId: null, before: { at: "2026-11-17T00:00:00.000Z", key: GAME }, limit: 26 }))[0]).toMatchObject({ source: "room", status: "open", createdAt: "2026-11-16T10:00:00.000Z" });
    expect(sent[0]).toEqual({ rpc: "admin_reports", params: { p_status: null, p_source: "room", p_player: null, p_before: "2026-11-17T00:00:00.000Z", p_before_key: GAME, p_limit: 26 } });
    expect(await store.reportGroups("open", 50)).toEqual([{ playerId: PLAYER, username: "P", country: "PK", reports: 4, reporters: 2, open: 3, lastAt: "2026-11-16T10:00:00.000Z", suspendedUntil: null, hidden: false }]);
    expect(toReportRow({ source: "ai", key: "k", reported_id: PLAYER, reported: "P", reason: "abandoned", level: "2", created_at: "2026-11-16", status: "actioned" })).toMatchObject({ reporter: "AI", level: 2, status: "actioned" });
    expect(toLiveData({ online: "3", modes: { ai: "2" }, levels: { 1: "2" }, countries: [{ country: null, n: "3", ai: "2", two: "0", online: "1" }], roomGames: [], rooms: false }))
      .toEqual({ online: 3, modes: { ai: 2 }, levels: { 1: 2 }, countries: [{ country: "", n: 3, ai: 2, two: 0, online: 1 }], roomGames: [], rooms: false });
    expect(() => toLiveData(null)).toThrow("storage error noRow");
  });
});

describe("phase 3 screens", () => {
  const players = demoPlayers(NOW), reports = demoReports(players, NOW);
  it.each([Reports, Suspensions, Live])("shows loading without fabricating records", (Component) => {
    const html = renderToStaticMarkup(createElement(Component));
    expect(html).toContain("Loading"); expect(html).toContain('aria-busy="true"'); expect(html).not.toContain("Player_");
  });
  it("lists players with reports, open first, with their different reporters", () => {
    const groups = demoReportGroups(reports, players, "open");
    expect(groups.map((row) => row.open)).toEqual([...groups.map((row) => row.open)].sort((a, b) => b - a));
    expect(groups.every((row) => row.reporters <= row.reports)).toBe(true);
    const html = renderToStaticMarkup(createElement(ReportGroups, { rows: groups, onShow: () => {}, onSuspend: () => {}, onLift: () => {} }));
    for (const text of ["Show reports", "Reporters", "Open", groups[0]!.username]) expect(html).toContain(text);
    expect(renderToStaticMarkup(createElement(ReportGroups, { rows: [], onShow: () => {}, onSuspend: () => {}, onLift: () => {} }))).toContain("No players with reports");
  });
  it("offers only the status changes that fit each report and escapes what players wrote", () => {
    const open = { ...reports[1]!, status: "open" as const, reason: "<b>rude</b>" }, closed = { ...reports[0]!, status: "dismissed" as const };
    const html = renderToStaticMarkup(createElement(ReportRows, { rows: [open, closed], onStatus: () => {} }));
    expect(html).toContain("Dismiss"); expect(html).toContain("Open again"); expect(html).toContain("&lt;b&gt;rude");
    expect(html).not.toContain("<b>rude");
  });
  it("pages sample reports without repeats", () => {
    const first = demoReportPage(reports, { limit: 10 }), second = demoReportPage(reports, { limit: 10, cursor: first.next! });
    expect(new Set([...first.rows, ...second.rows].map((row) => row.key)).size).toBe(20);
    expect(demoReportPage(reports, { status: "open", source: "room" }).rows.every((row) => row.status === "open" && row.source === "room")).toBe(true);
  });
  it("counts days left as the player sees them and offers the actions that fit", () => {
    const base = players[0]!;
    expect(daysLeft({ ...base, suspendedUntil: new Date(NOW.getTime() + 1.2 * 86_400_000).toISOString(), suspensionKind: "admin" }, NOW)).toBe(2);
    expect(daysLeft({ ...base, suspendedUntil: "9999-12-31T00:00:00Z", suspensionKind: "permanent" }, NOW)).toBeNull();
    expect(daysLeft({ ...base, suspendedUntil: "2026-01-01T00:00:00Z", suspensionKind: "admin" }, NOW)).toBeNull();
    const suspended = renderToStaticMarkup(createElement(SuspensionTable, { rows: [{ ...base, suspendedUntil: "2026-12-01T00:00:00Z", suspensionKind: "reports" }], tab: "suspended", now: NOW, onAction: () => {} }));
    for (const text of ["Change", "Lift", "Ban", "AI reports", "15"]) expect(suspended).toContain(text);
    const device = renderToStaticMarkup(createElement(SuspensionTable, { rows: [{ ...base, deviceBanned: true }], tab: "device", now: NOW, onAction: () => {} }));
    expect(device).toContain("Unban device"); expect(device).not.toContain(">Lift<");
  });
  it("shows live counts by mode, level and flag, and says when rooms are not installed", () => {
    const html = renderToStaticMarkup(createElement(LiveContent, { data: demoLive(players, false, NOW) }));
    for (const text of ["In a game now", "Against the AI", "Strongest", "Pakistan", "No flag", players[2]!.username, "devices, last seen within 75 seconds"]) expect(html).toContain(text);
    // D113: the four AI levels are a breakdown inside the Against the AI tile, each with its count.
    const data = demoLive(players, false, NOW);
    const tile = /<div class="adm-stat[^"]*adm-tile-wide">([\s\S]*?)<\/dd><\/div>/.exec(html)?.[1] ?? "";
    expect(tile).toContain("Against the AI");
    LEVEL_NAMES.forEach((name, index) => expect(tile).toContain(`>${name}</span><strong class="adm-num">${data.levels[String(index + 1)] ?? 0}</strong>`));
    expect(renderToStaticMarkup(createElement(LiveContent, { data: { ...demoLive(players, true), rooms: false } }))).toContain("not installed yet");
  });
  it("makes every action ask for a reason, and guards renames and deletes on the page too", () => {
    const target = { id: PLAYER, username: "Player_01" };
    const html = renderToStaticMarkup(createElement(ActionDialog, { request: act.deletePlayer(target), onClose: () => {}, onDone: () => {} }));
    for (const text of ["Delete Player_01", "cannot be undone", "Type the username", "Reason (kept in the audit log)", "required", 'minLength="3"', 'maxLength="500"']) expect(html).toContain(text);
    expect(act.deletePlayer(target).ready!({ _typed: "player_01" })).toBe(false);
    expect(act.deletePlayer(target).ready!({ _typed: "Player_01" })).toBe(true);
    expect(act.rename(target).ready!({ username: "bad name" })).toBe(false);
    expect(act.rename(target).ready!({ username: "Good_Name" })).toBe(true);
    expect(act.ban(target).danger).toBe(true);
    expect(act.suspend(target).params).toEqual({ playerId: PLAYER, mode: "suspend" });
    expect(act.suspend(target, true).params).toEqual({ playerId: PLAYER, mode: "change" });
  });
});
