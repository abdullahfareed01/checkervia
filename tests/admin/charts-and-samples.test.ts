import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chart, chartArea, chartPath, nearestChartIndex } from "../../src/admin/shell/Chart";
import { demoOverview, demoPlayers } from "../../src/admin/dev/demo";
import { DataSourceBar } from "../../src/admin/shell/DataSourceBar";

describe("interactive chart geometry", () => {
  it("selects the nearest date accurately across the plot and clamps edges", () => {
    expect(nearestChartIndex(36, 7)).toBe(0); expect(nearestChartIndex(464, 7)).toBe(6);
    expect(nearestChartIndex(250, 7)).toBe(3); expect(nearestChartIndex(-100, 7)).toBe(0);
    expect(nearestChartIndex(700, 7)).toBe(6); expect(nearestChartIndex(250, 1)).toBe(0);
    expect(nearestChartIndex(250, 0)).toBeNull(); expect(nearestChartIndex(NaN, 7)).toBeNull();
  });
  it("closes a faded area on the baseline without inventing extra data", () => {
    expect(chartArea([], 0)).toBe("");
    expect(chartArea([0, 10], 10)).toBe("M36.0,146.0 L464.0,18.0 L464.0,146 L36.0,146 Z");
    expect(chartPath([NaN, Infinity, -2], Infinity)).not.toMatch(/NaN|Infinity/);
  });
  it("provides isolated gradients, keyboard instructions and tables without inline styles", () => {
    const props = { title: "Games", labels: ["2026-11-17", "2026-11-18"], series: [{ label: "Wins", values: [2, 4] }] };
    const html = renderToStaticMarkup(createElement("div", null, createElement(Chart, props), createElement(Chart, props)));
    const ids = [...html.matchAll(/linearGradient id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
    expect(html).toContain('stop-opacity="0.25"'); expect(html).toContain('stop-opacity="0"');
    expect(html).toContain('aria-roledescription="interactive chart"'); expect(html).toContain('tabindex="0"');
    expect(html).toContain("arrow keys"); expect(html).toContain("Show data"); expect(html).not.toContain("style=");
  });
});

describe("removable sample experience", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("keeps current totals stable as periods change, with no fake database seed", () => {
    const week = demoOverview("7", false, now), month = demoOverview("30", false, now), all = demoOverview("all", false, now);
    expect(week.totals.registered).toBe(60); expect(month.totals.registered).toBe(60); expect(all.totals.registered).toBe(60);
    expect(demoPlayers(now)).toHaveLength(60); expect(week.daily).toHaveLength(7); expect(all.daily).toHaveLength(90);
    expect(month.daily.slice(-7)).toEqual(week.daily); expect(week.totals.games).toBeLessThan(month.totals.games);
    expect(week.totals.onlineNow).toBe(all.totals.onlineNow);
  });
  it("keeps graph totals, level totals and all game outcomes consistent", () => {
    const data = demoOverview("30", false, now);
    expect(data.totals.games).toBe(data.daily.reduce((sum, day) => sum + day.games, 0));
    expect(data.totals.games).toBe(data.totals.levels.reduce((sum, row) => sum + row.games, 0));
    data.daily.forEach((day) => { expect(day.games).toBe(day.wins + day.losses + day.draws); expect(day.active).toBeLessThanOrEqual(day.registered); });
    data.totals.levels.forEach((row) => { expect(row.games).toBe(row.wins + row.losses + row.draws); expect(row.resigned + row.abandoned).toBeLessThanOrEqual(row.losses); });
    expect(demoOverview("7", true, now).totals.games).toBe(0);
  });
  it("labels the live source and offers the game without linking public game users to admin", () => {
    const html = renderToStaticMarkup(createElement(DataSourceBar));
    expect(html).toContain("Game data"); expect(html).toContain('href="/"'); expect(html).toContain('rel="noopener noreferrer"');
  });
});
