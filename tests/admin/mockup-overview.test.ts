// D111: the overview redrawn from the owner's mockup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { change, overviewCsv, overviewRange, periodSums, previousRange } from "../../src/admin/analytics";
import type { DailyTotals, OverviewData } from "../../src/admin/analytics";
import { axisIndexes, Chart, chartTicks, shortDay, shownDates } from "../../src/admin/shell/Chart";
import { demoOverview } from "../../src/admin/dev/demo";
import { GROUPS, SECTIONS, sectionFromPath } from "../../src/admin/shell/sections";
import { LevelPanel, NeedsAttention, OverviewNumbers, RegistrationsPanel, resultParts, ResultsPanel, WeekPanel } from "../../src/admin/shell/OverviewStats";
import { donutArcs, percentOf } from "../../src/admin/shell/Visuals";
import { AiGames, registrationWeeks, Settings } from "../../src/admin/shell/Insights";
import { publishBadges } from "../../src/admin/shell/frame";

const day = (date: string, values: Partial<DailyTotals> = {}): DailyTotals => ({ day: date, registrations: 0, deletions: 0, registered: 0, visitors: 0, active: 0,
  games: 0, wins: 0, losses: 0, draws: 0, resigned: 0, abandoned: 0, onlineGames: 0, ...values });
const now = new Date("2026-11-18T12:00:00Z");

describe("the window before, for the change arrows", () => {
  it("is the same length and ends the day before; all time has none", () => {
    expect(previousRange(overviewRange("7", now))).toEqual({ from: "2026-11-05", to: "2026-11-11" });
    expect(previousRange(overviewRange("30", now))).toEqual({ from: "2026-09-20", to: "2026-10-19" });
    expect(previousRange(overviewRange("90", new Date("2024-03-01T00:00:00Z")))).toMatchObject({ to: "2023-12-02" });
    expect(previousRange(overviewRange("all", now))).toBeNull();
  });
  it("adds up a window, with the profiles at its last day", () => {
    expect(periodSums([day("2026-11-01", { registrations: 2, registered: 10, visitors: 5, games: 3, wins: 1 }), day("2026-11-02", { registrations: 1, registered: 11, visitors: 4, games: 2, draws: 1 })]))
      .toEqual({ registrations: 3, registeredEnd: 11, visitors: 9, games: 5, wins: 1, losses: 0, draws: 1, resigned: 0, abandoned: 0 });
    expect(periodSums([])).toMatchObject({ registrations: 0, registeredEnd: 0 });
  });
  it("gives a whole percent, and none when nothing came before", () => {
    expect(change(60, 40)).toEqual({ delta: 20, percent: 50 });
    expect(change(33, 28)).toEqual({ delta: 5, percent: 18 });
    expect(change(5, 10)).toEqual({ delta: -5, percent: -50 });
    expect(change(4, 0)).toEqual({ delta: 4, percent: null });
    expect(change(0, 0)).toEqual({ delta: 0, percent: null });
  });
});

describe("headline cards", () => {
  const data = demoOverview("30", false, now);
  it("compare with the previous window, and Active Today with yesterday", () => {
    const html = renderToStaticMarkup(createElement(OverviewNumbers, { data }));
    expect(html.match(/compared with the previous 30 days/g)).toHaveLength(3);
    expect(html).toContain("compared with yesterday");
    expect(html).toMatch(/adm-change-(up|down|flat)/);
    expect(html).not.toContain("style=");
  });
  it("say Needs review only while reports are open", () => {
    const quiet: OverviewData = { ...data, totals: { ...data.totals, openReports: 0 } };
    expect(renderToStaticMarkup(createElement(OverviewNumbers, { data }))).toContain("Needs review");
    expect(renderToStaticMarkup(createElement(OverviewNumbers, { data: quiet }))).toContain("All clear");
  });
  it("leave out arrows for all time", () => {
    const html = renderToStaticMarkup(createElement(OverviewNumbers, { data: demoOverview("all", false, now) }));
    expect(html).not.toContain("compared with the previous"); expect(html).toContain("compared with yesterday");
  });
});

describe("mockup panels", () => {
  const data = demoOverview("30", false, now);
  it("split AI results into wins, losses and draws that add up to the games", () => {
    const parts = resultParts(data);
    expect(parts.map((part) => part.label)).toEqual(["Player wins", "Player losses", "Draws"]);
    expect(parts.reduce((sum, part) => sum + part.value, 0)).toBe(data.totals.games);
    const html = renderToStaticMarkup(createElement(ResultsPanel, { data }));
    expect(html).toContain(`>${data.totals.games.toLocaleString("en-GB")}</strong><span>Games`);
  });
  it("draw donut arcs clockwise that close the ring", () => {
    const arcs = donutArcs([42, 48, 10]);
    expect(arcs[0]![0]).toBe(0);
    expect(arcs[1]![0]).toBeCloseTo(arcs[0]![1]);
    expect(arcs[2]![0] + arcs[2]![1]).toBeCloseTo(2 * Math.PI * 46);
    expect(donutArcs([0, 0])).toEqual([[0, 0], [0, 0]]);
    expect(percentOf(1, 3)).toBe(33); expect(percentOf(1, 0)).toBe(0);
  });
  it("show the last seven days by weekday, with their numbers in a table", () => {
    const html = renderToStaticMarkup(createElement(WeekPanel, { data }));
    expect(html.match(/class="adm-column"/g)).toHaveLength(7);
    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) expect(html).toContain(`>${name}<`);
    expect(html).toContain("Active players on each of the last 7 days");
    expect(html).not.toContain("style=");
  });
  it("orders levels from Strongest to Easy as split bars", () => {
    const html = renderToStaticMarkup(createElement(LevelPanel, { data }));
    const order = ["Strongest", "Hard", "Medium", "Easy"].map((name) => html.indexOf(`</svg>${name}</span>`));
    expect(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1]!))).toBe(true);
    expect(html).toContain("Player wins"); expect(html).toContain("Player losses");
  });
  it("compares registrations with the window before", () => {
    const html = renderToStaticMarkup(createElement(RegistrationsPanel, { data }));
    expect(html).toContain("New registrations"); expect(html).toContain("vs. previous 30 days");
  });
  it("links what needs attention to Reports and Suspensions", () => {
    const html = renderToStaticMarkup(createElement(NeedsAttention, { data }));
    for (const label of ["Open reports", "Suspended players", "Pending reviews"]) expect(html).toContain(label);
    expect(html).toContain('href="/admin/reports"'); expect(html).toContain('href="/admin/suspensions"');
    expect(html).toContain('adm-count adm-count-red">8<');
  });
});

describe("chart axes (D111)", () => {
  it("rounds ticks up to the mockup's steps", () => {
    expect(chartTicks(217)).toEqual({ top: 250, ticks: [0, 50, 100, 150, 200, 250] });
    expect(chartTicks(80)).toEqual({ top: 80, ticks: [0, 20, 40, 60, 80] });
    expect(chartTicks(5)).toEqual({ top: 5, ticks: [0, 1, 2, 3, 4, 5] });
    expect(chartTicks(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(chartTicks(NaN).top).toBe(1);
    for (const value of [3, 17, 99, 101, 1234, 98765]) {
      const { top, ticks } = chartTicks(value);
      expect(top).toBeGreaterThanOrEqual(value); expect(ticks.length).toBeLessThanOrEqual(6); expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });
  it("spreads at most 11 dates, always the first and the last", () => {
    expect(axisIndexes(0)).toEqual([]); expect(axisIndexes(1)).toEqual([0]); expect(axisIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const thirty = axisIndexes(30);
    expect(thirty).toHaveLength(11); expect(thirty[0]).toBe(0); expect(thirty.at(-1)).toBe(29);
    expect(shortDay("2026-11-11")).toBe("11 Nov"); expect(shortDay("Week 3")).toBe("Week 3");
  });
  it("labels the axes and keeps the table for screen readers when asked", () => {
    const html = renderToStaticMarkup(createElement(Chart, { title: "Players & Visitors", data: "hidden", labels: ["2026-10-21", "2026-10-22", "2026-10-23"],
      series: [{ label: "Visitors", values: [100, 217, 150] }, { label: "Active players", values: [40, 74, 50] }] }));
    for (const tick of [">0<", ">50<", ">250<"]) expect(html).toContain(tick);
    expect(html).toContain(">21 Oct<"); expect(html).toContain(">23 Oct<");
    expect(html).not.toContain("Show data"); expect(html).toContain('class="adm-sr"><table');
    expect(html).not.toContain("style=");
  });
});

describe("export", () => {
  it("writes the daily rows as CSV with a header", () => {
    const data = demoOverview("7", false, now);
    const lines = overviewCsv(data).trimEnd().split("\r\n");
    expect(lines[0]).toBe("day,registrations,deletions,registered,visitors,active,games,wins,losses,draws,resigned,abandoned,onlineGames");
    expect(lines).toHaveLength(8);
    expect(lines[1]!.split(",")[0]).toBe(data.daily[0]!.day);
    expect(lines.slice(1).every((line) => /^\d{4}-\d{2}-\d{2}(,\d+){12}$/.test(line))).toBe(true);
  });
});

describe("sections from the mockup", () => {
  it("group every section once, in the mockup's order", () => {
    expect(GROUPS.map((group) => group.label)).toEqual([null, "Players", "Game Analytics", "Moderation", "System"]);
    expect(SECTIONS.map((section) => section.label)).toEqual(["Overview", "All Players", "Live Players", "Leaderboard", "AI Games", "Game Results",
      "Activity & Retention", "Reports", "Suspensions", "Resignations", "Countries", "Audit Log", "Settings"]);
    expect(new Set(SECTIONS.map((section) => section.id)).size).toBe(SECTIONS.length);
    expect(SECTIONS.every((section) => section.subtitle.length > 0 && !/[-–—]/.test(section.subtitle))).toBe(true);
  });
  it("reads paths with a hyphen and falls back to the overview", () => {
    expect(sectionFromPath("/admin/ai-games").label).toBe("AI Games");
    expect(sectionFromPath("/admin/activity/").label).toBe("Activity & Retention");
    expect(sectionFromPath("/admin/unknown").id).toBe("overview");
    expect(sectionFromPath("/admin/../players").id).toBe("overview");
  });
  it("render the analytics and settings pages without inline styles", () => {
    publishBadges({ onlineNow: 1, openReports: 2, suspended: 3 });
    expect(renderToStaticMarkup(createElement(AiGames))).toContain("Loading statistics");
    const settings = renderToStaticMarkup(createElement(Settings, { email: "owner@example.com" }));
    expect(settings).toContain("owner@example.com"); expect(settings).toContain("Sign out"); expect(settings).not.toContain("style=");
  });
});

describe("axis dates and weekly registrations (D111)", () => {
  it("thins dates at an even step until none touch, keeping the last", () => {
    const at = (lefts: number[], width = 40) => lefts.map((left) => [left, left + width] as const);
    expect(shownDates(at([0, 50, 100, 150]), 8)).toEqual([true, true, true, true]);
    expect(shownDates(at([0, 30, 60, 90, 120]), 8)).toEqual([true, false, true, false, true]);
    // The date before the last is dropped when it would touch the last.
    expect(shownDates(at([0, 50, 100, 130]), 8)).toEqual([true, true, false, true]);
    expect(shownDates([], 8)).toEqual([]);
  });
  it("adds registrations up by Monday weeks", () => {
    const data = demoOverview("30", false, now);
    const weeks = registrationWeeks(data);
    expect(weeks.reduce((sum, [, n]) => sum + n, 0)).toBe(data.daily.reduce((sum, row) => sum + row.registrations, 0));
    expect(weeks.every(([week]) => new Date(`${week}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });
});
