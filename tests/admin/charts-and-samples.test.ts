import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chart, chartArea, chartPath, dayLabel, nearestChartIndex } from "../../src/admin/shell/Chart";
import { demoOverview, demoPlayers } from "../../src/admin/dev/demo";
import { DataSourceBar } from "../../src/admin/shell/DataSourceBar";

describe("interactive chart geometry", () => {
  it("selects the nearest date accurately across the plot and clamps edges", () => {
    expect(nearestChartIndex(0, 7)).toBe(0); expect(nearestChartIndex(500, 7)).toBe(6);
    expect(nearestChartIndex(250, 7)).toBe(3); expect(nearestChartIndex(-100, 7)).toBe(0);
    expect(nearestChartIndex(700, 7)).toBe(6); expect(nearestChartIndex(250, 1)).toBe(0);
    expect(nearestChartIndex(250, 0)).toBeNull(); expect(nearestChartIndex(NaN, 7)).toBeNull();
  });
  it("closes a faded area on the baseline without inventing extra data", () => {
    expect(chartArea([], 0)).toBe("");
    expect(chartArea([0, 10], 10)).toBe("M0.0,152.0 C166.7,104.0 333.3,56.0 500.0,8.0 L500.0,160 L0.0,160 Z");
    expect(chartPath([NaN, Infinity, -2], Infinity)).not.toMatch(/NaN|Infinity/);
  });
  it("runs edge to edge as a smooth curve that never overshoots the data (D109)", () => {
    const path = chartPath([0, 10, 0, 4, 4, 9], 10);
    expect(path.startsWith("M0.0,")).toBe(true); expect(path.endsWith("500.0,22.4")).toBe(true);
    const ys = [...path.matchAll(/[\d.]+,([\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(8); expect(Math.max(...ys)).toBeLessThanOrEqual(152);
    // A flat stretch stays flat: both controls between equal points keep their height.
    expect(path).toContain("C333.3,94.4 366.7,94.4 400.0,94.4");
  });
  it("names days for the pill and axis and leaves other labels alone", () => {
    expect(dayLabel("2026-11-09")).toBe("Mon 9 Nov"); expect(dayLabel("Week 3")).toBe("Week 3");
  });
  it("provides isolated gradients, keyboard instructions and tables without inline styles", () => {
    const props = { title: "Games", labels: ["2026-11-17", "2026-11-18"], series: [{ label: "Wins", values: [2, 4] }] };
    const html = renderToStaticMarkup(createElement("div", null, createElement(Chart, props), createElement(Chart, props)));
    const ids = [...html.matchAll(/linearGradient id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2);
    expect(html).toContain('stop-opacity="0.34"'); expect(html).toContain('stop-opacity="0.02"');
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
  it("shows no banner for game data; only sample data is called out (D111)", () => {
    expect(renderToStaticMarkup(createElement(DataSourceBar))).toBe("");
  });
  it("has a previous window for every bounded period and none for all time (D111)", () => {
    expect(demoOverview("all", false, now).previous).toBeNull();
    for (const period of ["7", "30", "90"] as const) {
      const data = demoOverview(period, false, now);
      expect(data.previous?.games).toBeGreaterThan(0); expect(data.previous?.visitors).toBeGreaterThan(0);
    }
    expect(demoOverview("30", true, now).previous?.games).toBe(0);
  });
});
