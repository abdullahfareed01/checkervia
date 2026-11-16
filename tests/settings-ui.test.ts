// Phase D: the Settings sheet on a device with vibration and speech voices
// (both faked here), the board options' CSS, the entry points, and the
// chat bubble switch. (tests/settings-ui-unavailable.test.ts covers a device
// without them.)
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coachMessage } from "../src/ui/AiCoach";

vi.mock("../src/ui/haptics", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/haptics")>();
  const fake = { supported: true, pulse: () => true };
  return { ...real, haptics: () => fake };
});
vi.mock("../src/ui/voice/voiceEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/voice/voiceEngine")>();
  const voices = [
    { name: "Microsoft Hortense - French (France)", lang: "fr-FR", voiceURI: "hortense", localService: true, default: false },
    { name: "Microsoft Aria Online (Natural)", lang: "en-US", voiceURI: "aria", localService: false, default: false },
    { name: "Daniel", lang: "en-GB", voiceURI: "daniel", localService: true, default: true },
  ];
  const fake = { available: () => true, voices: () => voices, speak: () => true, cancel: () => {}, unlock: () => {}, onVoicesChanged: () => () => {} };
  return { ...real, voiceEngine: () => fake };
});

const { SettingsSheet } = await import("../src/ui/SettingsSheet");
const { App } = await import("../src/ui/App");
const { Home } = await import("../src/ui/Home");
const { settingsStore } = await import("../src/ui/settings");

const noop = () => {};
type Page = import("../src/ui/SettingsSheet").SettingsPage;
const sheet = (initialPage: Page | null = null) => renderToStaticMarkup(createElement(SettingsSheet, { onClose: noop, initialPage }));
// The radio inputs of a group, in order, each with whether it is chosen
// (the server renderer may write `checked` before or after `value`).
const radios = (html: string, name: string) =>
  [...html.matchAll(/<input type="radio"[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`name="${name}"`))
    .map((tag) => [tag.match(/value="([^"]*)"/)![1], tag.includes('checked=""')] as const);
const css = (name: string) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("Settings sheet", () => {
  it("is a labelled dialog with a close button", () => {
    const html = sheet();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="settings-title"');
    expect(html).toContain('aria-label="Close"');
  });

  it("opens on tiles, in order, each saying what it is set to now, then Profile and Reset to defaults", () => {
    const html = sheet();
    const tiles = [...html.matchAll(/data-opens="(\w+)"[^]*?settings-tile-title">([^<]+)<\/span>[^]*?settings-tile-value">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
    expect(tiles).toEqual([
      ["sound", "Sound", "On, 60 percent"],
      ["haptics", "Haptics", "Standard"],
      ["voice", "AI voice", "Off"],
      ["animation", "Animation", "Standard"],
      ["board", "Board and pieces", "Classic wood"],
      ["chat", "AI chat", "Bubbles shown"],
      ["profile", "Profile", "Not set up yet"],
    ]);
    expect(html).toContain(">Reset to defaults<");
    // No page is open yet: no Back button, and none of the controls.
    expect(html).not.toContain("settings-back");
    expect(html).not.toContain('role="switch"');
  });

  it("a page has Back to the tiles, its own title, and the close button", () => {
    const html = sheet("sound");
    expect(html).toContain('aria-label="Back to all settings"');
    expect(html).toMatch(/<h2 id="settings-title"[^>]*>Sound<\/h2>/);
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain(">Reset to defaults<");
  });

  it("sound: master switch, volume, game and interface sounds, and a test", () => {
    const html = sheet("sound");
    expect(html).toMatch(/role="switch" aria-checked="true" class="settings-switch"><span class="settings-switch-label">Sound</);
    expect(html).toMatch(/Volume<output>60 percent<\/output>/);
    expect(html).toContain(">Game sounds<");
    expect(html).toContain(">Interface sounds<");
    expect(html).toContain("Test sound<");
  });

  it("haptics: Off, Light, Standard, Strong (Standard chosen) and a test", () => {
    const html = sheet("haptics");
    expect(radios(html, "haptics")).toEqual([
      ["off", false],
      ["light", false],
      ["standard", true],
      ["strong", false],
    ]);
    expect(html).toContain("Test vibration<");
  });

  it("AI voice: off by default, a Voice row that opens the list, reading switches, a test, and the screen reader advice", () => {
    const html = sheet("voice");
    expect(html).toMatch(/role="switch" aria-checked="false" class="settings-switch"><span class="settings-switch-label">AI voice</);
    // The voice is chosen on a page of its own, not in a dropdown.
    expect(html).not.toContain("<select");
    expect(html).toMatch(/<button type="button" class="settings-row-link" data-opens="voices" disabled=""><span class="settings-row-label">Voice<\/span><span class="settings-row-value">Best English voice \(automatic\)</);
    for (const label of ["Speed", "Pitch", "Voice volume", "The AI&#x27;s reactions", "Greetings", "The game over line", "Lines while you wait", "Tips and Why"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Test voice<");
    expect(html).toContain("If you use a screen reader, keep the AI voice off");
  });

  it("the voice list: the automatic choice first, then English voices, then the rest, each with its language in words and a button to hear it", () => {
    const html = sheet("voices");
    expect(html).toContain('aria-label="Back to AI voice"');
    expect(radios(html, "voice")).toEqual([
      ["", true],
      ["aria", false],
      ["daniel", false],
      ["hortense", false],
    ]);
    // The language some devices add to the name after a dash is dropped: it has its own line.
    expect(html).toContain(">Microsoft Hortense<");
    expect(html).toContain(">French (France)<");
    expect(html).toContain(">Best English voice (automatic)<");
    expect(html).toContain(">Microsoft Aria Online (Natural)<");
    expect(html).toContain(">American English<");
    expect(html).toContain(">British English<");
    expect(html).toContain('aria-label="Hear Daniel"');
  });

  it("animation: Off, Reduced, Standard, Cinematic and a speed from 0.75 to 1.5", () => {
    const html = sheet("animation");
    expect(radios(html, "animation")).toEqual([
      ["off", false],
      ["reduced", false],
      ["standard", true],
      ["cinematic", false],
    ]);
    expect(html).toMatch(/min="0.75" max="1.5" step="0.05"[^>]*value="1"/);
  });

  it("board and pieces: picture cards for themes, piece styles and coordinates, and the two highlights", () => {
    const html = sheet("board");
    expect(radios(html, "theme").map(([value]) => value)).toEqual(["classic", "slate", "felt", "minimal"]);
    expect(radios(html, "pieces").map(([value]) => value)).toEqual(["classic", "flat", "ringed"]);
    for (const label of ["Classic wood", "Dark slate", "Green felt", "Minimal light", "Flat", "Ringed", "Edge", "In squares"]) expect(html).toContain(`>${label}<`);
    for (const theme of ["classic", "slate", "felt", "minimal"]) expect(html).toContain(`settings-swatch settings-swatch-${theme}`);
    for (const style of ["classic", "flat", "ringed"]) expect(html).toContain(`settings-discs settings-discs-${style}`);
    expect(radios(html, "coordinates")).toEqual([
      ["off", false],
      ["edge", false],
      ["squares", true],
    ]);
    expect(html).toContain(">Show legal moves<");
    expect(html).toContain(">Show the last move<");
  });

  it("AI chat: the bubble switch, and the note that the 18+ rules stay", () => {
    const html = sheet("chat");
    expect(html).toContain(">Show chat bubbles<");
    expect(html).toContain("the 18+ badge and its consent stay the same");
  });

  it("profile: says there is none yet, and how wins are added", () => {
    const html = sheet("profile");
    expect(html).toContain("No leaderboard profile on this device yet.");
    expect(html).toContain("Wins against the AI are added to the leaderboard automatically.");
  });

  it("every control is labelled: switches by their text, choices by a legend, sliders by a label", () => {
    for (const page of ["sound", "haptics", "voice", "voices", "animation", "board", "chat"] as const) {
      const html = sheet(page);
      for (const sw of html.match(/<button type="button" role="switch"[^>]*>[\s\S]*?<\/button>/g) ?? []) {
        expect(sw).toMatch(/aria-checked="(true|false)"/);
        expect(sw).toMatch(/settings-switch-label">[^<]+</);
      }
      expect((html.match(/<fieldset class="settings-(choice|group)"/g) ?? []).length).toBe((html.match(/<fieldset class="settings-(choice|group)"[^>]*><legend[^>]*>[^<]+<\/legend>/g) ?? []).length);
      for (const slider of html.match(/<label class="settings-slider">[\s\S]*?<\/label>/g) ?? []) expect(slider).toMatch(/aria-valuetext="[^"]+"/);
    }
  });
});

describe("Settings: sizes and the board options' CSS", () => {
  const sheetCss = css("settings.css");

  it("every control is at least 44px", () => {
    for (const rule of [".settings-icon-button", ".settings-tile", ".settings-switch", ".settings-segment span", ".settings-pick-face", ".settings-slider", ".settings-row-link", ".settings-voice-pick", ".settings-voice-play", ".settings-test,\n.settings-reset"]) {
      const block = sheetCss.slice(sheetCss.indexOf(`${rule} {`));
      expect(block.slice(0, block.indexOf("}"))).toMatch(/(min-height|height): (4[4-9]|[5-9]\d|1\d\d)px/);
    }
  });

  it("each theme, piece style, coordinate mode and highlight switch has its CSS", () => {
    for (const theme of ["slate", "felt", "minimal"]) expect(sheetCss).toContain(`:root[data-board-theme="${theme}"] {`);
    for (const pieces of ["flat", "ringed"]) expect(sheetCss).toContain(`:root[data-pieces="${pieces}"]`);
    for (const coords of ["off", "edge"]) expect(sheetCss).toContain(`:root[data-coords="${coords}"]`);
    expect(sheetCss).toContain(':root[data-legal="off"] .square-destination::after');
    expect(sheetCss).toContain(':root[data-last-move="off"] .square-last-move.square-dark');
  });

  it("the squares, the last move tint and the coordinates take their colours from the theme", () => {
    expect(css("styles.css")).toContain("background: var(--last-move-square, #95653d)");
    expect(css("layout.css")).toContain("color: var(--coord-on-light, #6e4123)");
    expect(css("layout.css")).toContain("color: var(--coord-on-dark, #efd8ad)");
  });
});

describe("Settings: where it opens, and the chat bubble switch", () => {
  afterEach(() => settingsStore().reset());

  it("from the home screen", () => {
    const html = renderToStaticMarkup(createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop, onSettings: noop }));
    expect(html).toMatch(/<footer class="home-foot"><button type="button" class="home-link"><svg[^]*?<span>Settings<\/span><\/button>/);
  });

  it("from the game's Menu", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/\{ label: "Settings", icon: <GearIcon \/>, onSelect: \(\) => setSettingsOpen\(true\) \}/);
  });

  it("chat bubbles off: the AI keeps its robot under the board but says no chat lines (D64)", () => {
    const chat = { key: "move-2", text: "Oops, my piece now.", tone: "roast" as const, why: true };
    const lastWords = { key: "end-9", text: "Game over. Hahaha!", tone: "banter" as const, why: false, announce: false };
    expect(coachMessage(chat, true, null)).toBe(chat);
    expect(coachMessage(chat, false, lastWords)).toBeNull(); // only the robot (no I played line, D65)
    expect(coachMessage(null, true, lastWords)).toBe(lastWords); // after the game, the AI's last words stay (D71)
    const on = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }));
    settingsStore().update((s) => ({ ...s, chat: { bubbles: false } }));
    const off = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }));
    for (const html of [on, off]) {
      expect(html).toContain('class="coach"');
      expect(html).toContain('class="app app-ai"');
    }
    // The 18+ badge and the AI card stay exactly as they are.
    expect(off).toContain('<span class="chip-adult-age">18+</span>');
    expect(on.match(/<section class="card card-top[\s\S]*?<\/section>/)![0]).toBe(off.match(/<section class="card card-top[\s\S]*?<\/section>/)![0]);
  });
});
