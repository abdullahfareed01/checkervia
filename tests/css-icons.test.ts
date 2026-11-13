// Regression test for DEV-005: a bare `.icon { width: 78% }` rule overrode
// the 18px winner crown (same specificity, later in the file), so the crown
// grew to most of the card. Icons must only be sized inside their container.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read the real file. (A `?raw` import does not work here: Vitest replaces CSS
// imports with an empty string in tests, which would make this test pass on
// nothing.)
const css = readFileSync(new URL("../src/ui/styles.css", import.meta.url), "utf8");
// The smaller stylesheets must not bring the bare rule back either.
const otherCss = ["aiReason.css", "menu.css", "learn.css", "chrome.css"].map((name) =>
  readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8"),
);

// Every rule whose selector list contains a bare `.icon` (not `.icon-...`).
function bareIconRules(source: string): string[] {
  const rules = source.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  return rules.filter((rule) => {
    const selectors = rule.slice(0, rule.indexOf("{")).split(",").map((s) => s.trim());
    return selectors.some((selector) => selector === ".icon");
  });
}

describe("icon sizes (DEV-005)", () => {
  it("really read the stylesheet", () => {
    expect(css.length).toBeGreaterThan(10_000);
  });

  it("has no unscoped `.icon` rule that could size every icon", () => {
    expect(bareIconRules(css)).toEqual([]);
    for (const sheet of otherCss) expect(bareIconRules(sheet)).toEqual([]);
  });

  it("sizes the winner crown on its own, small", () => {
    expect(css).toMatch(/\.card-name \.icon-crown \{[^}]*width: 18px;[^}]*height: 18px;/);
  });

  it("still sizes the avatar and result icons", () => {
    expect(css).toMatch(/\.avatar \.icon \{[^}]*width: 78%/);
    expect(css).toMatch(/\.result-emblem \.icon \{[^}]*width: 64%/);
  });
});
