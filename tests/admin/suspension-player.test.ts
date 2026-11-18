// What a suspended player sees and keeps (D102): the days left, who
// suspended them, a moderator's lift or shorter suspension taking effect on
// the device at once, an expired one lifting by itself, and the server's
// answer before and after migration 7.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { conductStatus } from "../../netlify/leaderboard/handlers/reportAbandon";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";
import type { ConductStatus } from "../../src/leaderboard/protocol";
import { daysLeftText, SuspendedDialog } from "../../src/ui/ConductDialogs";
import { EMPTY_CONDUCT, isSuspended, parseConduct, shownConduct, withReport, withServer } from "../../src/ui/conduct";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-16T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const game = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`;
const text = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the days left", () => {
  it("rounds up to whole days and never shows 0 while suspended", () => {
    expect(daysLeftText(NOW + 30 * DAY, NOW)).toBe("30 days left");
    expect(daysLeftText(NOW + 29 * DAY + 1, NOW)).toBe("30 days left");
    expect(daysLeftText(NOW + 3_600_000, NOW)).toBe("1 day left");
    expect(daysLeftText(NOW + 1, NOW)).toBe("1 day left");
  });
});

describe("the suspended popup", () => {
  const show = (kind: "reports" | "admin" | "permanent" | undefined, until = NOW + 12 * DAY) => text(createElement(SuspendedDialog, { until, kind, now: NOW, onClose: () => {} }));

  it("says how many days are left and who suspended the account, calmly, without dashes", () => {
    const reports = show("reports");
    expect(reports).toContain("the AI reported you 4 times for not playing");
    expect(reports).toContain("12 days left");
    expect(reports).toContain("You can play the AI again on 28 November 2026");
    const moderator = show("admin");
    expect(moderator).toContain("suspended by a moderator");
    expect(moderator).toContain("12 days left");
    const permanent = show("permanent", Date.parse("9999-12-31T00:00:00Z"));
    expect(permanent).toContain("suspended by a moderator");
    expect(permanent).not.toMatch(/days? left|9999/);
    expect(permanent).toContain("Games against the AI are closed for this account");
    for (const shown of [reports, moderator, permanent]) {
      expect(shown).toContain("Two players and Learn are open. Your wins and stats are kept.");
      expect(shown).toContain("checkervia.games@gmail.com");
      expect(shown.replace("checkervia.games@gmail.com", "")).not.toMatch(/[-‐-―−]/);
    }
    // A device from before D102 knows no kind: the AI's reports.
    expect(show(undefined)).toContain("the AI reported you");
  });
});

describe("a moderator's change on the device", () => {
  const suspendedByAi = withReport(withReport(withReport(withReport(EMPTY_CONDUCT, { gameId: game(1), level: 2, phase: "middle" }, NOW).conduct, { gameId: game(2), level: 2, phase: "middle" }, NOW).conduct, { gameId: game(3), level: 2, phase: "middle" }, NOW).conduct, { gameId: game(4), level: 2, phase: "middle" }, NOW).conduct;
  const sent = { ...suspendedByAi, pending: [] };

  it("an older answer never shortens the device's suspension (as before)", () => {
    expect(sent.kind).toBe("reports");
    const old: ConductStatus = { reports: 0, totalReports: 4, suspendedUntil: null };
    expect(isSuspended(withServer(sent, old), NOW)).toBe(true);
  });

  it("an unsuspend lifts it at once, and the same revision again changes nothing", () => {
    const lifted: ConductStatus = { reports: 0, totalReports: 4, suspendedUntil: null, kind: null, revisedAt: iso(NOW + 1000) };
    const after = withServer(sent, lifted);
    expect(isSuspended(after, NOW + 2000)).toBe(false);
    expect(after.revisedAt).toBe(NOW + 1000);
    expect(after.totalReports).toBe(4);
    expect(shownConduct(sent, NOW + 2000, lifted).suspendedUntil).toBeNull();
    // A later suspension from the AI's reports on this device still counts.
    const again = { ...after, suspendedUntil: NOW + 5 * DAY, kind: "reports" as const };
    expect(isSuspended(withServer(again, lifted), NOW)).toBe(true);
  });

  it("a moderator's shorter or longer suspension replaces the device's, with its kind", () => {
    const shorter: ConductStatus = { reports: 0, totalReports: 4, suspendedUntil: iso(NOW + 2 * DAY), kind: "admin", revisedAt: iso(NOW) };
    expect(withServer(sent, shorter)).toMatchObject({ suspendedUntil: NOW + 2 * DAY, kind: "admin" });
    const banned: ConductStatus = { reports: 0, totalReports: 4, suspendedUntil: "9999-12-31T00:00:00.000Z", kind: "permanent", revisedAt: iso(NOW) };
    expect(withServer(EMPTY_CONDUCT, banned)).toMatchObject({ kind: "permanent" });
  });

  it("waits while a report of this device is still on its way", () => {
    const lifted: ConductStatus = { reports: 0, totalReports: 4, suspendedUntil: null, kind: null, revisedAt: iso(NOW + 1000) };
    expect(isSuspended(withServer(suspendedByAi, lifted), NOW)).toBe(true);
  });

  it("ends by itself when the date passes", () => {
    expect(isSuspended(sent, NOW + 31 * DAY)).toBe(false);
  });

  it("reads records saved before D102 as the AI's suspension, and keeps the new fields", () => {
    expect(parseConduct(JSON.stringify({ reports: 0, totalReports: 4, suspendedUntil: NOW + DAY, reported: [], pending: [] }))).toMatchObject({ kind: "reports" });
    const saved = parseConduct(JSON.stringify({ ...withServer(sent, { reports: 0, totalReports: 4, suspendedUntil: iso(NOW + DAY), kind: "admin", revisedAt: iso(NOW) }) }));
    expect(saved).toMatchObject({ kind: "admin", revisedAt: NOW, suspendedUntil: NOW + DAY });
  });
});

describe("the server's answer", () => {
  it("sends the kind and the revision from migration 7 on, and nothing new before it", async () => {
    let row: Record<string, unknown> = { reports: 0, total_reports: 4, suspended_until: "2026-11-20T00:00:00+00:00" };
    const fetchImpl = (async () => new Response(JSON.stringify(row), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const store = createSupabaseStore("https://p.supabase.co", "sb_secret_x", fetchImpl);
    expect(conductStatus(await store.conduct("p1"))).toEqual({ reports: 0, totalReports: 4, suspendedUntil: "2026-11-20T00:00:00.000Z" });
    row = { ...row, suspension_kind: "admin", revised_at: "2026-11-16T10:00:00+00:00" };
    expect(conductStatus(await store.conduct("p1"))).toEqual({
      reports: 0,
      totalReports: 4,
      suspendedUntil: "2026-11-20T00:00:00.000Z",
      kind: "admin",
      revisedAt: "2026-11-16T10:00:00.000Z",
    });
  });
});
