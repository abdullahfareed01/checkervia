// Phase D on a device without vibration or speech voices (the test runner
// has neither): the haptics and voice controls are replaced by one line
// saying why, and the screen reader advice stays.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSheet } from "../src/ui/SettingsSheet";

describe("Settings without vibration or voices", () => {
  const html = renderToStaticMarkup(createElement(SettingsSheet, { onClose: () => {} }));

  it("haptics: no options, one line saying why, and the shake instead", () => {
    expect(html).not.toContain('name="haptics"');
    expect(html).not.toContain("Test vibration");
    expect(html).toContain("This device cannot vibrate from a web page (iPhone and iPad do not allow it), so a tap that does nothing gives a small shake instead.");
  });

  it("AI voice: no controls, one line saying why, and the screen reader advice still there", () => {
    expect(html).not.toContain("Test voice");
    expect(html).not.toContain("Best English voice");
    expect(html).toContain("This browser has no speech voices, so the AI voice is not available here.");
    expect(html).toContain("If you use a screen reader, keep the AI voice off");
  });

  it("everything else is still there", () => {
    for (const title of ["Sound", "Animation", "Board and pieces", "AI chat"]) expect(html).toContain(`<summary>${title}</summary>`);
  });
});
