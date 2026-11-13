// Cross-layer smoke test: the whole app renders from the real state layer
// without throwing. It does not simulate clicks (that would need a DOM library).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/ui/App";

describe("App (first render)", () => {
  const html = renderToStaticMarkup(createElement(App));

  it("says it is black's turn", () => {
    expect(html).toContain("to move");
    expect(html).toContain("Black");
  });

  it("draws 24 pieces and 32 clickable dark squares", () => {
    expect(html.match(/class="piece piece-/g)).toHaveLength(24);
    expect(html.match(/aria-label="Row /g)).toHaveLength(32);
  });

  it("shows 12 pieces for each side and a New game button", () => {
    expect(html.match(/<strong class="card-count">12<\/strong>/g)).toHaveLength(2);
    expect(html).toContain("New game");
  });

  it("does not show a winner or a capture warning at the start", () => {
    expect(html).not.toContain("wins!");
    expect(html).not.toContain("Capture is mandatory");
  });
});
