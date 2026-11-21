// D157: the chip and the words agree at every level. A great move gets a
// "Respect" chip and a line that reads as respect; a blunder gets "Your slip"
// and never praise; an ordinary move gets no chip, no praise and no judging.
// Model lines that break this are refused, and the local line is shown.
import { describe, expect, it } from "vitest";
import { judgesPlay, localChatLine, praisesPlayer, readsAsRespect, validChatLine } from "../src/ai/chat";
import type { Verdict } from "../src/ai/judge";
import { requestTaunt } from "../src/ai/taunt";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { chatContext } from "../src/ui/useRemoteTaunt";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });
const LEVELS = [1, 2, 3, 4] as const;
const VERDICTS: (Verdict | null)[] = ["great", "blunder", null];

// The AI's reply to the player's first move, carrying the engine's verdict.
function afterAi(level: (typeof LEVELS)[number], verdict: Verdict | null): GameState {
  const thinking = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: level }));
  return gameReducer(thinking, {
    type: "aiMoved", requestId: thinking.aiRequestId, move: thinking.legalMoves[0]!, reaction: "Your move.",
    ...(verdict ? { judgement: { verdict, detail: "x" } } : {}),
  });
}

// What a model might answer: respect, the audit's taunt, praise, a roast, banter.
const ANSWERS = [
  "Fine, that was sharp. I did not see it.",
  "nice try, but your plan is already outdated, stuck in a predictable loop",
  "Great move, well played!",
  "That was a gift. I will take it.",
  "I am just getting started.",
];

describe("chip and text agree (D157)", () => {
  const cases = LEVELS.flatMap((level) => VERDICTS.flatMap((verdict) => ANSWERS.map((answer) => [level, verdict, answer] as const)));
  it.each(cases)("level %i, verdict %s, model says %j", async (level, verdict, answer) => {
    const state = afterAi(level, verdict);
    const bubble = reactionBubble(state)!;
    const context = chatContext(state, bubble.key);
    const model = await requestTaunt(context, undefined, async () => JSON.stringify({ reaction: answer }));
    const shown = model ?? localChatLine(level, state.aiRequestId, verdict);
    if (verdict === "great") {
      expect(bubble.tone).toBe("respect");
      expect(readsAsRespect(shown)).toBe(true);
    } else if (verdict === "blunder") {
      expect(bubble.tone).toBe("roast");
      expect(praisesPlayer(shown)).toBe(false);
    } else {
      expect(bubble.tone).toBe("banter");
      expect(praisesPlayer(shown)).toBe(false);
      expect(judgesPlay(shown)).toBe(false);
    }
  });

  it("the audit's examples", () => {
    expect(validChatLine("Great move, well played!", { level: 2, verdict: "blunder", humanMoves: 3 })).toBe(false);
    for (const level of LEVELS) {
      expect(validChatLine("nice try, but your plan is already outdated, stuck in a predictable loop", { level, verdict: "great", humanMoves: 3 })).toBe(false);
      expect(validChatLine("Oops, what a blunder.", { level, verdict: "great", humanMoves: 3 })).toBe(false);
    }
  });

  it("respect for the player's win must read as respect", () => {
    expect(validChatLine("You won. Grudging respect.", { level: 4, outcome: "human-win" })).toBe(true);
    expect(validChatLine("You won by luck, nothing more.", { level: 4, outcome: "human-win" })).toBe(false);
  });

  it("greetings are not praise", () => {
    expect(praisesPlayer("Good luck, and nice to meet you.")).toBe(false);
    expect(praisesPlayer("Nice move.")).toBe(true);
  });

  it("the local lines for each verdict agree with their chip at every level", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 12; seed++) {
        expect(readsAsRespect(localChatLine(level, seed, "great"))).toBe(true);
        expect(praisesPlayer(localChatLine(level, seed, "blunder"))).toBe(false);
        expect(praisesPlayer(localChatLine(level, seed, null))).toBe(false);
      }
    }
  });
});
