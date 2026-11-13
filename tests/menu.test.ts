// Render checks for the splash, home menu, rules page and Menu button (their
// look is checked by eye). No clicks: no DOM test library is installed.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { ConfirmButton } from "../src/ui/ConfirmButton";
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

describe("Splash", () => {
  it("marks the game as loaded and the AI step as running", () => {
    const html = renderToStaticMarkup(createElement(Splash, { leaving: false }));
    expect(html).toContain('role="status"');
    expect(html).toContain('<li class="splash-step splash-step-done">Game loaded</li>');
    expect(html).toContain('<li class="splash-step">Checking the AI…</li>');
  });

  it("fades out with both steps done", () => {
    const html = renderToStaticMarkup(createElement(Splash, { leaving: true }));
    expect(html).toContain("splash splash-leaving");
    expect(html.match(/splash-step-done/g)).toHaveLength(2);
  });

  it("matches the static splash in index.html, which shows before the JavaScript", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toMatch(/<div id="root">\s*<!--[^>]*-->\s*<div class="splash"/);
    for (const name of ["splash-logo", "splash-title", "splash-steps", "splash-step", ".splash-leaving", ".splash-step-done"]) {
      expect(page).toContain(name);
    }
    // Same logo drawing: every shape of the React logo is in the static one.
    const logo = renderToStaticMarkup(createElement(Logo));
    for (const shape of logo.match(/<(circle|path) [^>]*>/g)!) {
      const attributes = shape.replace(/stroke-width/g, "stroke-width").replace(/\/?>$/, "").trim();
      expect(page.replace(/\s+\/>/g, ">")).toContain(attributes);
    }
  });
});

describe("Home", () => {
  it("offers Play vs AI, 2 Players, Learn and How to play", () => {
    const html = home();
    expect(html).toContain("Play vs AI");
    expect(html).toContain("2 Players");
    expect(html).toContain("Learn");
    expect(html).toContain("How to play");
  });

  it("shows the AI as online when the check passed, with no warning", () => {
    const html = home({ aiStatus: "ready" });
    expect(html).toContain("AI online");
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

describe("Menu button in the game", () => {
  it("has a back arrow when the game was opened from the main menu", () => {
    const html = renderToStaticMarkup(createElement(App, { onMenu: noop }));
    expect(html).toContain('aria-label="Back to the main menu"');
    expect(html).toContain(">Menu<");
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("has no back arrow without a main menu to return to (the Menu still offers New game and the rules)", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).not.toContain("Back to the main menu");
    expect(html).toContain(">Menu<");
  });
});

describe("ConfirmButton", () => {
  it("renders a plain button with its label and classes", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmButton, {
        label: "Menu",
        className: "button-menu",
        needsConfirmation: true,
        question: "Leave?",
        confirmLabel: "Yes",
        onConfirm: noop,
      }),
    );
    expect(html).toBe('<button type="button" class="button button-menu">Menu</button>');
  });
});

describe("browser tab icon", () => {
  it("is linked from index.html and exists", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8")).toContain("<svg");
  });
});
