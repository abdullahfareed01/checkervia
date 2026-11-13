// Render checks for the AI's move note and the "Why this move?" popup (their
// look is checked by eye).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { displayedPosition } from "../src/state/history";
import { AiMoveNote } from "../src/ui/AiMoveNote";
import { AiReasonDialog } from "../src/ui/AiReasonDialog";
import { explainShown } from "../src/ui/useAiExplanation";

const at = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

// vs-AI: black plays, then the AI (white) replies with its first legal move.
function afterAiMove(reason: string | null): GameState {
  const thinking = [at(5, 2), at(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
  return gameReducer(thinking, {
    type: "aiMoved",
    requestId: thinking.aiRequestId,
    move: thinking.legalMoves[0]!,
    reason,
  });
}

const note = (state: GameState) =>
  renderToStaticMarkup(
    createElement(AiMoveNote, { explanation: explainShown(state.mode, displayedPosition(state)), onWhy: () => {} }),
  );

describe("explainShown", () => {
  it("explains an AI move: label, the model's reason and engine facts", () => {
    const explanation = explainShown("vs-ai", displayedPosition(afterAiMove("Keeps the centre.")))!;
    expect(explanation.index).toBe(2);
    expect(explanation.reason).toBe("Keeps the centre.");
    expect(explanation.label).toMatch(/^[A-H][1-8] → [A-H][1-8]$/);
    expect(explanation.facts.some((fact) => fact.text.includes("legal moves"))).toBe(true);
  });

  it("gives no reason when the model gave none", () => {
    expect(explainShown("vs-ai", displayedPosition(afterAiMove(null)))!.reason).toBeNull();
  });
});

describe("AiMoveNote", () => {
  it("shows the AI's move and the Why button after an AI move", () => {
    const html = note(afterAiMove("Keeps the centre."));
    expect(html).toContain("AI played");
    expect(html).toContain("Why this move?");
  });

  it("shows nothing after a human move or in two-player mode", () => {
    const human = [at(5, 2), at(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
    expect(note(human)).toBe("");
    const twoPlayer = [at(5, 2), at(4, 3), at(2, 1), at(3, 0)].reduce(gameReducer, createGameState());
    expect(note(twoPlayer)).toBe("");
  });

  it("follows the history: reviewing the start shows nothing", () => {
    const reviewing = gameReducer(afterAiMove("x"), { type: "history", to: "first" });
    expect(note(reviewing)).toBe("");
  });
});

describe("AiReasonDialog", () => {
  const render = (reason: string | null) =>
    renderToStaticMarkup(
      createElement(AiReasonDialog, {
        moveLabel: "3,2 → 4,1",
        moveNumber: 2,
        reason,
        facts: [
          { tone: "good", text: "The moved piece cannot be captured next turn." },
          { tone: "info", text: "It chose 1 of 7 legal moves." },
        ],
        onClose: () => {},
      }),
    );

  it("is a modal dialog with a title and the move", () => {
    const html = render("Safe square.");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Why the AI played this");
    expect(html).toContain("Move 2: 3,2 → 4,1");
  });

  it("keeps the model's words apart from the engine's facts", () => {
    const html = render("Safe square.");
    expect(html).toContain("In its own words");
    expect(html).toContain("The game does not check it.");
    expect(html).toContain("Checked by the game engine");
    expect(html).toContain("ai-fact-good");
    expect(html).toContain("It chose 1 of 7 legal moves.");
  });

  it("shows the model's text as plain text, never as HTML", () => {
    const html = render('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("says so when there is no reason", () => {
    expect(render(null)).toContain("The model gave no reason for this move.");
  });
});

// BUG-002: the popup was drawn inside the note, whose fade-in animation makes
// it its own stacking layer, so the board's route line showed on top of the
// popup. It must be rendered under <body>. (The server renderer used by these
// tests cannot render portals, so this checks the source.)
describe("Why-this-move popup placement (BUG-002)", () => {
  const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");

  it("renders the popup through a portal into document.body", () => {
    expect(source).toMatch(/createPortal\(\s*<AiReasonDialog[\s\S]*?\/>,\s*document\.body,?\s*\)/);
  });
});
