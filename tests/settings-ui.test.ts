// Phase D: the Settings sheet on a device with vibration and speech voices
// (both faked here), the board options' CSS, the entry points, and the
// chat bubble switch. (tests/settings-ui-unavailable.test.ts covers a device
// without them.)
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/haptics", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/haptics")>();
  const fake = { supported: true, pulse: () => true };
  return { ...real, haptics: () => fake };
});
vi.mock("../src/ui/voice/voiceEngine", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ui/voice/voiceEngine")>();
  const voices = [
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
const sheet = () => renderToStaticMarkup(createElement(SettingsSheet, { onClose: noop }));
// The radio inputs of a group, in order, each with whether it is chosen
// (the server renderer may write `checked` before or after `value`).
const radios = (html: string, name: string) =>
  [...html.matchAll(/<input type="radio"[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`name="${name}"`))
    .map((tag) => [tag.match(/value="(\w+)"/)![1], tag.includes('checked=""')] as const);
const css = (name: string) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("Settings sheet", () => {
  it("is a labelled dialog with a close button", () => {
    const html = sheet();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="settings-title"');
    expect(html).toContain('aria-label="Close"');
  });

  it("has every section, in order, the first one open, and Reset to defaults", () => {
    const html = sheet();
    const titles = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1]);
    expect(titles).toEqual(["Sound", "Haptics", "AI voice", "Animation", "Board and pieces", "AI chat", "Profile"]);
    expect(html).toMatch(/<details class="settings-section" open=""><summary>Sound</);
    expect(html).toContain(">Reset to defaults<");
  });

  it("sound: master switch, volume, game and interface sounds, and a test", () => {
    const html = sheet();
    expect(html).toMatch(/role="switch" aria-checked="true" class="settings-switch"><span class="settings-switch-label">Sound</);
    expect(html).toMatch(/Volume<output>60 percent<\/output>/);
    expect(html).toContain(">Game sounds<");
    expect(html).toContain(">Interface sounds<");
    expect(html).toContain(">Test sound<");
  });

  it("haptics: Off, Light, Standard, Strong (Standard chosen) and a test", () => {
    const html = sheet();
    expect(radios(html, "haptics")).toEqual([
      ["off", false],
      ["light", false],
      ["standard", true],
      ["strong", false],
    ]);
    expect(html).toContain(">Test vibration<");
  });

  it("AI voice: off by default, the device's voices with an automatic best choice, reading switches, a test, and the screen reader advice", () => {
    const html = sheet();
    expect(html).toMatch(/role="switch" aria-checked="false" class="settings-switch"><span class="settings-switch-label">AI voice</);
    expect(html).toContain("Best English voice (automatic)");
    expect(html).toContain("Microsoft Aria Online (Natural) (en-US)");
    for (const label of ["Speed", "Pitch", "Voice volume", "The AI&#x27;s reactions", "Greetings", "The game over line", "Lines while you wait", "Tips and Why"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(">Test voice<");
    expect(html).toContain("If you use a screen reader, keep the AI voice off");
  });

  it("animation: Off, Reduced, Standard, Cinematic and a speed from 0.75 to 1.5", () => {
    const html = sheet();
    expect(radios(html, "animation")).toEqual([
      ["off", false],
      ["reduced", false],
      ["standard", true],
      ["cinematic", false],
    ]);
    expect(html).toMatch(/min="0.75" max="1.5" step="0.05"[^>]*value="1"/);
  });

  it("board and pieces: themes, piece styles, coordinates, and the two highlights", () => {
    const html = sheet();
    expect(radios(html, "theme").map(([value]) => value)).toEqual(["classic", "slate", "felt", "minimal"]);
    expect(radios(html, "pieces").map(([value]) => value)).toEqual(["classic", "flat", "ringed"]);
    for (const label of ["Classic wood", "Dark slate", "Green felt", "Minimal light", "Flat", "Ringed", "Edge", "In squares"]) expect(html).toContain(`>${label}<`);
    expect(radios(html, "coordinates")).toEqual([
      ["off", false],
      ["edge", false],
      ["squares", true],
    ]);
    expect(html).toContain(">Show legal moves<");
    expect(html).toContain(">Show the last move<");
  });

  it("AI chat: the bubble switch, and the note that the 18+ rules stay", () => {
    const html = sheet();
    expect(html).toContain(">Show chat bubbles<");
    expect(html).toContain("the 18+ badge and its consent stay the same");
  });

  it("every control is labelled: switches by their text, choices by a legend, sliders by a label", () => {
    const html = sheet();
    for (const sw of html.match(/<button type="button" role="switch"[^>]*>[\s\S]*?<\/button>/g)!) {
      expect(sw).toMatch(/aria-checked="(true|false)"/);
      expect(sw).toMatch(/settings-switch-label">[^<]+</);
    }
    expect(html.match(/<fieldset class="settings-choice"/g)!.length).toBe(html.match(/<fieldset class="settings-choice"[^>]*><legend>[^<]+<\/legend>/g)!.length);
    for (const slider of html.match(/<label class="settings-slider">[\s\S]*?<\/label>/g)!) expect(slider).toMatch(/aria-valuetext="[^"]+"/);
  });
});

describe("Settings: sizes and the board options' CSS", () => {
  const sheetCss = css("settings.css");

  it("every control is at least 44px", () => {
    for (const rule of [".settings-close", ".settings-switch", ".settings-segment span", ".settings-slider", ".settings-select select", ".settings-test,\n.settings-reset"]) {
      const block = sheetCss.slice(sheetCss.indexOf(`${rule} {`));
      expect(block.slice(0, block.indexOf("}"))).toMatch(/(min-height|height): 44px/);
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
    expect(html).toMatch(/<footer class="home-foot"><button type="button" class="link-button">Settings<\/button>/);
  });

  it("from the game's Menu", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/\{ label: "Settings", onSelect: \(\) => setSettingsOpen\(true\) \}/);
  });

  it("chat bubbles off: no bubble and no slot kept for it; on: both", () => {
    const on = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }));
    expect(on).toContain("speech-slot");
    expect(on).toContain('class="app app-ai"');
    settingsStore().update((s) => ({ ...s, chat: { bubbles: false } }));
    const off = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }));
    expect(off).not.toContain("speech-slot");
    expect(off).not.toContain("app-ai");
    // The 18+ badge and the AI card stay exactly as they are.
    expect(off).toContain('<span class="chip-adult-age">18+</span>');
    expect(on.match(/<section class="card card-top[\s\S]*?<\/section>/)![0]).toBe(off.match(/<section class="card card-top[\s\S]*?<\/section>/)![0]);
  });
});
