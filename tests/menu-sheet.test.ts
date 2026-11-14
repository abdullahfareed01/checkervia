// The game's Menu sheet, the Terms and notices and the "are you sure?" popup
// in the game's look (D68): gold symbols in dark wells, a Terms text that
// scrolls on its own gold scroll bar between a fixed head and foot, and a
// question split into a heading and a quieter line.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, splitQuestion } from "../src/ui/ConfirmDialog";
import { MenuTiles } from "../src/ui/GameMenu";
import type { MenuRun } from "../src/ui/GameMenu";
import { HomeIcon, RestartIcon } from "../src/ui/icons";
import { TERMS_SECTIONS, TermsDialog } from "../src/ui/TermsDialog";

const noop = () => {};
// The rules only, without the comments.
const css = readFileSync(new URL("../src/ui/sheet.css", import.meta.url), "utf8").replace(/\/\*[^]*?\*\//g, "").replace(/\r\n/g, "\n");

describe("the are you sure popup", () => {
  it("splits the question from what happens", () => {
    expect(splitQuestion("Start a new game? The current game will be lost.")).toEqual({ title: "Start a new game?", detail: "The current game will be lost." });
    expect(splitQuestion("Reset every setting to its default?")).toEqual({ title: "Reset every setting to its default?", detail: "" });
    expect(splitQuestion("No question here")).toEqual({ title: "No question here", detail: "" });
  });

  it("shows a symbol, the question as a heading, the detail, and the safe gold button first", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, { question: "Start a new game? The current game will be lost.", confirmLabel: "Yes, new game", icon: createElement(RestartIcon), onConfirm: noop, onCancel: noop }),
    );
    expect(html).toMatch(/role="alertdialog"[^>]*aria-labelledby="([^"]+)-question"[^>]*aria-describedby="\1-detail"/);
    expect(html).toMatch(/<span class="confirm-mark" aria-hidden="true"><svg class="icon icon-restart"/);
    expect(html).toMatch(/<h2 id="[^"]+" class="confirm-question">Start a new game\?<\/h2><p id="[^"]+" class="confirm-detail">The current game will be lost\.<\/p>/);
    expect(html).toMatch(/class="confirm-button confirm-keep">Keep playing<\/button><button type="button" class="confirm-button confirm-go">Yes, new game<\/button>/);
  });

  it("uses the exclamation mark when no symbol is given, and can name the safe choice", () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, { question: "Reset every setting to its default?", cancelLabel: "Cancel", onConfirm: noop, onCancel: noop }));
    expect(html).toContain("icon-alert");
    expect(html).toContain(">Cancel</button>");
    expect(html).not.toContain("confirm-detail");
    expect(html).not.toContain("aria-describedby");
  });
});

describe("the Menu sheet's actions", () => {
  const items = [
    { label: "Settings", icon: createElement("svg", { className: "icon icon-gear" }), onSelect: vi.fn() },
    { label: "Main menu", icon: createElement(HomeIcon), onSelect: vi.fn(), confirm: "Back to the main menu? The current game will be lost." },
  ];

  it("are tiles with a symbol in a well over the word", () => {
    const html = renderToStaticMarkup(createElement(MenuTiles, { items, run: noop }));
    expect(html).toMatch(/^<div class="menu-tiles" role="menu" aria-label="Actions">/);
    const tiles = html.match(/<button type="button" role="menuitem" class="menu-item menu-tile">[^]*?<\/button>/g) ?? [];
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatch(/<span class="menu-tile-icon" aria-hidden="true"><svg class="icon icon-gear"><\/svg><\/span><span class="menu-tile-label">Settings<\/span>/);
    expect(tiles[1]).toContain("icon-home");
  });

  it("every action in the game's Menu has a symbol", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    const entries = source.match(/\{ label: "[^"]+",[^\n]*onSelect/g) ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(6);
    for (const entry of entries) expect(entry).toMatch(/icon: </);
  });

  it("an action that asks first asks with its own symbol", () => {
    const calls: Parameters<MenuRun>[] = [];
    const run: MenuRun = (...args) => calls.push(args);
    const element = MenuTiles({ items, run }) as { props: { children: { props: { onClick: () => void } }[] } };
    element.props.children[1]!.props.onClick();
    expect(calls[0]![0]).toBe("Back to the main menu? The current game will be lost.");
    expect(calls[0]![2]).toBe(items[1]!.icon);
  });
});

describe("the Terms and notices", () => {
  const html = renderToStaticMarkup(createElement(TermsDialog, { onClose: noop }));

  it("keeps the head and the foot out of the scrolling text", () => {
    expect(html).toMatch(/<header class="terms-head">[^]*<h2 id="[^"]+" class="terms-title">Terms and notices<\/h2>[^]*aria-label="Close"[^]*<\/header>/);
    expect(html).toMatch(/<div class="terms-scroll gold-scroll" tabindex="0" role="region" aria-label="Terms text">/);
    expect(html).toMatch(/<\/div><footer class="terms-foot">[^]*>Close<\/button><\/footer>/);
    const scroll = html.slice(html.indexOf("terms-scroll"), html.indexOf("terms-fade"));
    expect(scroll).not.toContain("terms-title");
    expect(scroll).not.toContain(">Close<");
  });

  it("numbers every section in a gold coin", () => {
    const numbers = [...html.matchAll(/<span class="terms-number" aria-hidden="true">(\d+)<\/span><h3>([^<]+)<\/h3>/g)];
    expect(numbers.map((match) => match[2])).toEqual(TERMS_SECTIONS.map((section) => section.title));
    expect(numbers.map((match) => Number(match[1]))).toEqual(TERMS_SECTIONS.map((_, index) => index + 1));
  });

  it("starts with an empty reading line and the hint to scroll", () => {
    expect(html).toContain('<div class="terms-progress" aria-hidden="true"><span style="transform:scaleX(0)"></span></div>');
    expect(html).toContain("Scroll to read more");
  });
});

describe("the gold scroll bar", () => {
  it("is drawn with the -webkit- rules, and scrollbar-color is only a fallback (it would switch them off in Chromium)", () => {
    expect(css).toMatch(/\.gold-scroll::-webkit-scrollbar-thumb \{[^}]*linear-gradient\(180deg, #f2c25a, #b8782a\)/);
    expect(css).toMatch(/@supports not selector\(::-webkit-scrollbar\) \{\s*\.gold-scroll \{\s*scrollbar-width: thin;\s*scrollbar-color/);
    expect(css.replace(/@supports not selector[^]*?\n\}\n/, "")).not.toContain("scrollbar-color");
  });

  it("only the Terms text scrolls, the dialog itself does not", () => {
    expect(css).toMatch(/\.terms-dialog \{[^}]*display: flex;[^}]*overflow: hidden;/);
    expect(css).toMatch(/\.terms-scroll \{[^}]*overflow-y: auto;/);
  });

  it("no glow on these game screen sheets (D41, D42): only dark shadows", () => {
    const shadows = (css.match(/box-shadow:([^;]*);/g) ?? []).flatMap((rule) => rule.slice(11, -1).split(/,(?![^(]*\))/));
    expect(shadows.length).toBeGreaterThan(5);
    for (const shadow of shadows) {
      if (shadow.includes("inset")) continue; // a lit edge inside, not a glow
      for (const colour of shadow.match(/rgba\([^)]*\)/g) ?? []) {
        const [r, g, b] = colour.slice(5, -1).split(",").map(Number);
        expect(r! + g! + b!, shadow).toBeLessThan(200);
      }
    }
  });
});
