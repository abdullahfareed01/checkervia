// Render checks for the history arrows and move list.
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { at } from "../src/engine/testUtils";
import type { MoveListItem } from "../src/state/history";
import { HistoryControls } from "../src/ui/HistoryControls";

const moves: MoveListItem[] = [
  { number: 1, player: "black", move: { from: at(5, 0), to: at(4, 1), path: [at(4, 1)], captured: [] }, crowned: false },
  { number: 2, player: "white", move: { from: at(2, 1), to: at(3, 0), path: [at(3, 0)], captured: [] }, crowned: false },
];

function render(overrides: Partial<ComponentProps<typeof HistoryControls>> = {}) {
  return renderToStaticMarkup(
    createElement(HistoryControls, {
      index: 2,
      total: 2,
      live: true,
      canBack: true,
      canForward: false,
      moves,
      nameOf: (item) => (item.player === "black" ? "You" : "AI"),
      onGo: () => {},
      ...overrides,
    }),
  );
}

// The `disabled` attribute of the button with this accessible label.
function isDisabled(html: string, label: string): boolean {
  const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
  return button.includes('disabled=""');
}

describe("HistoryControls", () => {
  it("has the four arrows", () => {
    const html = render();
    ["First position", "Previous move", "Next move", "Latest position"].forEach((label) =>
      expect(html).toContain(`aria-label="${label}"`),
    );
  });

  it("at the latest position: forward and latest are disabled, back is enabled", () => {
    const html = render();
    expect(isDisabled(html, "Next move")).toBe(true);
    expect(isDisabled(html, "Latest position")).toBe(true);
    expect(isDisabled(html, "Previous move")).toBe(false);
  });

  it("at the start: back and first are disabled", () => {
    const html = render({ index: 0, live: false, canBack: false, canForward: true });
    expect(isDisabled(html, "First position")).toBe(true);
    expect(isDisabled(html, "Previous move")).toBe(true);
    expect(isDisabled(html, "Next move")).toBe(false);
  });

  it("says where we are", () => {
    expect(render()).toContain("Move 2 of 2");
    expect(render({ index: 0, live: false, canBack: false, canForward: true })).toContain("Start · 2 moves");
    expect(render({ index: 0, total: 0, moves: [], canBack: false })).toContain("No moves yet");
  });

  it("while reviewing, offers a way back to the game", () => {
    const html = render({ index: 1, live: false, canForward: true });
    expect(html).toContain("Back to the game");
    expect(html).toContain("history-reviewing");
    expect(render()).not.toContain("Back to the game");
  });

  it("lists the moves and marks the one on screen", () => {
    const html = render({ index: 1, live: false, canForward: true });
    expect(html).toContain("A3 → B4");
    expect(html).toContain("B6 → A5");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain(">You<");
    expect(html).toContain(">AI<");
  });
});
