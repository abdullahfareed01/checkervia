// D65: each side's chance of winning, the bar that shows it, the player's
// chosen avatar on their card and the splash style title.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { percentages, winChance } from "../src/ai/winChance";
import { boardFrom, initialBoard } from "../src/engine";
import { App } from "../src/ui/App";
import { PlayerCard } from "../src/ui/PlayerCard";
import { GameTitle } from "../src/ui/TopBar";
import { WinChanceBar } from "../src/ui/WinChanceBar";

describe("winChance", () => {
  it("is even at the start, whoever moves", () => {
    expect(winChance(initialBoard(), "black")).toBeCloseTo(0.5, 5);
  });

  it("favours the side a piece up, and more so on an emptier board", () => {
    // Full board, White one man short.
    const full = initialBoard().map((row, r) => row.map((piece, c) => (r === 0 && c === 1 ? null : piece)));
    const leadFull = winChance(full, "black");
    expect(leadFull).toBeGreaterThan(0.6);
    expect(leadFull).toBeLessThan(0.85);
    // Two against one with few pieces left (nothing to capture): close to decided.
    const endgame = boardFrom(["........", "........", "........", "........", "........", "..b.....", "........", "b.....w."]);
    expect(winChance(endgame, "white")).toBeGreaterThan(leadFull);
  });

  it("is the same position seen from the other side", () => {
    const board = boardFrom([".w...w..", "........", "........", "........", "........", "..b.....", "........", "b...b..."]);
    // Turned half a turn with the colours swapped: the same game for the other side.
    const mirrored = board.map((_, r) => board[7 - r]!.map((__, c) => {
      const piece = board[7 - r]![7 - c];
      return piece ? { ...piece, player: piece.player === "black" ? ("white" as const) : ("black" as const) } : null;
    }));
    expect(winChance(mirrored, "white")).toBeCloseTo(1 - winChance(board, "black"), 5);
  });

  it("is 0 for the side with no move, and close to 0 or 1 for a forced result", () => {
    const stuck = boardFrom(["........", "........", "........", "........", "........", "........", "........", "w......."]);
    expect(winChance(stuck, "black")).toBe(0);
    const doubleJump = boardFrom(["........", "........", "........", "........", ".....w..", "........", "...w....", "..b....."]);
    expect(winChance(doubleJump, "black")).toBe(0.99);
  });

  it("is quick enough to run on the page after every move", () => {
    const start = performance.now();
    winChance(initialBoard(), "black");
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("whole percentages that add up to 100", () => {
    expect(percentages(0.5)).toEqual([50, 50]);
    expect(percentages(0.625)).toEqual([63, 37]);
    expect(percentages(0.01)).toEqual([1, 99]);
  });
});

describe("the chance to win bar", () => {
  const html = renderToStaticMarkup(createElement(WinChanceBar, { chance: 0.62, black: "You", white: "AI" }));

  it("says both chances to screen readers, without a dash", () => {
    expect(html).toContain('role="img" aria-label="Chance to win: You 62%, AI 38%"');
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/[‐-―-]/);
  });

  it("each side's part is its own share of the bar", () => {
    expect(html).toContain('class="winbar-part winbar-black" style="flex-basis:62%"');
    expect(html).toContain('class="winbar-part winbar-white" style="flex-basis:38%"');
  });

  it("sits with the board on the game screen, between the board and your card", () => {
    const app = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2 } }));
    const area = app.match(/<div class="board-area">[\s\S]*?<section class="card card-bottom/)![0];
    expect(area).toContain('class="board-frame"');
    expect(area).toContain("Chance to win: You 50%, AI 50%");
    const two = renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" } }));
    expect(two).toContain("Chance to win: Black 50%, White 50%");
  });
});

describe("your card shows your chosen avatar", () => {
  const card = (portrait: string | null) =>
    renderToStaticMarkup(
      createElement(PlayerCard, { player: "black", name: "You", robot: false, pieces: 12, captured: 0, toMove: true, thinking: false, winner: false, placement: "bottom", portrait }),
    );

  it("the avatar's picture when one is chosen, a person icon otherwise", () => {
    expect(card("a12")).toContain('<div class="avatar avatar-portrait"><img src="/avatars/a12.svg"');
    expect(card(null)).toContain("icon-human");
    expect(card("not-an-avatar")).toContain("icon-human");
  });
});

describe("the game screen's title", () => {
  it("looks like the splash screen: the name over a gold rule with a crown", () => {
    const html = renderToStaticMarkup(createElement(GameTitle, { text: "Checkervia" }));
    expect(html).toMatch(/^<div class="game-title game-title-splash"><h1>Checkervia<\/h1><span class="game-title-rule" aria-hidden="true"><span><\/span><svg class="icon icon-crown"/);
  });

  it("the home screen keeps its large title with laurels", () => {
    expect(renderToStaticMarkup(createElement(GameTitle, { text: "Checkervia", large: true }))).toContain("icon-laurel");
  });
});
