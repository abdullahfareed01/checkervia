// D159: the taunt prompt has the move prompt's variety rules, the "Nice
// try" ban and the AI's last 3 shown lines, and a line equal to a recent
// one is refused.
import { describe, expect, it } from "vitest";
import { validChatLine } from "../src/ai/chat";
import { initialBoard } from "../src/engine";
import { promptForContext, readContext } from "../src/ai/request";
import { createGameState } from "../src/state/gameReducer";
import { SHOWN_KEY, readShownLines, rememberShownLine } from "../src/ui/shownLines";
import { chatContext } from "../src/ui/useRemoteTaunt";

const base = { job: "taunt" as const, board: initialBoard(), player: "black" as const, level: 3 as const, opening: false, candidates: [], event: "during" as const, verdict: null, humanMoves: 2 };
const recent = ["I am just getting started.", "Watch closely. I do not miss.", "This board belongs to me."];

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("taunt prompt parity (D159)", () => {
  it("has the variety rules, the Nice try ban and the last lines", () => {
    const prompt = promptForContext({ ...base, recentLines: recent });
    expect(prompt).toContain('Vary your wording every time and never open with "Nice try"');
    expect(prompt).toContain('Your last lines were: "I am just getting started.", "Watch closely. I do not miss.", "This board belongs to me."');
    expect(promptForContext(base)).not.toContain("Your last lines were");
  });

  it("refuses a line equal to a recent one, whatever its case or punctuation", () => {
    const context = { level: 3 as const, verdict: null, humanMoves: 2, recentLines: recent };
    expect(validChatLine("i am just getting started!", context)).toBe(false);
    expect(validChatLine("“This board belongs to me”", context)).toBe(false);
    expect(validChatLine("I came here to win.", context)).toBe(true);
  });

  it("refuses the stale Nice try opener", () => {
    expect(validChatLine("Nice try. I saw it coming.", { level: 3, verdict: "blunder", humanMoves: 2 })).toBe(false);
  });

  it("checks the lines it is sent", () => {
    expect(readContext({ ...base, recentLines: recent })).not.toBeNull();
    expect(readContext({ ...base, recentLines: [...recent, "Four."] })).toBeNull();
    expect(readContext({ ...base, recentLines: ["x".repeat(141)] })).toBeNull();
    expect(readContext({ ...base, recentLines: ["two\nlines"] })).toBeNull();
    expect(readContext({ ...base, recentLines: [3] })).toBeNull();
    expect(readContext({ ...base, job: "move", candidates: [0], verdict: undefined, humanMoves: undefined, event: undefined, recentLines: recent })).toBeNull();
  });

  it("the context carries the last 3 shown lines", () => {
    const state = createGameState({ mode: "vs-ai", aiLevel: 3 });
    expect(chatContext(state, "greeting", false, ["a", ...recent]).recentLines).toEqual(recent);
    expect(chatContext(state, "greeting").recentLines).toBeUndefined();
  });

  it("remembers only the last 3 final lines in the tab", () => {
    const store = memoryStore();
    for (const line of ["one", "two", "three", "four"]) rememberShownLine(line, store);
    expect(readShownLines(store)).toEqual(["two", "three", "four"]);
    store.setItem(SHOWN_KEY, "not json");
    expect(readShownLines(store)).toEqual([]);
    expect(readShownLines(null)).toEqual([]);
  });
});
