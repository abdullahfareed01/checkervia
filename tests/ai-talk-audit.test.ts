// The twelve reproductions of the AI talk audit (docs/03-technical/ai-talk-audit.md),
// kept as regressions: each now asserts the fixed behaviour (D154 to D162).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Records which side's move the engine judges, without changing behaviour.
const judged: string[] = [];
vi.mock("../src/ai/judge", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ai/judge")>();
  return { ...real, judgeMove: async (...args: Parameters<typeof real.judgeMove>) => { judged.push(args[2]); return real.judgeMove(...args); } };
});

import { judgesPlay, localChatLine, readsAsRespect, turnLine, validChatLine } from "../src/ai/chat";
import { AI_CUES, CHAT_LINES } from "../src/ai/chatLines";
import type { CallModel } from "../src/ai/chooseMove";
import { LEVELS } from "../src/ai/difficulty";
import { LINE_BANKS, fillLine, pickLine } from "../src/ai/lines";
import type { LineContext } from "../src/ai/lines";
import { EngineFallbackError, promptForContext } from "../src/ai/request";
import { requestTaunt } from "../src/ai/taunt";
import { applyMove, getLegalMoves, initialBoard } from "../src/engine";
import { startAiTurn } from "../src/state/aiController";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { ChatBubble } from "../src/ui/ChatBubble";
import { createIdleTimer } from "../src/ui/idleTimer";
import { idleContext } from "../src/ui/usePersonality";
import { bubblePlan, chatContext } from "../src/ui/useRemoteTaunt";

const ROAST = "You barely managed to avoid a disaster with that pathetic attempt";
const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

// The production client handles the provider chain; `down` is the model out of credits.
function chainModel(down = false): CallModel {
  const call = async () => {
    if (down) throw new EngineFallbackError();
    return JSON.stringify({ move: 1, reason: "It has the highest engine score at this level.", reaction: "" });
  };
  return Object.assign(call, { handlesChain: true as const });
}
async function aiTurn(state: GameState, model = chainModel()): Promise<GameState> {
  const action = await new Promise<GameAction>((resolve) => startAiTurn(state, model, resolve));
  return gameReducer(state, action);
}
const opened = (level: 1 | 2 | 3 | 4 = 4, down = false) => aiTurn(createGameState({ mode: "vs-ai", humanSide: "white", aiLevel: level, aiRequestId: 7 }), chainModel(down));

describe("audit bug 1: the AI opens", () => {
  it("shows its aiOpens greeting, asks no model, and a roast would be refused anyway", async () => {
    const state = await opened();
    expect(state.history[1]!.reaction).toBeUndefined();
    const line = pickLine("aiOpens", 4, {});
    const bubble = reactionBubble(state, { greeting: line })!;
    expect(bubble).toMatchObject({ key: "greeting", text: line });
    expect(bubblePlan(state, bubble).asksModel).toBe(false);
    const context = chatContext(state, "move-1");
    expect(context.humanMoves).toBe(0);
    expect(promptForContext(context)).toContain("The human has not made a move yet");
    expect(promptForContext(context)).not.toContain("Human move verdict");
    expect(validChatLine(ROAST, context)).toBe(false);
  });
});

describe("audit bug 2: waiting before the first move", () => {
  it("idle lines still come after 30 seconds, then every 5", async () => {
    const fired: number[] = [];
    vi.useFakeTimers();
    const timer = createIdleTimer((count) => fired.push(count));
    timer.update(true, 1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fired).toEqual([1]);
    await vi.advanceTimersByTimeAsync(20_000);
    timer.stop();
    vi.useRealTimers();
    expect(fired).toEqual([1, 2, 3, 4, 5]);
  });

  it("every idle line is local, and the audit's lines would be refused", async () => {
    const state = await opened();
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const text = pickLine(idleContext(count), 4, {});
      const bubble = reactionBubble(state, { idle: { key: `idle-${state.aiRequestId}-${count}`, text, count } })!;
      expect(bubblePlan(state, bubble)).toMatchObject({ asksModel: false, passThrough: true });
      expect(bubble.text).toBe(text);
    }
    const context = chatContext(state, "move-1");
    for (const line of ["You call that a strategy?", "You're falling into the same old trap, again.", "Oh you. Less staring, more strategy."]) expect(validChatLine(line, context)).toBe(false);
    for (let seed = 0; seed < 8; seed++) expect(turnLine("human", 4, seed)).not.toMatch(/staring|strategy|plan/i);
  });
});

describe("audit bug 3: stray quotes", () => {
  it("are read through, so the turn word rule refuses the line", () => {
    const context = { level: 4 as const, verdict: null, humanMoves: 2 };
    for (const line of ["Your 'move' was predictable.", "Your ‘turn’ was predictable.", 'Your "move" was predictable.']) expect(validChatLine(line, context)).toBe(false);
  });
});

describe("audit bug 4: the Respect chip", () => {
  it("only ever sits above a line of respect", async () => {
    const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", aiLevel: 4 }));
    const state = gameReducer(thinking, { type: "aiMoved", requestId: thinking.aiRequestId, move: thinking.legalMoves[0]!, reaction: "x", judgement: { verdict: "great", detail: "It is a multi jump that takes 2 pieces." } });
    const bubble = reactionBubble(state)!;
    expect(bubble.tone).toBe("respect");
    const taunt = "nice try, but your plan is already outdated, stuck in a predictable loop";
    const model = await requestTaunt(chatContext(state, bubble.key), undefined, async () => JSON.stringify({ reaction: taunt }));
    expect(model).toBeNull();
    const shown = localChatLine(4, state.aiRequestId, "great");
    expect(readsAsRespect(shown)).toBe(true);
    const html = renderToStaticMarkup(createElement(ChatBubble, { message: { ...bubble, text: shown } }));
    expect(html).toContain(`<span class="speech-label">Respect</span>${shown}`);
    expect(validChatLine("Great move, well played!", { level: 2, verdict: "blunder", humanMoves: 3 })).toBe(false);
  });
});

describe("audit section 3: verified mistakes", () => {
  it("the engine judges the player's move in both colours, and nothing when the AI opens", async () => {
    judged.length = 0;
    await opened(3);
    expect(judged).toEqual([]);
    await aiTurn([click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: 3 })));
    const start = await opened(3);
    const move = start.legalMoves[0]!;
    await aiTurn([click(move.from.row, move.from.col), click(move.to.row, move.to.col)].reduce(gameReducer, start));
    expect(judged).toEqual(["black", "white"]);
  });

  it("the end line knows how the game ended and whether a blunder was verified", () => {
    const won = { ...createGameState({ mode: "vs-ai", aiLevel: 4, humanSide: "black" }), winner: "white" as const };
    const context = chatContext(won, "end-30");
    expect(context).toMatchObject({ event: "end", ending: "aiWon", blunderSeen: false });
    expect(validChatLine("That blunder sealed it. Next.", context)).toBe(false);
    const abandoned = { ...won, abandoned: true, resignedBy: "black" as const };
    expect(promptForContext(chatContext(abandoned, "end-3"))).toContain("abandoned");
  });
});

describe("audit section 4: line hygiene", () => {
  const contexts = Object.keys(LINE_BANKS[1]) as LineContext[];
  const chat = LEVELS.flatMap((level) => [...Object.values(CHAT_LINES[level]).flat()]).concat(AI_CUES);
  const banks = LEVELS.flatMap((level) => contexts.flatMap((context) => LINE_BANKS[level][context].map((line) => ({ level, context, line }))));

  it("every local line starts with a capital, has no stray quotes and fits with round 100", () => {
    for (const line of [...banks.map((entry) => entry.line), ...chat]) {
      expect(line).toMatch(/^[A-Z]/);
      expect(line.replace(/\b\w+'\w+\b/g, "")).not.toMatch(/['"‘’“”]/);
      expect(fillLine(line, 100).length).toBeLessThanOrEqual(140);
    }
  });

  it("every bank has at least 10 lines, and the respect and slip lists too", () => {
    for (const { level, context } of banks) expect(LINE_BANKS[level][context].length).toBeGreaterThanOrEqual(10);
    for (const level of LEVELS) expect(Math.min(CHAT_LINES[level].respect.length, CHAT_LINES[level].slip.length)).toBeGreaterThanOrEqual(10);
  });

  it("no greeting, idle or opening line judges the player's play", () => {
    const noVerdict = ["start", "startAfterLoss", "startAfterWin", "idle", "idleAngry", "idleWarn", "aiOpens"];
    expect(banks.filter(({ context, line }) => noVerdict.includes(context) && judgesPlay(fillLine(line, 3)))).toEqual([]);
  });

  it("the move prompt says first move only on the game's first move", () => {
    const after = applyMove(initialBoard(), getLegalMoves(initialBoard(), "black")[0]!);
    expect(promptForContext({ job: "move", board: after, player: "white", level: 3, opening: true, candidates: [0] })).not.toContain("first move of the game");
  });
});

describe("audit section 5: the model is down", () => {
  it("moves come from the engine, the opening greeting stays local, and the lines stay truthful", async () => {
    const state = await opened(4, true);
    expect(state.history[1]!.lookahead?.source).toBe("engine");
    expect(state.history[1]!.reaction).toBeUndefined();
    const bubble = reactionBubble(state, { greeting: pickLine("aiOpens", 4, {}) })!;
    expect(bubble.key).toBe("greeting");
    expect(bubblePlan(state, bubble).asksModel).toBe(false);
    const move = state.legalMoves[0]!;
    const replied = await aiTurn([click(move.from.row, move.from.col), click(move.to.row, move.to.col)].reduce(gameReducer, state), chainModel(true));
    const plan = bubblePlan(replied, reactionBubble(replied));
    expect(plan.asksModel).toBe(false);
    const verdict = replied.history.at(-1)!.judgement?.verdict ?? null;
    expect(validChatLine(plan.fallback!, { level: 4, verdict, humanMoves: 1 })).toBe(true);
    expect(await requestTaunt(chatContext(replied, "greeting"), undefined, chainModel(true))).toBeNull();
  });
});
