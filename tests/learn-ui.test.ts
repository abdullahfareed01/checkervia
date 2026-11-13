// Render checks for Learn mode (its look and playback are checked by eye).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LESSONS } from "../src/learn/lessons";
import { Learn } from "../src/ui/Learn";

describe("Learn (first frame)", () => {
  const html = renderToStaticMarkup(createElement(Learn, { onMenu: () => {} }));

  it("starts on the first lesson's intro", () => {
    expect(html).toContain(`Lesson 1 of ${LESSONS.length}`);
    expect(html).toContain("Intro");
    expect(html).toContain(LESSONS[0]!.title);
    expect(html).toContain(LESSONS[0]!.intro);
  });

  it("shows two robots, Gold Bot (Black) and Cyan Bot (White)", () => {
    expect(html).toContain("Gold Bot, Black");
    expect(html).toContain("Cyan Bot, White");
    expect(html.match(/class="badge">BOT</g)).toHaveLength(2);
  });

  it("draws the full starting board, and nothing can be clicked", () => {
    expect(html.match(/class="piece piece-/g)).toHaveLength(24);
    expect(html).not.toContain("selectable");
  });

  it("has playback controls (playing at first), a lesson list and a Menu button", () => {
    expect(html).toContain(">Pause<");
    expect(html).toContain('aria-label="Previous"');
    expect(html).toContain('aria-label="Next"');
    for (const scene of LESSONS) expect(html).toContain(scene.title);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain(">Menu<");
  });
});
