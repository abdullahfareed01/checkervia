// Guards for the long-game jank fix (DEV-009): a growing move list must not
// make every move rebuild every row, and the list must never scroll the page.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameState } from "../src/state/gameReducer";
import { moveList } from "../src/state/history";

// Plays the first legal move for whoever is to move, `count` times.
function play(state: GameState, count: number): GameState {
  for (let i = 0; i < count && state.legalMoves.length > 0; i++) {
    const move = state.legalMoves[0]!;
    state = gameReducer(state, { type: "click", position: move.from });
    state = gameReducer(state, { type: "click", position: move.to });
    for (const step of move.path.slice(0, -1)) {
      if (state.pendingRoutes.length > 0) state = gameReducer(state, { type: "click", position: step });
    }
  }
  return state;
}

describe("move list in a long game", () => {
  it("reuses the items of earlier moves, so their rows can skip re-drawing", () => {
    const earlier = play(createGameState(), 20);
    const later = play(earlier, 1);
    const before = moveList(earlier);
    const after = moveList(later);

    expect(after).toHaveLength(before.length + 1);
    before.forEach((item, i) => expect(after[i]).toBe(item)); // same objects
  });

  it("still numbers and fills every item correctly", () => {
    const items = moveList(play(createGameState(), 12));
    expect(items.map((item) => item.number)).toEqual(Array.from({ length: items.length }, (_, i) => i + 1));
    expect(items.every((item) => item.move && item.player)).toBe(true);
  });
});

describe("move list scrolling", () => {
  const source = readFileSync(new URL("../src/ui/HistoryControls.tsx", import.meta.url), "utf8");

  it("does not call scrollIntoView, which also scrolled the page on phones", () => {
    expect(source).not.toMatch(/\.scrollIntoView\b/);
    expect(source).toContain("scrollListTo(");
  });
});
