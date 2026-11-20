// The compact Profile screen on the smallest phones and with large text
// (scripts/check-layout.mjs found these): nothing is ever cut off.
// - A page that cannot fit scrolls inside the sheet, and only then; while
//   the country list or a popup is open, only that scrolls.
// - The slide in of a page keeps no transform once it ends, so the country
//   list and popups inside a page stay fixed to the window, not the page.
// - On wide windows the country list opens in the middle of the window, as
//   the compact sheet would cut off a list dropping below its button.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/ui/leaderboard.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const accountCss = readFileSync(new URL("../../src/ui/leaderboard/account.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** The body of the last rule with exactly this selector (the one that wins). */
function rule(source: string, selector: string): string {
  const start = source.lastIndexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("the compact Profile screen never cuts anything off", () => {
  it("scrolls inside the sheet only when a page cannot fit, never sideways", () => {
    const screen = rule(css, ".pf-screen");
    expect(screen).toMatch(/overflow-x: hidden;/);
    expect(screen).toMatch(/overflow-y: auto;/);
    expect(screen).toMatch(/overscroll-behavior: contain;/);
    expect(rule(css, ".pf-screen:has(.cp-panel, .lb-info-backdrop)")).toMatch(/overflow-y: hidden;/);
  });

  it("lets a page's slide in end without a transform, so fixed lists and popups stay on the window", () => {
    const page = rule(css, ".pf-page");
    expect(page).toMatch(/animation: pf-page-in [^;]* backwards;/);
    expect(page).not.toMatch(/\b(both|forwards)\b/);
  });

  it("opens the country list in the middle of a wide window", () => {
    const wide = css.slice(css.lastIndexOf("@media (min-width: 700px) and (min-height: 560px) {\n  .pf-screen .cp-backdrop"));
    const panel = wide.slice(wide.indexOf(".pf-screen .cp-panel {"), wide.indexOf("}", wide.indexOf(".pf-screen .cp-panel {")));
    expect(panel).toMatch(/position: fixed;/);
    expect(panel).toMatch(/inset: 0;/);
    expect(panel).toMatch(/margin: auto;/);
    expect(panel).toMatch(/max-height: min\(420px, 100% - 32px\);/);
  });

  it("keeps the login link's own size, whatever order the styles load in", () => {
    expect(rule(accountCss, ".link-button.acct-link")).toMatch(/font-size: 15px;/);
  });
});
