// The local line banks (Change 4): every level and context has at least 10
// lines, no line repeats one of the last 3 in its context, and every line
// follows the language rules, the no dashes rule and the 140 character cap.
import { describe, expect, it } from "vitest";
import { LEVELS } from "./difficulty";
import { MAX_LINE_LENGTH, checkReaction, classify, tidyLine } from "./language";
import { LINE_BANKS, NO_REPEAT, fillLine, pickLine, rememberLine } from "./lines";
import type { LineContext, RecentLines } from "./lines";

const CONTEXTS: LineContext[] = [
  "start", "startAfterLoss", "startAfterWin", "idle", "resigned", "aiWon", "aiWonBlunder", "playerWon", "resignHint",
  "resignPush", "aiWonStubborn", "idleAngry", "idleWarn", "aiOpens", "abandoned", "draw", "aiResigned",
];
const all = LEVELS.flatMap((level) => CONTEXTS.flatMap((context) => LINE_BANKS[level][context].map((line) => ({ level, context, line }))));

describe("line banks", () => {
  it.each(LEVELS.flatMap((level) => CONTEXTS.map((context) => [level, context] as const)))("level %i, %s: at least 10 different lines", (level, context) => {
    const lines = LINE_BANKS[level][context];
    expect(lines.length).toBeGreaterThanOrEqual(10);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("every line passes the language rules of its level unchanged", () => {
    const broken = all.filter(({ level, context, line }) => {
      const shown = fillLine(line, 12);
      const verdict = context === "aiWonBlunder" ? "blunder" : null;
      return checkReaction(shown, level, verdict) !== shown;
    });
    expect(broken).toEqual([]);
  });

  it("has no hyphens or dashes and fits the 140 character cap, even with a two digit round", () => {
    const bad = all.filter(({ line }) => {
      const shown = fillLine(line, 99);
      return tidyLine(shown) !== shown || shown.length > MAX_LINE_LENGTH;
    });
    expect(bad).toEqual([]);
  });

  it("swears only in the Strongest taunt after a verified blunder", () => {
    const swearing = all.filter(({ line }) => classify(line).includes("mild")).map(({ level, context }) => `${level}:${context}`);
    expect(new Set(swearing)).toEqual(new Set(["4:aiWonBlunder"]));
  });

  it("insults the play only at Strongest", () => {
    expect(all.filter(({ level, line }) => level < 4 && classify(line).includes("insult"))).toEqual([]);
  });

  it("laughs: haha, hehe and lol at every level, lmao only at Hard and Strongest", () => {
    for (const level of LEVELS) {
      const text = CONTEXTS.flatMap((context) => LINE_BANKS[level][context]).join(" ");
      for (const laugh of ["haha", "hehe", "lol"]) expect(text).toMatch(new RegExp(`\\b${laugh}\\b`));
      if (level < 3) expect(text).not.toMatch(/\blmao\b/);
      else expect(text).toMatch(/\blmao\b/);
    }
  });

  it("laughter and clean lines are never flagged by the word lists", () => {
    for (const laugh of ["haha", "hahaha", "hehe", "lol", "lolll", "lmao", "LOL!", "Hahaha, lol."]) expect(classify(laugh)).toEqual([]);
  });
});

describe("pickLine", () => {
  it("never repeats one of the last 3 lines in the same context", () => {
    let recent: RecentLines = {};
    const shown: string[] = [];
    for (let turn = 0; turn < 40; turn++) {
      const line = pickLine("idle", 4, recent, () => (turn * 0.37) % 1);
      expect(shown.slice(-NO_REPEAT)).not.toContain(line);
      shown.push(line);
      recent = rememberLine(recent, "idle", line);
    }
  });

  it("keeps contexts apart and only remembers the last 3", () => {
    const recent = ["a", "b", "c", "d"].reduce<RecentLines>((memory, line) => rememberLine(memory, "start", line), {});
    expect(recent.start).toEqual(["b", "c", "d"]);
    expect(recent.idle).toBeUndefined();
  });

  it("fills in the round number", () => {
    expect(fillLine("Back for round {round}, lol.", 2)).toBe("Back for round 2, lol.");
  });

  it("returns lines for every level and context", () => {
    for (const level of LEVELS) for (const context of CONTEXTS) expect(LINE_BANKS[level][context]).toContain(pickLine(context, level, {}, () => 0.5));
  });
});
