// Render checks for the AI-related UI. They draw each state to HTML; they do
// not simulate clicks (no DOM test library is installed).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGameState } from "../src/state/gameReducer";
import { App } from "../src/ui/App";
import { Board } from "../src/ui/Board";
import { ModeSelector } from "../src/ui/ModeSelector";
import { StatusBar } from "../src/ui/StatusBar";
import type { ComponentProps } from "react";

const noop = () => {};

function status(overrides: Partial<ComponentProps<typeof StatusBar>> = {}): string {
  return renderToStaticMarkup(
    createElement(StatusBar, {
      currentPlayer: "white",
      winner: null,
      winReason: null,
      choosingRoute: false,
      aiPhase: "idle",
      aiFailureReasons: [],
      onRetryAi: noop,
      ...overrides,
    }),
  );
}

describe("StatusBar in AI mode", () => {
  it("shows 'AI is thinking' with no Retry button while the AI works", () => {
    const html = status({ aiPhase: "thinking" });
    expect(html).toContain("AI is thinking");
    expect(html).not.toContain("Retry");
  });

  it("shows the fallback message and a Retry button when the AI failed", () => {
    const html = status({ aiPhase: "failed", aiFailureReasons: ["The AI service answered with status 502."] });
    expect(html).toContain("The AI could not make a move");
    expect(html).toContain("Retry");
    expect(html).toContain("no move was played");
    expect(html).toContain("status 502");
  });

  it("shows the normal turn text when the AI is idle", () => {
    const html = status({ currentPlayer: "black" });
    expect(html).toContain("to move");
    expect(html).not.toContain("AI is thinking");
  });

  it("announces the winner ahead of any AI text", () => {
    const html = status({ winner: "white", winReason: "Black has no legal moves." });
    expect(html).toContain("wins!");
    expect(html).not.toContain("Retry");
  });
});

describe("ModeSelector", () => {
  const render = (mode: "two-player" | "vs-ai") =>
    renderToStaticMarkup(createElement(ModeSelector, { mode, needsConfirmation: false, onChange: noop }));

  it("offers Two Players and Play vs AI, marking the current one", () => {
    const html = render("two-player");
    expect(html).toContain("Two Players");
    expect(html).toContain("Play vs AI");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("says the colour is random each game in AI mode (D81), and no longer that you play Black", () => {
    expect(render("vs-ai")).toContain("Random colour each game");
    expect(render("vs-ai")).not.toContain("You play Black");
    expect(render("two-player")).not.toContain("Random colour");
  });
});

describe("board lock", () => {
  const board = createGameState().board;
  const view = (locked: boolean) => ({
    board,
    selected: null,
    selectable: [],
    mustCapture: [],
    destinations: [],
    routeChoices: [],
    lastMove: null,
    locked,
  });
  const render = (locked: boolean) =>
    renderToStaticMarkup(createElement(Board, { view: view(locked), onSquareClick: noop }));

  it("disables every dark square while locked", () => {
    const html = render(true);
    expect(html.match(/disabled=""/g)).toHaveLength(32);
    expect(html).toContain("board-locked");
  });

  it("leaves them enabled otherwise", () => {
    expect(render(false)).not.toContain('disabled=""');
  });
});

describe("App", () => {
  it("starts in two-player mode with the mode selector visible", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("Two Players");
    expect(html).toContain("Play vs AI");
    expect(html).not.toContain("AI is thinking");
  });
});
