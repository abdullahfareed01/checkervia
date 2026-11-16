// D77: the AI's record. No stats panel on the game screen: the robot's
// avatar under the board opens a popup with the robot, a new taunt in its
// bubble each time, its record over every player and per level. The
// player's own numbers are never shown; they only choose the taunt.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiCoach } from "../src/ui/AiCoach";
import { AiRecordDialog, aiStatsTaunts, aiWinRate, pickTaunt, shortCount } from "../src/ui/AiRecordDialog";
import { App } from "../src/ui/App";
import { EMPTY_RECORD, parseRecord, withOutcome } from "../src/ui/vsAiRecord";
import type { AiStatsResponse } from "../src/leaderboard/protocol";

const AI: AiStatsResponse = {
  games: 48_213,
  aiWins: 39_870,
  aiLosses: 8_343,
  resigned: 9_120,
  levels: [
    { level: 1, games: 10_000, aiWins: 4_000, aiLosses: 6_000, resigned: 100 },
    { level: 2, games: 0, aiWins: 0, aiLosses: 0, resigned: 0 },
    { level: 3, games: 18_213, aiWins: 15_870, aiLosses: 2_343, resigned: 4_020 },
    { level: 4, games: 20_000, aiWins: 20_000, aiLosses: 0, resigned: 5_000 },
  ],
};
const MINE = { games: 12, wins: 5, losses: 7, resigned: 2 };

describe("your totals against the AI (kept, never shown)", () => {
  it("count games, wins, losses and resignations (a resignation is also a loss)", () => {
    const record = ["win", "loss", "resigned", "loss"].reduce((current, outcome) => withOutcome(current, outcome as "win"), EMPTY_RECORD);
    expect(record).toEqual({ games: 4, wins: 1, losses: 3, resigned: 1 });
  });

  it("a stored record is checked when read; anything broken starts again at zero", () => {
    expect(parseRecord(JSON.stringify({ games: 3, wins: 1, losses: 2, resigned: 1 }))).toEqual({ games: 3, wins: 1, losses: 2, resigned: 1 });
    for (const bad of [null, "", "{", "[]", '{"games":2,"wins":1,"losses":0,"resigned":0}', '{"games":1,"wins":0,"losses":1,"resigned":2}']) {
      expect(parseRecord(bad)).toEqual(EMPTY_RECORD);
    }
  });

  it("each finished game against the AI is added once, with the session record", () => {
    const source = readFileSync(new URL("../src/ui/usePersonality.ts", import.meta.url), "utf8");
    expect(source).toMatch(/recordedFor\.current = game;[\s\S]{0,300}vsAiRecordStore\.add\(state\.winner !== aiSideOf\(state\) \? "win" : state\.resignedBy \? "resigned" : "loss"\)/);
  });
});

describe("the game screen", () => {
  it("has no stats panel: only the robot's avatar opens the record", () => {
    const vsAi = renderToStaticMarkup(createElement(App, { initial: { mode: "vs-ai", aiLevel: 2 } }));
    expect(vsAi).not.toContain("gstats");
    expect(vsAi).not.toContain("airec");
    expect(vsAi).toMatch(/<button type="button" class="coach-avatar coach-avatar-\w+ coach-avatar-button" aria-label="The AI&#x27;s record" aria-haspopup="dialog">/);
    expect(vsAi).toContain('class="coach-badge"');
    expect(renderToStaticMarkup(createElement(App, { initial: { mode: "two-player" } }))).not.toContain("coach-avatar-button");
  });

  it("without a handler the avatar stays a plain picture", () => {
    const html = renderToStaticMarkup(createElement(AiCoach, { message: null, mood: "neutral", whyOpen: false, onWhy: () => {} }));
    expect(html).toContain('<div class="coach-avatar coach-avatar-neutral" aria-hidden="true">');
    expect(html).not.toContain("<button");
  });

  it("App opens it from the avatar, fetches the record again and makes the robot laugh meanwhile", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/setRecordOpen\(true\);\s*setRecordOpens\(\(count\) => count \+ 1\);/);
    expect(source).toContain("useAiStats(myRecord.games, recordOpens)");
    expect(source).toContain("onAvatar={openRecord}");
    expect(source).toMatch(/: recordOpen\s*\? "laughing"/);
    expect(source).toMatch(/recordOpen && <AiRecordDialog ai=\{aiStats\} mine=\{myRecord\} level=\{state\.aiLevel\}/);
  });
});

describe("the popup", () => {
  const render = (props: Partial<Parameters<typeof AiRecordDialog>[0]> = {}) =>
    renderToStaticMarkup(createElement(AiRecordDialog, { ai: AI, mine: MINE, level: 3, onClose: () => {}, random: () => 0, ...props }));

  it("a dialog: the robot and its bubble (typing first), the title, the ring and four totals", () => {
    const html = render();
    expect(html).toMatch(/role="dialog" aria-modal="true"/);
    expect(html).toContain('aria-label="Hear another taunt"');
    expect(html).toContain('class="airec-typing"');
    expect(html).toContain("The AI&#x27;s record");
    expect(html).toContain("Against every player with a profile");
    expect(html).toContain('aria-label="The AI wins 83% of its games."');
    expect([...html.matchAll(/class="airec-stat-label">([^<]+)</g)].map((match) => match[1])).toEqual(["Games played", "Wins", "Losses", "Players resigned"]);
    expect([...html.matchAll(/class="airec-stat-value">([^<]+)</g)].map((match) => match[1])).toEqual(["48.2K", "39.9K", "8,343", "9,120"]);
    expect(html).toContain("Back to the game");
  });

  it("per level: a bar and the win rate, the level being played marked", () => {
    const html = render();
    expect([...html.matchAll(/class="airec-level-rate">([^<]*)</g)].map((match) => match[1])).toEqual(["40%", "", "87%", "100%"]);
    expect(html).toMatch(/class="airec-level airec-level-now"><span class="airec-level-name">Hard<span class="airec-now">You<\/span>/);
    expect(html).toContain(": no games yet.");
    expect(html).toContain('style="width:87%"');
  });

  it("never shows the player's own numbers", () => {
    const html = render({ mine: { games: 777, wins: 333, losses: 444, resigned: 111 }, random: () => 0.999 });
    for (const own of ["777", "333", "444", "111"]) expect(html).not.toContain(own);
  });

  it("says so when the record cannot be loaded", () => {
    const html = render({ ai: null });
    expect(html).not.toContain("airec-main");
    expect(html).toContain("The AI&#x27;s record cannot be loaded right now.");
  });

  it("short numbers and the win rate", () => {
    expect([0, 999, 9_999, 10_000, 48_213, 1_250_000].map(shortCount)).toEqual(["0", "999", "9,999", "10K", "48.2K", "1.3M"]);
    expect(aiWinRate(AI)).toBe(83);
    expect(aiWinRate(AI.levels[1]!)).toBeNull();
    expect(aiWinRate(null)).toBeNull();
  });

  it("styles: its own sheet, compact on phones, two columns on phones held sideways", () => {
    const css = readFileSync(new URL("../src/ui/aiRecord.css", import.meta.url), "utf8");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*\.airec \{\s*display: grid;/);
    expect(readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8")).toMatch(/import "\.\/ui\/layout\.css";\s*import "\.\/ui\/aiRecord\.css";/);
  });
});

describe("the robot's taunts", () => {
  it("has the owner's lines, and new ones for each situation", () => {
    const lines = aiStatsTaunts(AI, MINE, 3);
    expect(lines).toContain("Impressed with the stats? You should be, haha.");
    expect(lines).toContain("After this game there will be one more addition to my wins, hehe.");
    expect(lines).toContain("39,870 wins so far. Number 39,871 is sitting right in front of me, lol.");
    expect(lines).toContain("I win 83% of my games. Do the math, haha.");
    expect(lines).toContain("Players resigned against me 9,120 times. The button is right there, lol.");
    expect(lines).toContain("At Hard I win 87% of my games. Good luck with that, hehe.");
    expect(lines).toContain("You gave me 7 of those wins. Very kind of you, haha.");
    expect(lines).toContain("You beat me 5 times? Enjoy it. It will not last, hehe.");
    expect(aiStatsTaunts(AI, EMPTY_RECORD, 2)).toContain("Want to be number 39,871? Just keep playing, haha.");
    expect(aiStatsTaunts(AI, { games: 1, wins: 1, losses: 0, resigned: 0 }, 1)).toContain("You beat me once? Enjoy it. It will not last, hehe.");
  });

  it("brags only about what is true: no win rate under half, no level line without games", () => {
    const weak = { ...AI, aiWins: 10, aiLosses: 90, games: 100, resigned: 0 };
    const lines = aiStatsTaunts(weak, EMPTY_RECORD, 2);
    expect(lines.some((line) => line.startsWith("I win"))).toBe(false);
    expect(lines.some((line) => line.includes("resigned"))).toBe(false);
    expect(lines.some((line) => line.startsWith("At Medium"))).toBe(false);
  });

  // D83, the owner's two bugs: after winning, the popup said a win was still
  // to be added; and with 45% overall (20% on Easy) it said "Numbers do not
  // lie. I am simply very good at this".
  const OWNER_REPORT: AiStatsResponse = {
    games: 200,
    aiWins: 90,
    aiLosses: 110,
    resigned: 20,
    levels: [
      { level: 1, games: 100, aiWins: 20, aiLosses: 80, resigned: 5 },
      { level: 2, games: 50, aiWins: 35, aiLosses: 15, resigned: 10 },
      { level: 3, games: 50, aiWins: 35, aiLosses: 15, resigned: 5 },
      { level: 4, games: 0, aiWins: 0, aiLosses: 0, resigned: 0 },
    ],
  };
  const FUTURE = /\b(will|after this game|sitting right in front|add one more|get back to|keep playing)\b/i;

  it("bug 1: once the game is over, nothing talks about a win still to come", () => {
    for (const ai of [AI, OWNER_REPORT]) {
      for (const mine of [MINE, EMPTY_RECORD, { games: 1, wins: 1, losses: 0, resigned: 0 }]) {
        for (const level of [1, 2, 3, 4] as const) {
          const after = aiStatsTaunts(ai, mine, level, true);
          expect(after.length).toBeGreaterThan(1);
          expect(after).not.toContain("After this game there will be one more addition to my wins, hehe.");
          for (const line of after) expect(line).not.toMatch(FUTURE);
        }
      }
    }
    // During the game the same line is still there.
    expect(aiStatsTaunts(AI, MINE, 3, false)).toContain("After this game there will be one more addition to my wins, hehe.");
  });

  it("bug 2: no flexing with a win rate under half", () => {
    for (const gameOver of [false, true]) {
      const lines = aiStatsTaunts(OWNER_REPORT, MINE, 1, gameOver);
      expect(lines).not.toContain("Numbers do not lie. I am simply very good at this, haha.");
      expect(lines).not.toContain("Impressed with the stats? You should be, haha.");
      expect(lines.some((line) => line.startsWith("I win"))).toBe(false);
      expect(lines).toContain("Under half? I call that warming up, lol.");
    }
    // With a strong record the flex is true, so it stays.
    expect(aiStatsTaunts(AI, MINE, 3, true)).toContain("Numbers do not lie. I am simply very good at this, haha.");
  });

  it("the popup takes gameOver from App", () => {
    const source = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(source).toContain("gameOver={state.winner !== null}");
  });

  it("still teases when the record cannot be loaded", () => {
    expect(aiStatsTaunts(null, MINE, 2)).toContain("My record is so long it did not load, haha.");
  });

  it("never the same taunt twice in a row", () => {
    const lines = aiStatsTaunts(AI, MINE, 3);
    for (const previous of lines) {
      for (const value of [0, 0.3, 0.6, 0.999]) expect(pickTaunt(lines, previous, () => value)).not.toBe(previous);
    }
    expect(pickTaunt(["only"], "only", () => 0.5)).toBe("only");
  });

  it("every line is plain: no dashes and at most 140 characters, even with huge numbers", () => {
    const huge: AiStatsResponse = { ...AI, games: 99_999_999, aiWins: 99_999_998, aiLosses: 1, resigned: 99_999_998 };
    const all = [1, 2, 3, 4].flatMap((level) => [
      ...aiStatsTaunts(huge, { games: 99_999, wins: 50_000, losses: 49_999, resigned: 1 }, level as 1),
      ...aiStatsTaunts(huge, EMPTY_RECORD, level as 1),
      ...aiStatsTaunts(null, EMPTY_RECORD, level as 1),
    ]);
    for (const line of all) {
      expect(line).not.toMatch(/[‐-―-]/);
      expect(line.length).toBeLessThanOrEqual(140);
    }
  });
});
