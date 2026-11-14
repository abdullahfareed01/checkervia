// Render checks for the AI's move line in its bubble under the board (D64)
// and what "Why?" shows (Change 2; the look is checked by eye in the browser).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { displayedPosition } from "../src/state/history";
import { AiCoach } from "../src/ui/AiCoach";
import { WhyContent, WhySheet, hasWhy } from "../src/ui/WhyContent";
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

// The AI row under the board with a reaction to the AI move on screen, and
// Why? when that move has something to explain (D64, D65).
const note = (state: GameState, open = false) => {
  const explanation = explainShown(state.mode, displayedPosition(state));
  if (!hasWhy(explanation)) return "";
  const message = { key: "move", text: "Nice try.", tone: "banter" as const, why: true };
  return renderToStaticMarkup(createElement(AiCoach, { message, mood: "neutral", whyOpen: open, onWhy: () => {} }));
};

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

describe("Why? in the bubble (D64, D65)", () => {
  it("shows only the line and a collapsed Why? after an AI move, beside the robot", () => {
    const html = note(afterAiMove("Keeps the centre."));
    expect(html).toContain("Nice try.");
    expect(html).not.toContain("I played");
    expect(html).toContain("coach-avatar");
    expect(html).toMatch(/<button type="button" class="speech-why" aria-expanded="false"[^>]*>Why\?<\/button>/);
    expect(html).not.toContain("Keeps the centre.");
    expect(html).not.toContain("Checked by the game engine");
    expect(html).not.toContain("No reason");
  });

  it("when open, says so with aria-expanded but adds nothing under the board (the answer floats)", () => {
    const html = note(afterAiMove("Keeps the centre."), true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="why-panel"');
    expect(html).not.toContain('id="why-panel"');
    expect(html).not.toContain("Keeps the centre.");
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

describe("what Why? shows", () => {
  const facts = [
    { tone: "good" as const, text: "The moved piece cannot be captured next turn." },
    { tone: "info" as const, text: "It chose 1 of 7 legal moves." },
  ];
  const explanation = (reason: string | null, list = facts) => ({ index: 2, label: "C3 → D4", reason, reaction: null, facts: list });
  const render = (reason: string | null, list = facts) => renderToStaticMarkup(createElement(WhyContent, { explanation: explanation(reason, list) }));

  it("first the engine's checked facts, then the AI's own words, each labelled", () => {
    const html = render("Safe square.");
    expect(html).toContain("Checked by the game engine");
    expect(html).toContain("AI generated, may be wrong");
    expect(html.indexOf("Checked by the game engine")).toBeLessThan(html.indexOf("AI generated, may be wrong"));
    expect(html).toContain("ai-fact-good");
    expect(html).toContain("Safe square.");
  });

  it("without an explanation from the AI, only the engine part", () => {
    const html = render(null);
    expect(html).toContain("Checked by the game engine");
    expect(html).not.toContain("AI generated");
    expect(html).not.toMatch(/no reason/i);
  });

  it("with neither, there is no Why? at all", () => {
    expect(hasWhy(explanation(null, []))).toBe(false);
    expect(hasWhy(explanation("x", []))).toBe(true);
    expect(hasWhy(null)).toBe(false);
  });

  it("shows the model's text as plain text, never as HTML", () => {
    const html = render('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("a card floating above the page, with a close button", () => {
    const html = renderToStaticMarkup(createElement(WhySheet, { explanation: explanation("Safe."), onClose: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="why-panel"');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("Why AI played C3 → D4");
  });
});

// BUG-002: a popup drawn inside the game area can end up under the board's
// route line. The phone sheet must be rendered under <body>. (The server
// renderer used by these tests cannot render portals, so this checks the
// source.)
describe("Why? sheet placement (BUG-002)", () => {
  const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");

  it("renders the Why sheet through a portal into document.body", () => {
    expect(source).toMatch(/createPortal\(<WhySheet[\s\S]*?\/>, document\.body\)/);
  });
});
