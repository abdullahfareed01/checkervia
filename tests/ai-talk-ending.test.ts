// D160: the line at the end is told how the game really ended (won by play,
// resigned, abandoned, the AI resigned, played on after a proven loss, drawn)
// and whether the engine verified a blunder; a claimed blunder needs one, and
// a model line for the AI's win keeps the laugh at every level but Easy.
import { describe, expect, it } from "vitest";
import { validChatLine } from "../src/ai/chat";
import { WIN_LAUGHS } from "../src/ai/lines";
import { promptForContext, readContext } from "../src/ai/request";
import { initialBoard } from "../src/engine";
import { createGameState } from "../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../src/state/gameReducer";
import { endsWithWinLaugh } from "../src/ui/usePersonality";
import { chatContext, finishEndLine } from "../src/ui/useRemoteTaunt";

const start = createGameState({ mode: "vs-ai", humanSide: "black", aiLevel: 4 });
const aiMove = (extra: Partial<HistoryEntry> = {}): HistoryEntry => ({ board: start.board, move: start.legalMoves[0]!, player: "white", ...extra });
const ended = (extra: Partial<GameState>, history: HistoryEntry[] = [aiMove()]): GameState => ({ ...start, history: [start.history[0]!, ...history], ...extra });
const key = "end-2";

describe("the end line's facts (D160)", () => {
  it.each([
    [{ winner: "white" as const }, "aiWon", "The AI won the game by play."],
    [{ winner: "black" as const }, "playerWon", "The human won the game by play."],
    [{ winner: "white" as const, resignedBy: "black" as const }, "resigned", "The human resigned."],
    [{ winner: "white" as const, resignedBy: "black" as const, abandoned: true }, "abandoned", "the game was abandoned"],
    [{ winner: "black" as const, resignedBy: "white" as const }, "aiResigned", "The AI resigned"],
    [{ drawn: "repetition" as const }, "draw", "The game was drawn."],
  ])("%j ends as %s", (extra, ending, words) => {
    const context = chatContext(ended(extra), key);
    expect(context.ending).toBe(ending);
    expect(readContext(context)).not.toBeNull();
    expect(promptForContext(context)).toContain(words);
  });

  it("names a loss played on after the engine's proof", () => {
    const context = chatContext(ended({ winner: "white" }, [aiMove({ provenLoss: true })]), key);
    expect(context.ending).toBe("stubborn");
    expect(promptForContext(context)).toContain("played on anyway");
  });

  it("says whether the engine verified a blunder", () => {
    const clean = chatContext(ended({ winner: "white" }), key);
    const blundered = chatContext(ended({ winner: "white" }, [aiMove({ judgement: { verdict: "blunder", detail: "x" } })]), key);
    expect(clean.blunderSeen).toBe(false);
    expect(blundered.blunderSeen).toBe(true);
    expect(promptForContext(clean)).toContain("verified no blunder");
    expect(promptForContext(blundered)).toContain("verified at least one blunder");
    expect(validChatLine("That blunder sealed it.", clean)).toBe(false);
    expect(validChatLine("That blunder sealed it.", blundered)).toBe(true);
  });

  it("sends the ending only for the end line", () => {
    const base = { job: "taunt" as const, board: initialBoard(), player: "black" as const, level: 4 as const, opening: false, candidates: [] };
    expect(readContext({ ...base, event: "end", ending: "abandoned", blunderSeen: false })).not.toBeNull();
    expect(readContext({ ...base, event: "during", ending: "abandoned" })).toBeNull();
    expect(readContext({ ...base, event: "end", ending: "fled" })).toBeNull();
    expect(readContext({ ...base, event: "end", blunderSeen: "yes" })).toBeNull();
    expect(chatContext(start, "move-1").ending).toBeUndefined();
  });
});

describe("the winning laugh on a model line (D160)", () => {
  const laughs = new RegExp(`(?:${WIN_LAUGHS.map((laugh) => laugh.replace("!", "")).join("|")})!$`);
  it.each([2, 3, 4] as const)("level %i: a model line gets the laugh", (level) => {
    expect(finishEndLine("I win. Next challenger.", level, true, () => 0)).toMatch(laughs);
  });
  it("Easy stays kind, a line that already laughs gets no second laugh, and only wins laugh", () => {
    expect(finishEndLine("I win. Good game.", 1, true)).toBe("I win. Good game.");
    expect(finishEndLine("I win, lol.", 4, true)).toBe("I win, lol.");
    expect(finishEndLine("A draw. Fair.", 4, false)).toBe("A draw. Fair.");
  });
  it("only the AI's wins by play laugh", () => {
    expect(endsWithWinLaugh(ended({ winner: "white" }))).toBe(true);
    expect(endsWithWinLaugh(ended({ winner: "white" }, [aiMove({ provenLoss: true })]))).toBe(true);
    expect(endsWithWinLaugh(ended({ winner: "white", resignedBy: "black" }))).toBe(false);
    expect(endsWithWinLaugh(ended({ winner: "black" }))).toBe(false);
    expect(endsWithWinLaugh(start)).toBe(false);
  });
});
