// D161: the local cue and line around an AI move are picked separately at
// random, never one of the last 3 of their list, from per level lists in the
// level's voice: at least 10 respect and 10 slip lines at every level, each
// valid for its verdict.
import { describe, expect, it } from "vitest";
import { judgesPlay, praisesPlayer, readsAsRespect, validChatLine } from "../src/ai/chat";
import { AI_CUES, CHAT_LINES } from "../src/ai/chatLines";
import { LEVELS } from "../src/ai/difficulty";
import type { Verdict } from "../src/ai/judge";
import { MAX_LINE_LENGTH, tidyLine } from "../src/ai/language";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction, GameState } from "../src/state/gameReducer";
import { reactionBubble } from "../src/ui/bubble";
import { PICKS_KEY, pickFresh } from "../src/ui/shownLines";
import { bubblePlan } from "../src/ui/useRemoteTaunt";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}
// A repeatable random sequence.
function seeded(seed: number): () => number {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe("the local lists (D161)", () => {
  it.each(LEVELS)("level %i: sizes, no duplicates", (level) => {
    const lists = CHAT_LINES[level];
    expect(lists.respect.length).toBeGreaterThanOrEqual(10);
    expect(lists.slip.length).toBeGreaterThanOrEqual(10);
    expect(lists.cue.length).toBeGreaterThanOrEqual(8);
    expect(lists.ordinary.length).toBeGreaterThanOrEqual(8);
    for (const lines of Object.values(lists)) expect(new Set(lines).size).toBe(lines.length);
  });

  it.each(LEVELS)("level %i: every line is valid for its verdict", (level) => {
    const { respect, slip, ordinary, cue } = CHAT_LINES[level];
    for (const line of respect) {
      expect(validChatLine(line, { level, verdict: "great", humanMoves: 3 }), line).toBe(true);
      expect(readsAsRespect(line), line).toBe(true);
    }
    for (const line of slip) {
      expect(validChatLine(line, { level, verdict: "blunder", humanMoves: 3 }), line).toBe(true);
      expect(praisesPlayer(line), line).toBe(false);
    }
    for (const line of ordinary) expect(validChatLine(line, { level, verdict: null, humanMoves: 3 }), line).toBe(true);
    for (const line of [...cue, ...AI_CUES]) {
      expect(judgesPlay(line) || praisesPlayer(line), line).toBe(false);
    }
  });

  it("every line has no dashes, fits the cap and starts with a capital; lmao only at Hard and Strongest", () => {
    for (const level of LEVELS) {
      for (const line of [...Object.values(CHAT_LINES[level]).flat(), ...AI_CUES]) {
        expect(tidyLine(line)).toBe(line);
        expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH);
        expect(line).toMatch(/^[A-Z]/);
        if (level < 3) expect(line).not.toMatch(/\blmao\b/i);
      }
    }
  });
});

describe("picking the cue and the line (D161)", () => {
  // The AI's reply to the player's move, with a verdict.
  function afterAi(state: GameState, verdict: Verdict | null): GameState {
    const move = state.legalMoves[0]!;
    const thinking = [click(move.from.row, move.from.col), click(move.to.row, move.to.col)].reduce(gameReducer, state);
    return gameReducer(thinking, {
      type: "aiMoved", requestId: thinking.aiRequestId, move: thinking.legalMoves[0]!, reaction: "x",
      ...(verdict ? { judgement: { verdict, detail: "x" } } : {}),
    });
  }

  it.each(LEVELS)("level %i: no line repeats within 3 turns of its list, and cue and line move independently", (level) => {
    const store = memoryStore();
    const random = seeded(level * 7 + 1);
    const pick = (list: string, lines: readonly string[]) => pickFresh(list, lines, random, store);
    const seen: Record<string, string[]> = {};
    const pairs: [string, string][] = [];
    const verdicts: (Verdict | null)[] = [null, null, "great", null, "blunder"];
    let state = createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: level });
    for (let turn = 0; turn < 40; turn++) {
      const verdict = verdicts[turn % verdicts.length]!;
      const next = afterAi(state, verdict);
      if (next.winner || next.legalMoves.length === 0) state = createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: level });
      else state = next;
      const replied = next.winner ? afterAi(createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: level }), verdict) : next;
      const plan = bubblePlan(replied, reactionBubble(replied), pick);
      const list = verdict === "great" ? "respect" : verdict === "blunder" ? "slip" : "ordinary";
      for (const [name, line] of [["cue", plan.cue!], [list, plan.fallback!]] as const) {
        const before = seen[name] ?? [];
        expect(before.slice(-3)).not.toContain(line);
        seen[name] = [...before, line];
      }
      if (list === "ordinary") pairs.push([plan.cue!, plan.fallback!]);
    }
    const byCue = new Map<string, Set<string>>();
    for (const [cue, line] of pairs) byCue.set(cue, (byCue.get(cue) ?? new Set()).add(line));
    expect([...byCue.values()].some((lines) => lines.size > 1)).toBe(true);
  });

  it("a broken memory still picks a line", () => {
    const store = memoryStore();
    store.setItem(PICKS_KEY, "not json");
    expect(CHAT_LINES[2].respect).toContain(pickFresh("respect:2", CHAT_LINES[2].respect, Math.random, store));
    expect(CHAT_LINES[2].respect).toContain(pickFresh("respect:2", CHAT_LINES[2].respect, Math.random, null));
  });
});
