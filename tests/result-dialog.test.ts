// Render checks for the end-of-game popup (its look is checked by eye).
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultDialog, formatDuration } from "../src/ui/ResultDialog";

const stats = {
  black: { moves: 21, captured: 12, kingsMade: 2, bestChain: 3 },
  white: { moves: 20, captured: 7, kingsMade: 0, bestChain: 1 },
};

function render(overrides: Partial<ComponentProps<typeof ResultDialog>> = {}): string {
  return renderToStaticMarkup(
    createElement(ResultDialog, {
      winner: "black",
      mode: "vs-ai",
      reason: "White has no pieces left.",
      stats,
      pieces: { black: 5, white: 0 },
      totalMoves: 41,
      durationMs: 185_000,
      onPlayAgain: () => {},
      onReview: () => {},
      onClose: () => {},
      ...overrides,
    }),
  );
}

describe("ResultDialog", () => {
  it("is a modal dialog with a title", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="result-title"');
  });

  it("when you beat the AI: victory, trophy and confetti", () => {
    const html = render();
    expect(html).toContain("You win!");
    expect(html).toContain("result-victory");
    expect(html).toContain("icon-trophy");
    expect(html).toContain('class="confetti"');
  });

  it("when the AI wins: an AI winner popup with the robot and no confetti", () => {
    const html = render({ winner: "white", reason: "Black has no legal moves." });
    expect(html).toContain("AI wins");
    expect(html).toContain("result-defeat");
    expect(html).toContain("icon-robot");
    expect(html).not.toContain('class="confetti"');
    expect(html).toContain("Black has no legal moves.");
  });

  it("in a two-player game: names the winning side", () => {
    const html = render({ mode: "two-player", winner: "white" });
    expect(html).toContain("White wins!");
    expect(html).toContain("result-winner");
  });

  it("shows the stats of both sides, winner first", () => {
    const html = render();
    expect(html).toContain("Pieces left");
    expect(html).toContain("Pieces captured");
    expect(html).toContain("Kings made");
    expect(html).toContain("Best multi jump");
    expect(html).toContain("3 in one move");
    expect(html.indexOf(">You<")).toBeLessThan(html.indexOf(">AI<"));
    expect(html).toContain(">12<"); // black's captures
    expect(html).toContain(">7<"); // white's captures
  });

  it("shows the total moves and the game time", () => {
    const html = render();
    expect(html).toContain("41 moves in total");
    expect(html).toContain("Game time 3:05");
    expect(render({ durationMs: null })).not.toContain("Game time");
  });

  it("offers Play again and Review game straight away", () => {
    const html = render();
    expect(html).toContain("Play again");
    expect(html).toContain("Review game");
  });
});

describe("formatDuration", () => {
  it("writes minutes and two-digit seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_400)).toBe("0:09");
    expect(formatDuration(185_000)).toBe("3:05");
    expect(formatDuration(3_600_000)).toBe("60:00");
  });
});
