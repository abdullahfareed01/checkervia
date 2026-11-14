// Render checks for the move list (Previous and Next are on the action
// bar: tests/action-bar.test.ts).
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
      moves,
      nameOf: (item) => (item.player === "black" ? "You" : "AI"),
      onGo: () => {},
      ...overrides,
    }),
  );
}

describe("HistoryControls", () => {
  it("has no arrows of its own, and a Start row that goes to the first position", () => {
    const html = render();
    expect(html).not.toContain("history-arrow");
    expect(html).toContain('<button type="button" class="history-item history-start">Start</button>');
    expect(render({ index: 0, live: false })).toContain('history-start" aria-current="step">Start');
  });

  it("says where we are", () => {
    expect(render()).toContain("Move 2 of 2");
    expect(render({ index: 0, live: false })).toContain("Start · 2 moves");
    expect(render({ index: 0, total: 0, moves: [] })).toContain("No moves yet");
  });

  it("while reviewing, offers a way back to the game", () => {
    const html = render({ index: 1, live: false });
    expect(html).toContain("Back to the game");
    expect(html).toContain("history-reviewing");
    expect(render()).not.toContain("Back to the game");
  });

  it("lists the moves and marks the one on screen", () => {
    const html = render({ index: 1, live: false });
    expect(html).toContain("A3 → B4");
    expect(html).toContain("B6 → A5");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain(">You<");
    expect(html).toContain(">AI<");
  });
});
