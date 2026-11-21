// D154: the AI's opening move is not a reply to the player. When the AI
// opens (the player is White), its first bubble is its own aiOpens greeting,
// never a model line for the "during" event about a move nobody made; with
// the model up or down. When the player moved first, the AI's reply still
// carries the turn cue.
import { describe, expect, it, vi } from "vitest";
import { turnLine } from "../src/ai/chat";
import type { CallModel } from "../src/ai/chooseMove";
import { LINE_BANKS } from "../src/ai/lines";
import { EngineFallbackError } from "../src/ai/request";
import { startAiTurn } from "../src/state/aiController";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { deliverChat } from "../src/ui/chatDelivery";
import type { ChatFrame } from "../src/ui/chatDelivery";
import { bubblePlan } from "../src/ui/useRemoteTaunt";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

// The production client handles the provider chain (src/ai/client.ts).
function chainModel(down = false): CallModel & { jobs: string[] } {
  const jobs: string[] = [];
  const call = async (_p: string, _n?: string, _s?: AbortSignal, context?: { job?: string }) => {
    jobs.push(context?.job ?? "none");
    if (down) throw new EngineFallbackError();
    return JSON.stringify({ move: 1, reason: "It has the highest engine score at this level.", reaction: "" });
  };
  return Object.assign(call, { handlesChain: true as const, jobs });
}

async function aiTurn(state: GameState, model: CallModel): Promise<GameState> {
  const action = await new Promise<GameAction>((resolve) => startAiTurn(state, model, resolve));
  return gameReducer(state, action);
}

async function finalText(state: GameState, bubble: ReturnType<typeof reactionBubble>): Promise<string | null> {
  const plan = bubblePlan(state, bubble);
  const frames: ChatFrame[] = [];
  const request = vi.fn(async () => "You barely managed to avoid a disaster with that pathetic attempt");
  vi.useFakeTimers();
  const stop = deliverChat(plan.cue, plan.fallback!, plan.asksModel ? request : null, (frame) => frames.push(frame));
  await vi.advanceTimersByTimeAsync(5000);
  stop();
  vi.useRealTimers();
  expect(request).not.toHaveBeenCalled();
  return frames.at(-1)!.text;
}

describe("the AI opens the game (D154)", () => {
  it.each([
    [1, false], [2, false], [3, false], [4, false],
    [1, true], [2, true], [3, true], [4, true],
  ] as const)("level %i, model down %s: the first bubble is an aiOpens greeting, never a during line", async (level, down) => {
    const model = chainModel(down);
    const start = createGameState({ mode: "vs-ai", humanSide: "white", aiLevel: level, aiRequestId: 7 });
    const opened = await aiTurn(start, model);
    expect(opened.history.some((entry) => entry.player === opened.humanSide)).toBe(false);
    expect(opened.history[1]!.reaction).toBeUndefined();
    expect(model.jobs.every((job) => job === "move")).toBe(true);

    const line = LINE_BANKS[level].aiOpens[0]!;
    const bubble = reactionBubble(opened, { greeting: line });
    expect(bubble).toMatchObject({ key: "greeting", text: line, why: false });
    const plan = bubblePlan(opened, bubble);
    expect(plan.asksModel).toBe(false);
    expect(plan.cue).toBeNull();
    expect(await finalText(opened, bubble)).toBe(line);
  });

  it("after the player's first move, the AI's reply still carries the turn cue and is a move line", async () => {
    const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: 4 }));
    const replied = await aiTurn(thinking, chainModel());
    expect(replied.history[2]!.reaction).toBe(turnLine("human", 4, thinking.aiRequestId));
    const bubble = reactionBubble(replied, { greeting: "unused" });
    expect(bubble?.key).toBe("move-2");
    expect(bubblePlan(replied, bubble).asksModel).toBe(true);
  });

  it("the player's own greeting (the player moves first) is still offered to the model", () => {
    const start = createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: 2 });
    const bubble = reactionBubble(start, { greeting: "Hello." });
    expect(bubble?.key).toBe("greeting");
    expect(bubblePlan(start, bubble).asksModel).toBe(true);
  });
});
