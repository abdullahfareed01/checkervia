// D113: the shared admin components and the type scale they carry.
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import type { FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ago, day } from "../../src/admin/shell/format";
import { Badge, Breakdown, DataTable, EmptyState, FlagName, HeroTile, SectionCard, StatTile, toneOf, When } from "../../src/admin/shell/ui";
import type { Column } from "../../src/admin/shell/ui";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const before = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const html = <P extends object>(type: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(type, props));

describe("relative times", () => {
  it("says recent moments in words and older ones as a date", () => {
    expect(ago(before(20_000), NOW)).toBe("Just now");
    expect(ago(before(5 * MINUTE), NOW)).toBe("5 min ago");
    expect(ago(before(HOUR), NOW)).toBe("1 hour ago");
    expect(ago(before(3 * HOUR), NOW)).toBe("3 hours ago");
    expect(ago(before(30 * HOUR), NOW)).toBe("Yesterday");
    expect(ago(before(4 * DAY), NOW)).toBe("4 days ago");
    expect(ago(before(9 * DAY), NOW)).toMatch(/^\d{1,2} Nov, \d\d:\d\d$/);
    expect(ago(new Date(NOW + DAY).toISOString(), NOW)).toMatch(/^\d{1,2} Nov, \d\d:\d\d$/);
  });
  it("keeps the exact time for machines and on hover", () => {
    const markup = html(When, { iso: before(5 * MINUTE), now: NOW });
    expect(markup).toContain(`dateTime="${before(5 * MINUTE)}"`);
    expect(markup).toMatch(/title="20 Nov, \d\d:\d\d">5 min ago</);
  });
  it("writes days in sentences without hyphens", () => {
    expect(day("2026-11-20")).toBe("20 Nov 2026");
  });
});

interface Row { readonly name: string; readonly games: number }
const COLUMNS: readonly Column<Row>[] = [
  { label: "Player", head: true, cell: (row) => row.name },
  { label: "Games", numeric: true, cell: (row) => row.games.toLocaleString("en-GB") },
  { label: "Actions", actions: true, cell: () => createElement("button", { type: "button" }, "Open") },
];

describe("the data table", () => {
  const markup = html<Parameters<typeof DataTable<Row>>[0]>(DataTable<Row>, { label: "Players", columns: COLUMNS, rows: [{ name: "Player_01", games: 1200 }], rowKey: (row: Row) => row.name, empty: { title: "No players.", text: "Players appear here." } });
  it("is a labelled scroll region with a caption, row headers and numbers marked for right alignment", () => {
    expect(markup).toContain('class="adm-table-scroll" tabindex="0" role="region" aria-label="Players"');
    expect(markup).toContain('<caption class="adm-sr">Players</caption>');
    expect(markup).toContain('<th scope="row" class="adm-row-head">Player_01</th>');
    expect(markup).toContain('<th scope="col" class="adm-cell-num">Games</th>');
    expect(markup).toContain('<td class="adm-cell-num" data-label="Games">1,200</td>');
  });
  it("labels each cell for the card layout and keeps the actions header for screen readers", () => {
    expect(markup).toContain('<span class="adm-sr">Actions</span>');
    expect(markup).toContain('<div class="adm-row-actions"><button type="button">Open</button></div>');
  });
  it("says what will appear when there are no rows", () => {
    const empty = html<Parameters<typeof DataTable<Row>>[0]>(DataTable<Row>, { label: "Players", columns: COLUMNS, rows: [], rowKey: (row: Row) => row.name, empty: { title: "No players.", text: "Players appear here as they join." } });
    expect(empty).not.toContain("<table");
    expect(empty).toContain('<p class="adm-empty-title">No players.</p><p class="adm-empty-text">Players appear here as they join.</p>');
    expect(html(EmptyState, { title: "Nothing yet.", text: "It shows here." })).toContain("adm-empty-state");
  });
});

describe("tiles, cards, badges and flags", () => {
  it("shows key numbers formatted, with a hero for the main one", () => {
    expect(renderToStaticMarkup(createElement("dl", null, createElement(StatTile, { label: "Games", value: 12345, icon: "gamepad" })))).toMatch(/<dt class="adm-stat-label">.*<span>Games<\/span><\/dt><dd><span class="adm-stat-value adm-num">12,345<\/span>/);
    const hero = html(HeroTile, { icon: "live", label: "In a game now", value: 12, note: "12 devices, last seen within 75 seconds" });
    expect(hero).toContain('<p class="adm-hero-value adm-num">12</p><p class="adm-hero-note">12 devices, last seen within 75 seconds</p>');
    expect(hero).toMatch(/<h2 id="[^"]+" class="adm-hero-label">/);
  });
  it("breaks a whole into labelled numbers beside a picture of the shares", () => {
    const markup = html(Breakdown, { label: "By level", parts: [{ label: "Easy", value: 3 }, { label: "Hard", value: 1 }] });
    expect(markup).toContain('aria-hidden="true"><span class="adm-breakdown-part adm-level-1" data-w="75.00"></span><span class="adm-breakdown-part adm-level-2" data-w="25.00">');
    expect(markup).toContain('<ul class="adm-breakdown-list" aria-label="By level">');
    expect(markup).toContain('<span class="adm-breakdown-name">Easy</span><strong class="adm-num">3</strong>');
  });
  it("titles a card with a heading it is labelled by", () => {
    const markup = html(SectionCard, { title: "By flag", note: "Current totals.", level: 3 });
    const id = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`<h3 id="${id}" class="adm-panel-title"><span>By flag</span></h3>`);
    expect(markup).toContain('<p class="adm-card-note">Current totals.</p>');
  });
  it("says a status in words, with its colour only repeating them", () => {
    expect(html(Badge, { tone: toneOf("Suspended"), children: "Suspended" })).toBe('<span class="adm-badge adm-badge-warn">Suspended</span>');
    expect(["Open", "Banned", "Device banned", "Refused"].map(toneOf)).toEqual(["danger", "danger", "danger", "danger"]);
    expect(["Active", "Reviewed", "Hidden", "Something new"].map(toneOf)).toEqual(["ok", "ok", "neutral", "neutral"]);
  });
  it("shows the chosen flag's picture beside the country name, or a plain outline", () => {
    const pakistan = html(FlagName, { code: "PK" });
    expect(pakistan).toMatch(/<img class="adm-flag" src="[^"]*pk\.svg[^"]*" alt="" width="20" height="15"/);
    expect(pakistan).toContain("<span>Pakistan</span>");
    expect(html(FlagName, { code: null })).toContain('<span class="adm-flag adm-flag-none" aria-hidden="true"></span><span>No flag</span>');
  });
});

describe("the admin type scale", () => {
  const styles = readdirSync("src/admin/styles").filter((file) => file.endsWith(".css")).map((file) => [file, readFileSync(`src/admin/styles/${file}`, "utf8")] as const);
  it("never sets text under 13px", () => {
    for (const [file, css] of styles) for (const [, value, unit] of css.matchAll(/font-size:\s*([\d.]+)(rem|px|em)\b/g)) {
      const px = Number(value) * (unit === "px" ? 1 : 16);
      expect(px, `${file} ${value}${unit}`).toBeGreaterThanOrEqual(13);
    }
  });
  it("has no tiny uppercase labels or headers", () => {
    for (const [file, css] of styles) expect(css, file).not.toMatch(/text-transform:\s*uppercase/);
  });
  it("defines the scale once: body 15px, tables 15px, labels 14px, key numbers 32 and 40px", () => {
    const components = readFileSync("src/admin/styles/components.css", "utf8");
    for (const token of ["--adm-type-body: 0.9375rem", "--adm-type-table: 0.9375rem", "--adm-type-label: 0.875rem", "--adm-type-meta: 0.8125rem", "--adm-type-number: 2rem", "--adm-type-hero: 2.5rem", "--adm-row: 44px"]) expect(components).toContain(token);
    expect(components).toMatch(/\.adm-data-table thead th \{[^}]*position: sticky;[^}]*text-transform: none;/);
    expect(components).toMatch(/\.adm-data-table \.adm-cell-num \{ text-align: right;[^}]*tabular-nums/);
    expect(components).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it("puts every page's tables through the shared table", () => {
    const shell = readdirSync("src/admin/shell").filter((file) => file.endsWith(".tsx"));
    // Chart keeps its own data table (inside Show data) and Visuals a screen reader table; both use the shared classes.
    const raw = shell.filter((file) => !["ui.tsx", "Chart.tsx", "Visuals.tsx"].includes(file) && readFileSync(`src/admin/shell/${file}`, "utf8").includes("<table"));
    expect(raw).toEqual([]);
    for (const file of ["Live.tsx", "Players.tsx", "Reports.tsx", "Suspensions.tsx", "AnalyticsReports.tsx", "Insights.tsx", "PlayerDetail.tsx"]) expect(readFileSync(`src/admin/shell/${file}`, "utf8"), file).toContain("<DataTable");
  });
});
