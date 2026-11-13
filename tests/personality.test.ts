// Change 4 with fakes: resigning in both modes (never a leaderboard win), the
// resign hint only when the engine proves a loss, which bank each greeting
// and end line comes from, what the bubble shows first, the language badge
// popover, and the game over panel's tips with the 5 second reveal.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardFrom } from "../src/engine/testUtils";
import type { Board } from "../src/engine";
import { startAiTurn } from "../src/state/aiController";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { winReasonOf } from "../src/ui/gameView";
import { TIPS_DELAY_MS, revealAfter } from "../src/ui/idleTimer";
import { LANGUAGE_RULES, LanguageInfo } from "../src/ui/LanguageInfo";
import { ResultDialog } from "../src/ui/ResultDialog";
import { endContext, greetingContext, isSubmittableWin, playedPositions } from "../src/ui/usePersonality";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });
const EMPTY = "........";
const board = (rows: Record<number, string>): Board => boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));
const noop = () => {};

// vs AI after Black's first move and the AI's reply.
function afterAi(extra: Partial<Extract<GameAction, { type: "aiMoved" }>> = {}): GameState {
  const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
  return gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: thinking.legalMoves[0]!, ...extra });
}

describe("resign", () => {
  it("against the AI: you resign, the AI wins, the reason says so", () => {
    const state = gameReducer(afterAi(), { type: "resign" });
    expect(state).toMatchObject({ winner: "white", resignedBy: "black", legalMoves: [], aiPhase: "idle" });
    expect(winReasonOf(state)).toBe("You resigned.");
  });

  it("works while the AI is thinking, and its late reply is ignored", () => {
    const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
    const resigned = gameReducer(thinking, { type: "resign" });
    const late = gameReducer(resigned, { type: "aiMoved", requestId: thinking.aiRequestId, move: thinking.legalMoves[0]! });
    expect(late).toBe(resigned);
  });

  it("two players: the side to move resigns and the other side wins", () => {
    const state = gameReducer(createGameState(), { type: "resign" });
    expect(state).toMatchObject({ winner: "white", resignedBy: "black" });
    expect(winReasonOf(state)).toBe("Black resigned.");
    const afterOne = [click(5, 2), click(4, 3), { type: "resign" } as GameAction].reduce(gameReducer, createGameState());
    expect(afterOne).toMatchObject({ winner: "black", resignedBy: "white" });
  });

  it("does nothing once the game is over", () => {
    const over = gameReducer(createGameState(), { type: "resign" });
    expect(gameReducer(over, { type: "resign" })).toBe(over);
  });

  it("New game clears it", () => {
    expect(gameReducer(gameReducer(afterAi(), { type: "resign" }), { type: "newGame" }).resignedBy).toBeNull();
  });

  it("counts as a loss and is never a win for the leaderboard", () => {
    const resigned = gameReducer(afterAi(), { type: "resign" });
    expect(endContext(resigned)).toBe("resigned");
    expect(isSubmittableWin(resigned)).toBe(false);
    // Even a resignation by the AI side in a two player game is not a win to submit.
    expect(isSubmittableWin(gameReducer(createGameState(), { type: "resign" }))).toBe(false);
  });

  it("a real win against the AI can be submitted later", () => {
    const won = { ...afterAi(), winner: "black" as const };
    expect(isSubmittableWin(won)).toBe(true);
    expect(endContext(won)).toBe("playerWon");
  });
});

describe("the end of game line", () => {
  it("swearing bank only after a verified blunder in this game", () => {
    const aiWon = { ...afterAi(), winner: "white" as const };
    expect(endContext(aiWon)).toBe("aiWon");
    const afterBlunder = { ...afterAi({ judgement: { verdict: "blunder", detail: "x" } }), winner: "white" as const };
    expect(endContext(afterBlunder)).toBe("aiWonBlunder");
  });

  it("greeting from this tab's last result", () => {
    expect(greetingContext(null)).toBe("start");
    expect(greetingContext("lost")).toBe("startAfterLoss");
    expect(greetingContext("won")).toBe("startAfterWin");
  });

  it("the tips read the player's moves of the game, numbered as in the move list", () => {
    const positions = playedPositions(afterAi());
    expect(positions.map((position) => [position.number, position.player])).toEqual([
      [1, "black"],
      [2, "white"],
    ]);
  });
});

describe("the resign hint", () => {
  // Whatever White (the AI) plays here, every Black move then loses by force
  // within 6 turns (found by a search over small positions).
  const lost = board({ 0: ".W.W....", 5: "b......." });

  async function aiTurn(state: GameState) {
    const actions: GameAction[] = [];
    startAiTurn(state, async () => '{"move": 1, "reason": "x", "reaction": ""}', (action) => actions.push(action));
    await vi.waitFor(() => expect(actions).toHaveLength(1), { timeout: 10_000 });
    return actions[0]!;
  }

  it("is marked on the AI's move only when the real search proves the position lost", async () => {
    const thinking = createGameState({ mode: "vs-ai", board: lost, currentPlayer: "white" });
    const action = await aiTurn(thinking);
    expect(action).toMatchObject({ type: "aiMoved", provenLoss: true });
    const after = gameReducer(thinking, action);
    expect(after.history.at(-1)!.provenLoss).toBe(true);
  });

  it("is not marked in an ordinary position", async () => {
    const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai" }));
    const action = await aiTurn(thinking);
    expect(action).not.toHaveProperty("provenLoss");
  });

  it("the bubble shows the hint for that move, with Why?", () => {
    const state = afterAi({ provenLoss: true });
    const index = state.history.length - 1;
    expect(reactionBubble(state, 0, { hint: { index, text: "It is over." } })).toMatchObject({ text: "It is over.", why: true });
    expect(reactionBubble(state, 0, { hint: { index: index - 2, text: "old" } })?.text).not.toBe("old");
  });
});

describe("what the bubble shows first", () => {
  it("the greeting at the start of a game, without Why?", () => {
    const start = createGameState({ mode: "vs-ai" });
    expect(reactionBubble(start, 0, { greeting: "Hi there!" })).toEqual({ key: "greeting", text: "Hi there!", tone: "banter", why: false });
    expect(reactionBubble(start, 1, { greeting: "Hi there!" })).toBeNull(); // cleared by the first piece picked up
  });

  it("an idle line beats the reaction, has no Why?, and shows even after a piece was put back", () => {
    const state = afterAi({ reaction: "Bold." });
    const idle = { key: "idle-1", text: "Tick tock." };
    expect(reactionBubble(state, 0, { idle })).toMatchObject({ text: "Tick tock.", why: false });
    expect(reactionBubble(state, state.history.length, { idle })?.text).toBe("Tick tock.");
  });

  it("nothing once the game is over (the result panel speaks)", () => {
    expect(reactionBubble(gameReducer(afterAi(), { type: "resign" }), 0, { greeting: "x" })).toBeNull();
  });
});

describe("the 18+ badge popover", () => {
  it("explains the rules in two sentences and links the Terms", () => {
    const html = renderToStaticMarkup(createElement(LanguageInfo, { onTerms: noop, onClose: noop }));
    expect(LANGUAGE_RULES.split(/\.\s/).length).toBe(2);
    expect(html).toContain(">Terms and notices<");
    expect(html).toContain('role="dialog"');
  });
});

describe("game over panel against the AI", () => {
  const props = {
    winner: "white" as const,
    mode: "vs-ai" as const,
    reason: "You resigned.",
    stats: { black: { moves: 5, captured: 1, kingsMade: 0, bestChain: 1 }, white: { moves: 5, captured: 3, kingsMade: 1, bestChain: 1 } },
    pieces: { black: 9, white: 11 },
    totalMoves: 10,
    durationMs: 60_000,
    onPlayAgain: noop,
    onReview: noop,
    onClose: noop,
    aiLine: { text: "Smart. You saw the end coming, haha.", tone: "banter" as const },
  };
  const tips = [{ kind: "general" as const, text: "Trade pieces when you are ahead, and avoid trades when you are behind." }];

  it("shows the AI's line at once in the bubble style, with Play again and Review game", () => {
    const html = renderToStaticMarkup(createElement(ResultDialog, { ...props, tips }));
    expect(html).toContain('<p class="result-line speech-banter">Smart. You saw the end coming, haha.</p>');
    expect(html).toContain(">Play again<");
    expect(html).toContain(">Review game<");
  });

  it("hides the tips at first, with a Show tips now link", () => {
    const html = renderToStaticMarkup(createElement(ResultDialog, { ...props, tips }));
    expect(html).toContain(">Show tips now<");
    expect(html).not.toContain("Trade pieces");
  });

  it("once revealed: the tips, labelled as checked by the engine, announced once", () => {
    const html = renderToStaticMarkup(createElement(ResultDialog, { ...props, tips, tipsShownAtStart: true }));
    expect(html).toContain("<h3>Tips from the AI</h3>");
    expect(html).toContain("Checked by the game engine");
    expect(html).toContain("Trade pieces when you are ahead");
    expect(html).toMatch(/<p class="sr-only" aria-live="polite">Tips from the AI are shown below\.<\/p>/);
  });

  it("after the player wins: a respectful line and no tips", () => {
    const html = renderToStaticMarkup(
      createElement(ResultDialog, { ...props, winner: "black", aiLine: { text: "Well played!", tone: "respect" }, tips: undefined }),
    );
    expect(html).toContain("speech-respect");
    expect(html).not.toContain("Tips from the AI");
    expect(html).not.toContain("Show tips now");
  });

  describe("the 5 second reveal", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("reveals after 5 seconds, not before, and can be cancelled", () => {
      const reveal = vi.fn();
      revealAfter(TIPS_DELAY_MS, reveal);
      vi.advanceTimersByTime(4_999);
      expect(reveal).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(reveal).toHaveBeenCalledOnce();
      const cancelled = vi.fn();
      revealAfter(TIPS_DELAY_MS, cancelled)();
      vi.advanceTimersByTime(10_000);
      expect(cancelled).not.toHaveBeenCalled();
    });
  });
});

// The hint's real search must find this position lost (checked directly).
describe("the hint position used above", () => {
  it("is lost for Black after every White move, by the engine's own search", async () => {
    const { provenLost } = await import("../src/ai/endgame");
    const { getLegalMoves, applyMove } = await import("../src/engine");
    const lost = board({ 0: ".W.W....", 5: "b......." });
    const results = await Promise.all(getLegalMoves(lost, "white").map((move) => provenLost(applyMove(lost, move), "black")));
    expect(results.every(Boolean)).toBe(true);
  });
});
