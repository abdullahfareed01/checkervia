// Phase D on a device without vibration or speech voices (the test runner
// has neither): the haptics and voice controls are replaced by one line
// saying why, and the screen reader advice stays.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSheet } from "../src/ui/SettingsSheet";
import type { SettingsPage } from "../src/ui/SettingsSheet";

describe("Settings without vibration or voices", () => {
  const page = (initialPage: SettingsPage | null) => renderToStaticMarkup(createElement(SettingsSheet, { onClose: () => {}, initialPage }));
  const tiles = page(null);

  it("the tiles say so before they are opened", () => {
    expect(tiles).toMatch(/Haptics<\/span><span class="settings-tile-value">Not on this device</);
    expect(tiles).toMatch(/AI voice<\/span><span class="settings-tile-value">Not available here</);
  });

  it("haptics: no options, one line saying why, and the shake instead", () => {
    const html = page("haptics");
    expect(html).not.toContain('name="haptics"');
    expect(html).not.toContain("Test vibration");
    expect(html).toContain("This device cannot vibrate from a web page (iPhone and iPad do not allow it), so a tap that does nothing gives a small shake instead.");
  });

  it("AI voice: no controls, one line saying why, and the screen reader advice still there", () => {
    const html = page("voice");
    expect(html).not.toContain("Test voice");
    expect(html).not.toContain("Best English voice");
    expect(html).toContain("This browser has no speech voices, so the AI voice is not available here.");
    expect(html).toContain("If you use a screen reader, keep the AI voice off");
  });

  it("everything else is still there", () => {
    for (const title of ["Sound", "Animation", "Board and pieces", "AI chat", "Profile"]) expect(tiles).toContain(`<span class="settings-tile-title">${title}</span>`);
  });
});
