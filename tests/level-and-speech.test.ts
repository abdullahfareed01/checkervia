// Render checks for the AI level dialog, the level badge on the AI's card and
// the AI's speech bubble (their look is checked by eye in the browser).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";
import { Home } from "../src/ui/Home";
import { LevelDialog } from "../src/ui/LevelDialog";
import { ChatBubble } from "../src/ui/ChatBubble";
import type { BubbleMessage } from "../src/ui/ChatBubble";

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
    for (const name of ["Easy", "Medium", "Hard", "Strongest"]) expect(html).toContain(name);
    expect(html).toContain("6 turns ahead");
  });

  it("preselects the given level", () => {
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Hard/);
  });

  it("has Start game and Cancel", () => {
    expect(html).toContain("Start game");
    expect(html).toContain("Cancel");
  });
});

describe("the difficulty bar is gone", () => {
  it("is not on the home menu", () => {
    const home = renderToStaticMarkup(
      createElement(Home, { aiStatus: "ready", onPlay: noop, onHowToPlay: noop, onLearn: noop, onRecheck: noop, onTerms: noop }),
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
    expect(html).toMatch(/class="badge badge-level"><svg[^>]*class="icon icon-crown"[\s\S]*?<\/svg>Strongest</);
  });

  it("not in a two-player game", () => {
    expect(renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" } }))).not.toContain("badge-level");
  });
});

describe("ChatBubble (Change 3)", () => {
  const message = (text: string | null, tone: BubbleMessage["tone"] = "banter", why = true): BubbleMessage => ({ key: "k", text, tone, why });
  const bubble = (value: BubbleMessage | null, onWhy: (() => void) | undefined = noop) =>
    renderToStaticMarkup(createElement(ChatBubble, { message: value, placement: "card", onWhy }));

  it("shows the AI's line as plain text with a collapsed Why?", () => {
    const html = bubble(message("I take the centre."));
    expect(html).toContain('class="speech speech-banter"');
    expect(html).toContain("I take the centre.");
    expect(html).toMatch(/aria-expanded="false" aria-controls="why-panel">Why\?</);
  });

  it("leaves out Why? for lines that need no explanation", () => {
    expect(bubble(message("Hello there.", "banter", false))).not.toContain("Why?");
  });

  it("shows typing dots while the AI is thinking, with no buttons", () => {
    const html = bubble(message(null));
    expect(html).toContain("speech-typing");
    expect(html).not.toContain("Why?");
  });

  it("keeps its slot when there is nothing to say, so the board never moves", () => {
    const html = bubble(null);
    expect(html).toContain('class="speech-slot speech-slot-card"');
    expect(html).not.toContain('class="speech ');
  });

  it("never renders the model's text as HTML", () => {
    expect(bubble(message("<b>bold</b> <script>x</script>"))).toContain("&lt;b&gt;bold&lt;/b&gt; &lt;script&gt;");
  });

  it("colour and a label for a roast or respect; plain banter has neither", () => {
    expect(bubble(message("Oops.", "roast"))).toMatch(/speech-roast[\s\S]*<span class="speech-label">Your slip<\/span>Oops\./);
    expect(bubble(message("Fine.", "respect"))).toMatch(/speech-respect[\s\S]*>Respect</);
    expect(bubble(message("Hi.", "banter"))).not.toContain("speech-label");
  });

  it("announces a new line once through a polite live region", () => {
    const html = bubble(message("Your move."));
    expect(html).toMatch(/<p class="sr-only" aria-live="polite">Your move\.<\/p>/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(bubble(message(null))).toMatch(/<p class="sr-only" aria-live="polite"><\/p>/);
  });
});
