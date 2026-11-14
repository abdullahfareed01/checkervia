// The chat bubble's life (Change 3, D65): typing dots while the AI thinks,
// the reaction after its move, kept while the player picks up a piece and
// cleared once their move is played, on New game and on a mode change;
// nothing while reviewing or in two player games. Plus the 140 character cap
// on AI lines.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAX_LINE_LENGTH, capLength, checkReaction, tidyLine } from "../src/ai/language";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { ChatBubble, toneClasses } from "../src/ui/ChatBubble";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

// Black plays C3 → D4, the AI answers with its first legal move and a line.
function afterAi(reaction?: string): GameState {
  const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
  return gameReducer(thinking, {
    type: "aiMoved",
    requestId: thinking.aiRequestId,
    move: thinking.legalMoves[0]!,
    ...(reaction ? { reaction } : {}),
  });
}

describe("reactionBubble", () => {
  it("shows typing dots while the AI thinks", () => {
    const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
    expect(reactionBubble(thinking)).toMatchObject({ text: null, why: false });
  });

  it("then the AI's reaction, with Why?", () => {
    expect(reactionBubble(afterAi("Bold start."))).toMatchObject({ text: "Bold start.", tone: "banter", why: true });
  });

  it("without a reaction, nothing (no I played line, D65)", () => {
    expect(reactionBubble(afterAi())).toBeNull();
  });

  it("stays while the player picks up a piece, and clears once their move is played (D65)", () => {
    const state = afterAi("Bold start.");
    const black = state.legalMoves[0]!;
    const picked = gameReducer(state, click(black.from.row, black.from.col));
    expect(picked.selected).not.toBeNull();
    expect(reactionBubble(picked)?.text).toBe("Bold start.");
    const played = gameReducer(picked, click(black.to.row, black.to.col));
    expect(played.history.length).toBe(state.history.length + 1);
    expect(reactionBubble({ ...played, aiPhase: "idle" })).toBeNull();
  });

  it("is cleared by New game and by a mode change", () => {
    const state = afterAi("Bold start.");
    expect(reactionBubble(gameReducer(state, { type: "newGame" }))).toBeNull();
    expect(reactionBubble(gameReducer(state, { type: "newGame", mode: "vs-ai", level: 4 }))).toBeNull();
    expect(reactionBubble(gameReducer(state, { type: "setMode", mode: "two-player" }))).toBeNull();
  });

  it("shows nothing while reviewing an older position", () => {
    expect(reactionBubble(gameReducer(afterAi("x"), { type: "history", to: "first" }))).toBeNull();
  });

  it("shows nothing in two player games", () => {
    const two = [click(5, 2), click(4, 3), click(2, 1), click(3, 0)].reduce(gameReducer, createGameState());
    expect(reactionBubble(two)).toBeNull();
  });
});

describe("the 140 character cap on AI lines", () => {
  const long = "You walked right into that one and now I am going to take every single piece you have left on this board, one by one, slowly, and enjoy it a lot.";

  it("leaves short lines alone", () => {
    expect(capLength("Your move.")).toBe("Your move.");
  });

  it("cuts long lines at a word boundary, never in the middle of a word", () => {
    const capped = capLength(long);
    expect(long.length).toBeGreaterThan(MAX_LINE_LENGTH);
    expect(capped.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    expect(capped.endsWith("…")).toBe(true);
    const kept = capped.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    expect(long[kept.length]).toMatch(/[\s,]/); // the next character was not part of a word
  });

  it("drops a comma left at the cut", () => {
    expect(capLength("one two, three four", 10)).toBe("one two…");
  });

  it("is applied after the hyphen sanitizer, and to every checked reaction", () => {
    const dashed = "brain-fart ".repeat(20).trim();
    expect(tidyLine(dashed)).not.toContain("-");
    expect(tidyLine(dashed).length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
    expect(checkReaction(long, 2, null).length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
  });

  it("is asked for in the prompt too", async () => {
    const { buildPrompt } = await import("../src/ai/prompt");
    const { getLegalMoves, initialBoard } = await import("../src/engine");
    const prompt = buildPrompt(initialBoard(), "black", getLegalMoves(initialBoard(), "black"), undefined, { label: "x", judgement: null });
    expect(prompt).toContain("at most 140 characters");
  });
});

// Owner's review: the bubble is never red; only a line with 18+ words is
// shown in red text, and a blunder keeps its "Your slip" label instead.
describe("bubble colours after the owner's review", () => {
  const html = (tone: "roast" | "respect" | "banter", text: string) =>
    renderToStaticMarkup(createElement(ChatBubble, { message: { key: "k", text, tone, why: false } }));

  it("a clean roast keeps its label but not red text", () => {
    const out = html("roast", "That slip gave me a tasty capture, enjoy the lesson!");
    expect(out).toContain("Your slip");
    expect(out).not.toContain("speech-adult");
  });

  it("a line with mild swearing or an insult gets red text", () => {
    expect(toneClasses({ tone: "roast", text: "Damn, that was a gift." })).toBe("speech-roast speech-adult");
    expect(toneClasses({ tone: "banter", text: "What a clown move, haha." })).toContain("speech-adult");
  });

  it("laughter and harmless words stay plain", () => {
    expect(toneClasses({ tone: "banter", text: "Hahaha lol, so cocky." })).toBe("speech-banter");
    expect(toneClasses({ tone: "banter", text: null })).toBe("speech-banter");
  });

  it("the roast bubble has no red background in the styles", () => {
    const css = readFileSync(new URL("../src/ui/bubble.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/\.speech-roast\s*\{/);
    expect(css).toMatch(/\.speech-adult\s*\{[^}]*--bubble-ink/);
  });
});
