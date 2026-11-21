// D155: the taunt model is told true facts about the player's play (whether
// they have moved, and the engine's verdict only for a move reaction), and a
// line that judges their play needs an engine verdict behind it.
import { describe, expect, it } from "vitest";
import { judgesPlay, localChatLine, validChatLine } from "../src/ai/chat";
import { initialBoard } from "../src/engine";
import { promptForContext, readContext } from "../src/ai/request";
import { createGameState, gameReducer } from "../src/state/gameReducer";
import type { GameAction } from "../src/state/gameReducer";
import { chatContext } from "../src/ui/useRemoteTaunt";

const click = (row: number, col: number): GameAction => ({ type: "click", position: { row, col } });
const base = { job: "taunt" as const, board: initialBoard(), player: "black" as const, level: 4 as const, opening: false, candidates: [] };

// The AI (Black) opened; the player (White) has not moved.
function aiOpened() {
  const start = createGameState({ mode: "vs-ai", humanSide: "white", aiLevel: 4 });
  return gameReducer(start, { type: "aiMoved", requestId: start.aiRequestId, move: start.legalMoves[0]! });
}

describe("what the taunt model is told (D155)", () => {
  it("counts the player's moves, zero when the AI opened", () => {
    expect(chatContext(aiOpened(), "greeting").humanMoves).toBe(0);
    const moved = [click(5, 2), click(4, 3)].reduce(gameReducer, createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: 4 }));
    expect(chatContext(moved, "thinking-1").humanMoves).toBe(1);
  });

  it("says the human has not moved, and never sends an ordinary verdict", () => {
    const prompt = promptForContext(chatContext(aiOpened(), "greeting"));
    expect(prompt).toContain("The human has not made a move yet in this game");
    expect(prompt).not.toMatch(/verdict: ordinary|Human move verdict/i);
    expect(prompt).toContain("never judge their strategy, plan, attempts, mistakes, skill or patterns");
  });

  it("sends the verdict only for a move reaction", () => {
    expect(promptForContext({ ...base, event: "during", verdict: "blunder", humanMoves: 3 })).toContain("last move was a blunder");
    expect(promptForContext({ ...base, event: "during", verdict: "great", humanMoves: 3 })).toContain("last move was excellent");
    expect(promptForContext({ ...base, event: "idle", verdict: null, humanMoves: 3 })).not.toMatch(/last move was (?:a blunder|excellent)/);
    expect(readContext({ ...base, event: "idle", verdict: "blunder" })).toBeNull();
    expect(readContext({ ...base, event: "during", verdict: "blunder", humanMoves: 2 })).not.toBeNull();
  });

  it("checks the count it is sent", () => {
    expect(readContext({ ...base, humanMoves: 0 })).not.toBeNull();
    for (const bad of [-1, 1.5, "2", 1e6]) expect(readContext({ ...base, humanMoves: bad })).toBeNull();
    expect(readContext({ ...base, job: "move", candidates: [0], humanMoves: 1 })).toBeNull();
  });
});

describe("judging the player's play needs a verdict (D155)", () => {
  const notMoved = { level: 4 as const, verdict: null, humanMoves: 0 };
  it.each([
    "You barely managed to avoid a disaster with that pathetic attempt",
    "You're falling into the same old trap, again.",
    "You call that a strategy?",
    "Your plan is predictable.",
  ])("rejects %s with zero player moves and with an ordinary move", (line) => {
    expect(validChatLine(line, notMoved)).toBe(false);
    expect(validChatLine(line, { ...notMoved, humanMoves: 5 })).toBe(false);
  });

  it.each(["I am just getting started.", "Let us see where this goes.", "I came here to win, and I intend to."])("an ordinary banter line still passes: %s", (line) => {
    expect(validChatLine(line, notMoved)).toBe(true);
  });

  it("a roast of the play passes after an engine verified blunder", () => {
    expect(validChatLine("You barely managed to avoid a disaster with that pathetic attempt", { level: 4, verdict: "blunder", humanMoves: 4 })).toBe(true);
  });

  it("the local lines after an ordinary move never judge the play", () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (let seed = 0; seed < 12; seed++) expect(judgesPlay(localChatLine(level, seed, null))).toBe(false);
    }
  });
});
