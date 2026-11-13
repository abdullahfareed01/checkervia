// Render checks for the AI level dialog, the level badge on the AI's card and
// the AI's speech bubble (their look is checked by eye in the browser).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { Home } from "../src/ui/Home";
import { LevelDialog } from "../src/ui/LevelDialog";
import { SpeechBubble, bubbleTimeMs } from "../src/ui/SpeechBubble";

const noop = () => {};

describe("LevelDialog", () => {
  const html = renderToStaticMarkup(createElement(LevelDialog, { initial: 3, onStart: noop, onCancel: noop }));

  it("is a modal dialog asking for the AI level", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Choose the AI level");
  });

  it("offers all four levels with what each one means", () => {
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    for (const name of ["Beginner", "Casual", "Strong", "Expert"]) expect(html).toContain(name);
    expect(html).toContain("6 turns ahead");
  });

  it("preselects the given level", () => {
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Strong/);
  });

  it("has Start game and Cancel", () => {
    expect(html).toContain("Start game");
    expect(html).toContain("Cancel");
  });
});

describe("the difficulty bar is gone", () => {
  it("is not on the home menu", () => {
    const home = renderToStaticMarkup(
      createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop }),
    );
    expect(home).not.toContain('type="range"');
  });

  it("is not in a vs-AI game", () => {
    expect(renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }))).not.toContain('type="range"');
  });
});

describe("the chosen level is visible in the game", () => {
  it("as a badge on the AI's card", () => {
    const html = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 4 } }));
    expect(html).toMatch(/class="badge badge-level"><svg[^>]*class="icon icon-crown"[\s\S]*?<\/svg>Expert</);
  });

  it("not in a two-player game", () => {
    expect(renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" } }))).not.toContain("badge-level");
  });
});

describe("SpeechBubble", () => {
  const bubble = (text: string | null, options: { faded?: boolean; hidden?: boolean; why?: boolean } = {}) =>
    renderToStaticMarkup(
      createElement(SpeechBubble, {
        message: { key: "k", text },
        faded: options.faded ?? false,
        hidden: options.hidden ?? false,
        onWhy: options.why === false ? undefined : noop,
      }),
    );

  it("shows the AI's words as plain text, with Why? and Close", () => {
    const html = bubble("I take the centre.");
    expect(html).toContain('class="speech"');
    expect(html).toContain("I take the centre.");
    expect(html).toContain("Why?");
    expect(html).toContain('aria-label="Close"');
  });

  it("can leave out Why? (for future lines that need no explanation)", () => {
    expect(bubble("Nice move!", { why: false })).not.toContain("Why?");
  });

  it("shows typing dots while the AI is thinking, with no buttons", () => {
    const html = bubble(null);
    expect(html).toContain("speech-typing");
    expect(html).toContain("The AI is thinking");
    expect(html).not.toContain("Why?");
  });

  it("fades (but stays) while the player holds a piece", () => {
    const html = bubble("Hello", { faded: true });
    expect(html).toContain("speech speech-faded");
    expect(html).toContain("Hello");
  });

  it("can be hidden (for example under the result popup)", () => {
    expect(bubble("Hello", { hidden: true })).toBe("");
  });

  it("shows nothing when there is no message", () => {
    expect(renderToStaticMarkup(createElement(SpeechBubble, { message: null }))).toBe("");
  });

  it("never renders the model's text as HTML", () => {
    expect(bubble("<b>bold</b>")).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("stays at least 20 s if the player does not move, longer for long text, at most 40 s", () => {
    expect(bubbleTimeMs("Ok.")).toBe(20_000);
    expect(bubbleTimeMs("word ".repeat(20))).toBe(26_000);
    expect(bubbleTimeMs("word ".repeat(100))).toBe(40_000);
  });
});
