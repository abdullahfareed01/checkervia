// Focus mode (D88): the title, the two cards, a big board and the AI with
// its bubble; New game and Resign in the Menu; a small mute button that
// hides and silences the AI's lines while its face keeps reacting.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { defaultSettings, parseSettings, SETTINGS_VERSION, settingsStore } from "../src/ui/settings";
import { speakIf } from "../src/ui/useVoice";

const css = (name: string) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const game = () => renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2 }, onMenu: () => {} }));
const focusOn = (on: boolean) => settingsStore().update((s) => ({ ...s, view: { focus: on } }));

afterEach(() => settingsStore().reset());

describe("focus mode: remembered on this device", () => {
  it("is off by default, and a stored choice is kept", () => {
    const d = defaultSettings(false);
    expect(d.view).toEqual({ focus: false });
    expect(parseSettings(JSON.stringify({ version: SETTINGS_VERSION, view: { focus: true } }), d).view.focus).toBe(true);
    expect(parseSettings(JSON.stringify({ version: SETTINGS_VERSION, view: { focus: "yes" } }), d).view.focus).toBe(false);
  });
});

describe("focus mode: the game screen", () => {
  it("normal mode: a Focus mode button in the top bar's left slot, and the usual parts", () => {
    const html = game();
    expect(html).toContain('aria-label="Focus mode"');
    expect(html).not.toContain("app-focus");
    expect(html).toContain('class="winbar"');
    expect(html).toContain('aria-label="Previous move"');
    expect(html).not.toContain("coach-mute");
  });

  it("focus mode: no chance bar, move list or action bar; Back leaves it; the Menu stays", () => {
    focusOn(true);
    const html = game();
    expect(html).toContain('class="app app-ai app-focus"');
    expect(html).toContain('aria-label="Leave focus mode"');
    expect(html).not.toContain('class="winbar"');
    expect(html).not.toContain('aria-label="Previous move"');
    expect(html).not.toContain('class="action-bar"');
    expect(html).toMatch(/<div class="menu">[\s\S]*>Menu</);
    // Both cards and the AI's row are still there.
    expect(html).toContain("card-top");
    expect(html).toContain("card-bottom");
    expect(html).toContain('class="coach"');
  });

  it("New game and Resign move to the Menu in focus mode, with the bar's questions", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toContain('{ label: "New game", icon: <RestartIcon />, onSelect: newGame, confirm: inProgress ? "Start a new game? The current game will be lost." : undefined }');
    expect(source).toContain('{ label: "Resign", icon: <FlagIcon />, onSelect: resign, confirm: resignQuestion }');
    expect(source).toContain('{ label: "Result", icon: <TrophyIcon />, onSelect: result.reopen }');
  });

  it("the page never scrolls: the board is the smaller of the width and the height left", () => {
    const focus = css("focus.css");
    expect(focus).toContain("--board-size: min(var(--focus-w), max(200px, calc(100dvh - var(--focus-chrome))));");
    expect(focus).toMatch(/\.app\.app-focus \.topbar,\n {2}\.app\.app-focus \.game,\n {2}\.app\.app-focus \.sidebar \{\n {4}width: var\(--board-size\);/);
  });
});

describe("focus mode: the mute button", () => {
  it("is small, in the AI's row, and says whether the chat is muted", () => {
    focusOn(true);
    expect(game()).toMatch(/<button type="button" class="coach-mute" aria-label="Mute the AI&#x27;s chat" aria-pressed="false"/);
    settingsStore().update((s) => ({ ...s, chat: { bubbles: false } }));
    expect(game()).toMatch(/<button type="button" class="coach-mute coach-mute-on" aria-label="Mute the AI&#x27;s chat" aria-pressed="true"/);
    const block = css("focus.css").slice(css("focus.css").indexOf(".coach-mute,\n.coach-resign {"));
    expect(block.slice(0, block.indexOf("}"))).toMatch(/width: 30px;[\s\S]*height: 30px;/);
    // The target around it is 44px: 30 plus 7 on each side.
    expect(css("focus.css")).toMatch(/\.coach-mute::after,\n\.coach-resign::after \{\n {2}content: "";\n {2}position: absolute;\n {2}inset: -7px;/);
  });

  it("muted: the robot stays (its face reacts), the bubble is empty", () => {
    focusOn(true);
    settingsStore().update((s) => ({ ...s, chat: { bubbles: false } }));
    const html = game();
    expect(html).toMatch(/class="coach-avatar coach-avatar-\w+/);
    expect(html).not.toMatch(/class="speech[ "]/);
  });

  it("muted: the AI's lines are not spoken; the Why card and tips still are asked for", () => {
    settingsStore().update((s) => ({ ...s, chat: { bubbles: false }, voice: { ...s.voice, enabled: true } }));
    expect(speakIf("reactions", "Oops.", 2)).toBe(false);
    expect(speakIf("greetings", "Hi.", 2)).toBe(false);
    expect(speakIf("gameOver", "Game over.", 2)).toBe(false);
    const voice = readFileSync(new URL("../src/ui/useVoice.ts", import.meta.url), "utf8");
    expect(voice).toContain('if (!chat.bubbles && kind !== "tips") return false;');
  });
});

describe("focus mode: the offer at the start of a game", () => {
  it("a new game outside focus mode offers it in a slim pill with Not now, over the chance bar", () => {
    const html = game();
    expect(html).toMatch(/<div class="board-area">[\s\S]*<span class="focus-offer" role="group" aria-label="Focus mode"><button type="button" class="focus-offer-go"><svg[\s\S]*?<\/svg>Try focus mode<\/button><button type="button" class="focus-offer-close" aria-label="Not now">/);
  });

  it("is not offered in focus mode", () => {
    focusOn(true);
    expect(game()).not.toContain("focus-offer");
  });

  it("floats (no room of its own, so nothing moves when it goes): 30px to the eye, 44px to the finger", () => {
    const focus = css("focus.css");
    const block = focus.slice(focus.indexOf("\n.focus-offer {"));
    expect(block.slice(0, block.indexOf("}"))).toMatch(/position: absolute;[\s\S]*height: 30px;/);
    expect(focus).toMatch(/\.focus-offer-go::after,\n\.focus-offer-close::after \{\n {2}content: "";\n {2}position: absolute;\n {2}inset: -7px 0;/);
  });
});

describe("focus mode: a small Resign in your card, after Your turn", () => {
  it("against the AI: a flag in your (bottom) card, right after the turn", () => {
    focusOn(true);
    const html = game();
    const bottom = html.match(/<section class="card card-bottom[\s\S]*?<\/section>/)![0];
    expect(bottom).toMatch(/class="card-state card-state-\w+">[^<]*(<span[^>]*><\/span>)?<\/span><button type="button" class="coach-resign" aria-label="Resign" title="Resign">/);
    expect(html.match(/class="coach-resign/g)).toHaveLength(1);
    expect(html.match(/<section class="coach"[\s\S]*?<\/section>/)![0]).not.toContain("coach-resign");
  });

  it("two players: on the card of the side to move", () => {
    focusOn(true);
    const html = renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" }, onMenu: () => {} }));
    expect(html.match(/class="coach-resign/g)).toHaveLength(1);
    expect(html.match(/<section class="card card-bottom[\s\S]*?<\/section>/)![0]).toContain("coach-resign"); // Black moves first, at the bottom
  });

  it("not outside focus mode (the action bar has Resign)", () => {
    expect(game()).not.toContain("coach-resign");
  });
});

describe("the Menu button in the top bar does not shake the header", () => {
  it("on phones it keeps 44px when hovered (a tap leaves it hovered)", () => {
    const layout = css("layout.css");
    expect(layout).toMatch(/ {2}\.topbar \.menu \.bar-button,\n {2}\.topbar \.menu \.bar-button:hover:not\(:disabled\) \{\n {4}width: 44px;\n {4}height: 44px;/);
  });
});

describe("the popups the owner asked for (16 Nov 2026)", () => {
  it("the are you sure popup is compact: a smaller question, detail and buttons", () => {
    const sheet = css("sheet.css");
    expect(sheet).toMatch(/\.confirm-question \{\n {2}margin: 0;\n {2}font-family: "Fraunces"[^}]*font-size: 1\.15rem;/);
    expect(sheet).toMatch(/\.confirm-detail \{\n {2}margin: 6px 0 0;\n {2}font-size: 0\.9rem;/);
    expect(sheet).toMatch(/\.confirm-actions \.confirm-button \{\n {2}min-height: 44px;[^}]*font-size: 0\.92rem;/);
  });

  it("the 18+ question wears the level dialog's leather", () => {
    const sheet = css("sheet.css");
    expect(sheet).toContain(".level-dialog,\n.consent-dialog {\n  --sheet-gold");
    expect(sheet).toContain(".level-dialog .dialog-actions .button-primary,\n.consent-dialog .dialog-actions .button-primary {");
  });
});
