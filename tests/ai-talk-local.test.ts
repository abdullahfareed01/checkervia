// D156: idle lines stay local (D73, D82), and no local line rests on a
// false premise: idle lines never mention the AI's last move or past play,
// the first game's greeting never implies an earlier game, and the lines
// with no engine verdict behind them (greetings, idle, the opening, turn
// cues, ordinary move fallbacks) never judge the player's play or skill.
import { describe, expect, it } from "vitest";
import { judgesPlay, localChatLine, turnLine } from "../src/ai/chat";
import { LEVELS } from "../src/ai/difficulty";
import { LINE_BANKS, fillLine } from "../src/ai/lines";
import type { LineContext } from "../src/ai/lines";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { bubblePlan } from "../src/ui/useRemoteTaunt";

const NO_VERDICT: LineContext[] = ["start", "startAfterLoss", "startAfterWin", "idle", "idleAngry", "idleWarn", "aiOpens"];
const lines = (contexts: readonly LineContext[]) =>
  LEVELS.flatMap((level) => contexts.flatMap((context) => LINE_BANKS[level][context].map((line) => ({ level, context, line: fillLine(line, 12) }))));

describe("idle lines stay local (D156)", () => {
  it.each([1, 2, 3, 5, 6, 9])("idle line %i is shown as picked, with no model request", (count) => {
    const start = createGameState({ mode: "vs-ai", humanSide: "white", aiLevel: 4 });
    const opened = gameReducer(start, { type: "aiMoved", requestId: start.aiRequestId, move: start.legalMoves[0]! });
    const text = LINE_BANKS[4].idle[0]!;
    const bubble = reactionBubble(opened, { idle: { key: `idle-${opened.aiRequestId}-${count}`, text, count } });
    const plan = bubblePlan(opened, bubble);
    expect(plan.asksModel).toBe(false);
    expect(plan.passThrough).toBe(true);
    expect(bubble?.text).toBe(text);
  });
});

describe("no false premises in the local lines (D156)", () => {
  it("idle lines never mention the AI's last move or claim earlier play", () => {
    expect(lines(["idle", "idleAngry", "idleWarn"]).filter(({ line }) => /\b(?:last move|my move|that move|again)\b/i.test(line))).toEqual([]);
  });

  it("the first game's greeting never implies an earlier game", () => {
    expect(lines(["start"]).filter(({ line }) => /\b(?:same result|again|last time|round|revenge|rematch)\b/i.test(line))).toEqual([]);
  });

  it("greetings, idle lines and the opening never judge the player's play or skill", () => {
    expect(lines(NO_VERDICT).filter(({ line }) => judgesPlay(line))).toEqual([]);
  });

  it("turn cues and ordinary move fallbacks never judge the player", () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 16; seed++) {
        expect(judgesPlay(turnLine("human", level, seed))).toBe(false);
        expect(judgesPlay(turnLine("ai", level, seed))).toBe(false);
        expect(judgesPlay(localChatLine(level, seed, null))).toBe(false);
      }
    }
  });
});
