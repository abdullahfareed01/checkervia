// Render checks for the splash, home menu, rules page and Menu button (their
// look is checked by eye). No clicks: no DOM test library is installed.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { Home } from "../src/ui/Home";
import { HowToPlay } from "../src/ui/HowToPlay";
import { Root } from "../src/ui/Root";
import { Logo, Splash } from "../src/ui/Splash";

const noop = () => {};
const never = () => new Promise<never>(() => {});

const home = (overrides: Partial<ComponentProps<typeof Home>> = {}) =>
  renderToStaticMarkup(
    createElement(Home, {
      aiStatus: "ready",
      onPlay: noop,
      onHowToPlay: noop,
      onLearn: noop,
      onRecheck: noop,
      onTerms: noop,
      ...overrides,
    }),
  );

describe("Root (first render)", () => {
  it("shows the splash over the home menu while the AI check runs", () => {
    const html = renderToStaticMarkup(createElement(Root, { checkAi: never }));
    expect(html).toContain('class="splash"');
    expect(html).toContain("Checking the AI…");
    expect(html).toContain("Main menu");
    expect(html).not.toContain('aria-label="Game"');
  });

  it("opens straight on the game for a dev scenario", () => {
    const html = renderToStaticMarkup(createElement(Root, { checkAi: never, initial: { mode: "vs-ai" } }));
    expect(html).toContain('aria-label="Game"');
    expect(html).toContain(">Menu<");
    expect(html).not.toContain("Main menu");
  });
});

describe("Splash (D51)", () => {
  it("once React runs: the bar at the AI check, as a real progress bar", () => {
    const html = renderToStaticMarkup(createElement(Splash, { leaving: false }));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<div class="splash-bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="66" aria-valuetext="Checking the AI">/);
    expect(html).toContain('<span class="splash-bar-fill" style="width:66%"></span>');
    expect(html).toContain('<p class="splash-note">Checking the AI…</p>');
  });

  it("fades out full, saying Ready", () => {
    const html = renderToStaticMarkup(createElement(Splash, { leaving: true }));
    expect(html).toContain("splash splash-leaving");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('<p class="splash-note">Ready</p>');
  });

  it("has the mockup's parts: frame, logo, title, crown divider, CHECKERS, board scenery", () => {
    const html = renderToStaticMarkup(createElement(Splash, { leaving: false }));
    for (const part of ["splash-frame", "splash-logo", "splash-title", "splash-divider", "splash-crown", "splash-sub", "scenery-board", "scenery-piece-white", "scenery-piece-king"]) {
      expect(html).toContain(part);
    }
    expect(html).toContain('<h1 class="splash-title">Checkervia</h1>');
    expect(html).toContain('<p class="splash-sub">Checkers</p>');
  });

  it("matches the static splash in index.html, which shows the first step before the JavaScript", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toMatch(/<div id="root">\s*<!--[^>]*-->\s*<div class="splash"/);
    for (const name of ["splash-frame", "splash-logo", "splash-title", "splash-divider", "splash-sub", "splash-bar", "splash-note", ".splash-leaving", "scenery-board"]) {
      expect(page).toContain(name);
    }
    expect(page).toContain('aria-valuenow="30"');
    expect(page).toContain('<p class="splash-note">Loading the game…</p>');
    // The same drawings: React and the static page use the same image files.
    for (const src of ["/art/logo.svg", "/art/piece-white.svg", "/art/piece-king.svg"]) {
      expect(renderToStaticMarkup(createElement(Splash, { leaving: false }))).toContain(`src="${src}"`);
      expect(page).toContain(`src="${src}"`);
    }
    // (The server renderer may add its own preload link before the image.)
    expect(renderToStaticMarkup(createElement(Logo))).toContain('<img class="logo" src="/art/logo.svg" alt=""/>');
  });

  it("loads the title font from this site, with a Georgia fallback", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toContain('src: url("/fonts/fraunces-black-latin.woff2") format("woff2");');
    expect(page).toContain('font-family: "Fraunces", Georgia');
    expect(readFileSync(new URL("../public/fonts/fraunces-black-latin.woff2", import.meta.url), "utf8").length).toBeGreaterThan(1000);
    expect(readFileSync(new URL("../public/fonts/OFL.txt", import.meta.url), "utf8")).toContain("SIL Open Font License");
  });
});

describe("Home", () => {
  it("offers Play vs AI, 2 Players, Learn and How to Play", () => {
    const html = home();
    expect(html).toContain("Play vs AI");
    expect(html).toContain("2 Players");
    expect(html).toContain("Learn");
    expect(html).toContain("How to Play");
  });

  it("has the mockup's parts: frame, checkered floor, icon wells, a line and a chevron on every card (D66)", () => {
    const html = home({ onLeaderboard: noop, onSettings: noop, onProfile: noop });
    for (const part of ["home-frame", "home-scenery", "home-logo", "game-title-large", "icon-laurel", "lb-gradients"]) expect(html).toContain(part);
    const cards = html.match(/<button type="button" class="menu-card[^]*?<\/button>/g) ?? [];
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card).toContain('class="menu-icon"');
      expect(card).toContain('class="menu-divider"');
      expect(card).toContain('class="menu-chevron"');
    }
    expect(cards[0]).toContain("robot-face");
    expect(cards[2]).toContain("icon-gradcap");
    // The profile has a crown badge; the foot has Settings and the Terms with their icons.
    expect(html).toMatch(/class="home-profile"[^]*class="home-profile-badge"/);
    expect(html).toMatch(/icon-gear[^]*<span>Settings<\/span>[^]*home-foot-divider[^]*icon-document[^]*<span>Terms &amp; Notices<\/span>/);
  });

  it("shows the AI as online when the check passed, with no warning", () => {
    const html = home({ aiStatus: "ready" });
    expect(html).toContain("AI Online");
    expect(html).not.toContain("Check again");
  });

  it("shows that the check is still running", () => {
    expect(home({ aiStatus: "checking" })).toContain("Checking the AI…");
  });

  it.each([
    ["offline", "AI not set up", "no API key"],
    ["unreachable", "AI unreachable", "netlify dev"],
  ] as const)("explains %s and offers to check again", (aiStatus, badge, help) => {
    const html = home({ aiStatus });
    expect(html).toContain(badge);
    expect(html).toContain(help);
    expect(html).toContain("Check again");
  });
});

describe("HowToPlay", () => {
  const html = renderToStaticMarkup(createElement(HowToPlay, { onBack: noop, onPlay: noop, onLearn: noop }));

  it("states the rules the engine plays", () => {
    expect(html).toContain("Capturing is mandatory");
    expect(html).toContain("one square diagonally forward");
    expect(html).toContain("becomes a King");
    expect(html).toContain("Becoming a King during a capture ends the turn");
  });

  it("has a way back and a way to start", () => {
    expect(html).toContain("← Menu");
    expect(html).toContain("Play vs AI");
    expect(html).toContain("2 Players");
  });
});

describe("Menu button in the game (D50)", () => {
  it("one column: at the top right, not on the action bar, and there is no back arrow (the Menu has Main menu, D74)", () => {
    // The tests have no window, so App renders the one column layout; two
    // columns keep Menu on the bar (tests/action-bar.test.ts).
    const html = renderToStaticMarkup(createElement(App, { onMenu: noop }));
    expect(html).not.toContain("Back to the main menu");
    const header = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)![1]!;
    expect(header).toMatch(/aria-haspopup="dialog"[\s\S]*>Menu</);
    const nav = html.match(/<nav class="action-bar"[\s\S]*?<\/nav>/)![0];
    expect(nav).not.toContain(">Menu<");
  });

  it("uses a hamburger icon, not the dotted grid", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("icon-menu");
    expect(html).not.toContain("icon-dots");
  });
});

describe("browser tab icon", () => {
  it("is linked from index.html and exists", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8")).toContain("<svg");
  });
});
