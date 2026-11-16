// The game screen after the owner's phone review (D50): one action bar with
// the same five buttons in the same order, nothing duplicated elsewhere, the
// Checkervia name, coordinates inside the squares, and the sizes that make
// the phone layout work. Layout itself is checked in a real browser (see the
// progress log); these tests pin the structure and the CSS numbers.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBar } from "../src/ui/ActionBar";
import type { EndAction } from "../src/ui/ActionBar";
import { App } from "../src/ui/App";
import { Home } from "../src/ui/Home";
import { Splash } from "../src/ui/Splash";
import { TermsDialog } from "../src/ui/TermsDialog";

const noop = () => {};
// Read with Unix line ends, whatever the checkout uses.
const css = (name: string) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// The labels of the bar's buttons, in order.
const barLabels = (html: string) => {
  const bar = html.match(/<nav class="action-bar"[\s\S]*?<\/nav>/)![0];
  return [...bar.matchAll(/<button[^>]*class="bar-button[^"]*"[^>]*>[\s\S]*?<span class="bar-label"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
};

const bar = (end: EndAction, canBack = false, canForward = false) =>
  renderToStaticMarkup(
    createElement(ActionBar, { menu: createElement("button", { className: "bar-button" }, createElement("span", { className: "bar-label" }, "Menu")), canBack, canForward, onGo: noop, end, needsConfirmation: false, onNewGame: noop }),
  );

describe("the action bar", () => {
  it("with a menu (two columns): Menu, Previous, Next, Resign, New game, in this order", () => {
    expect(barLabels(bar({ kind: "resign", question: "q", highlight: false, onResign: noop }))).toEqual(["Menu", "Previous", "Next", "Resign", "New game"]);
    expect(bar({ kind: "resign", question: "q", highlight: false, onResign: noop })).toContain('class="action-bar-inner"');
  });

  // The tests have no window, so App renders the one column layout (D74).
  it.each(["vs-ai", "two-player"] as const)("%s, one column: Menu at the top right, the bar has Previous, Next, Resign, New game", (mode) => {
    const html = renderToStaticMarkup(createElement(App, { initial: { mode } }));
    expect(barLabels(html)).toEqual(["Previous", "Next", "Resign", "New game"]);
    expect(html).toContain('class="action-bar-inner action-bar-four"');
    const top = html.match(/<div class="top-row">[\s\S]*?<\/header>/)![0];
    expect(top).toMatch(/<h1>Checkervia<\/h1>[\s\S]*<div class="menu">[\s\S]*>Menu</);
  });

  it("Menu moves only where the bar is fixed to the bottom: the same query as layout.css's two columns", () => {
    const media = readFileSync(new URL("../src/ui/useMediaQuery.ts", import.meta.url), "utf8");
    expect(media).toContain("export const TWO_COLUMNS = `(min-width: 900px) and (min-height: 600px), ${LANDSCAPE_PHONE}`;");
    expect(css("layout.css")).toContain("@media (min-width: 900px) and (min-height: 600px), (orientation: landscape) and (max-height: 599px) and (min-width: 560px) {");
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toContain('action={twoColumns ? undefined : gameMenu}');
    expect(source).toContain("menu={twoColumns ? gameMenu : undefined}");
  });

  it("is the only place with Menu, Resign and New game (nothing in the side panel)", () => {
    const html = renderToStaticMarkup(createElement(App, { onMenu: noop }));
    expect(html.match(/>Menu</g)).toHaveLength(1);
    expect(html.match(/>Resign</g)).toHaveLength(1);
    expect(html.match(/>New game</g)).toHaveLength(1);
    expect(html).not.toContain('class="controls"');
  });

  it("the Menu list no longer repeats New game or Resign", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const items = source.match(/const menuItems = useMemo\([\s\S]*?\],\n/)![0];
    expect(items).not.toMatch(/label: "New game"|label: "Resign"/);
    expect(items).toMatch(/label: "How to play"/);
  });

  it("the fourth slot is Resign during a game and Result after it", () => {
    expect(barLabels(bar({ kind: "resign", question: "q", highlight: false, onResign: noop }))[3]).toBe("Resign");
    expect(barLabels(bar({ kind: "result", onShow: noop }))[3]).toBe("Result");
  });

  it("Previous and Next say what they do and are disabled when there is no such move", () => {
    const html = bar({ kind: "result", onShow: noop }, true, false);
    expect(html).toMatch(/<button type="button" class="bar-button" aria-label="Previous move">/);
    expect(html).toMatch(/<button type="button" class="bar-button" aria-label="Next move" disabled="">/);
  });

  it("highlights Resign while the resign hint is up", () => {
    expect(bar({ kind: "resign", question: "q", highlight: true, onResign: noop })).toContain("bar-button button-resign-hint");
  });
});

describe("the name Checkervia", () => {
  it("in the game header, the home screen, the splash, the Terms and the browser tab", () => {
    const game = renderToStaticMarkup(createElement(App));
    expect(game).toMatch(/<header class="topbar">[\s\S]*<h1>Checkervia<\/h1>/);
    const home = renderToStaticMarkup(createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop }));
    expect(home).toContain("<h1>Checkervia</h1>");
    expect(renderToStaticMarkup(createElement(Splash, { steps: [] } as never))).toContain("Checkervia");
    expect(renderToStaticMarkup(createElement(TermsDialog, { onClose: noop }))).toContain("Checkervia is a free checkers game");
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toContain("<title>Checkervia</title>");
    expect(page).toContain('<meta property="og:title" content="Checkervia" />');
    expect(readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8")).toContain("<title>Checkervia</title>");
  });

  it("nowhere says Draft any more", () => {
    const shown = [
      renderToStaticMarkup(createElement(App)),
      renderToStaticMarkup(createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop })),
      renderToStaticMarkup(createElement(TermsDialog, { onClose: noop })),
      readFileSync(new URL("../index.html", import.meta.url), "utf8"),
      readFileSync(new URL("../README.md", import.meta.url), "utf8"),
    ];
    for (const text of shown) expect(text).not.toMatch(/\bDraft\b/);
  });
});

describe("the board's coordinates", () => {
  const html = renderToStaticMarkup(createElement(App));

  it("are inside the squares: 8 row numbers in the left column, 8 letters in the bottom row", () => {
    expect(html).not.toContain("board-labels");
    expect(html.match(/<span class="coord coord-rank" aria-hidden="true">/g)).toHaveLength(8);
    expect(html.match(/<span class="coord coord-file" aria-hidden="true">/g)).toHaveLength(8);
    expect(html).toMatch(/<div class="square square-light" aria-hidden="true"><span class="coord coord-rank" aria-hidden="true">8<\/span><\/div>/);
  });

  it("the frame is thin (3px) and has no label edges", () => {
    const frame = css("chrome.css").match(/\.board-frame \{[^}]*\}/)![0];
    expect(frame).toContain("padding: 3px;");
    expect(frame).not.toContain("--edge");
  });
});

describe("phone sizes (CSS)", () => {
  const layout = css("layout.css");

  it("44px squares at 375px wide: 8px gutters and the 3px frame", () => {
    // (375 - 16 - 2 x 3) / 8 = 44.1
    expect(layout).toMatch(/--board-size: min\(calc\(100vw - 16px\), 560px,/);
  });

  it("every bar button and Why? is at least 44 x 44", () => {
    expect(layout).toMatch(/\.bar-button \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    // D64: Why? lives only in the bubble now (the separate note is gone).
    expect(layout).toMatch(/\.speech-why \{\r?\n  min-width: 44px;\r?\n  min-height: 44px;/);
  });

  it("the chips' text is at least 12px", () => {
    expect(layout).toMatch(/\.chip-level,\n\.chip-adult \{[^}]*font-size: 12px;/);
  });
});

describe("the last move is not blue", () => {
  it("a gold ring and warm route colours, no blue and no glow", () => {
    const all = ["styles.css", "chrome.css", "layout.css"].map(css).join("\n");
    const lastMove = all.match(/\.square-last-move \.piece \{[^}]*\}/g)!.join("\n");
    expect(lastMove).toContain("var(--gold)");
    expect(lastMove).not.toMatch(/rgba\(120, 196, 255|rgba\(80, 170, 255|0 0 12px/);
    expect(all).not.toMatch(/#5bb8f5|#7fb3d9/i);
  });
});

// D67: the bar after the owner's mockup never squeezes a label: each column
// is at least as wide as its label, labels never wrap, and their size follows
// the bar's own width (11px at the narrowest, never below).
describe("the action bar never squeezes its labels (D67)", () => {
  const layout = css("layout.css");

  it("columns no narrower than their labels, New game a little wider", () => {
    expect(layout).toContain("grid-template-columns: repeat(4, minmax(min-content, 1fr)) minmax(min-content, 1.3fr);");
  });

  it("labels on one line, sized by the bar's width, at least 12px", () => {
    expect(layout).toMatch(/\.bar-label \{[^}]*font-size: clamp\(12px, [\d.]+cqi, 15px\);[^}]*white-space: nowrap;/);
    expect(layout).toMatch(/\.action-bar-inner \{[^}]*container-type: inline-size;/);
  });
});
