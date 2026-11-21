// D158: a model line is put into the form players see before any rule
// reads it: straight quotes, no quotes around the line or one word, a
// capital first letter. So quotes cannot hide a turn word, and stray quotes
// and filter evasions are refused.
import { describe, expect, it } from "vitest";
import { normaliseLine, validChatLine } from "../src/ai/chat";
import { initialBoard } from "../src/engine";
import { readTaunt } from "../src/ai/taunt";

const move = { level: 4 as const, verdict: null, humanMoves: 3 };
const blunder = { level: 4 as const, verdict: "blunder" as const, humanMoves: 3 };
const taunt = { job: "taunt" as const, board: initialBoard(), player: "black" as const, level: 4 as const, opening: false, candidates: [], event: "during" as const, verdict: null, humanMoves: 3 };

describe("normaliseLine (D158)", () => {
  it.each([
    ["Your 'move' was predictable.", "Your move was predictable."],
    ["Your ‘turn’ was predictable.", "Your turn was predictable."],
    ['Your "move" was predictable.', "Your move was predictable."],
    ['"I am just getting started."', "I am just getting started."],
    ["“I am just getting started.”", "I am just getting started."],
    ["i am  just getting started.", "I am just getting started."],
    ["nice try, but no.", "Nice try, but no."],
    ["You’re up against me now.", "You're up against me now."],
  ])("%j becomes %j", (raw, shown) => {
    expect(normaliseLine(raw)).toBe(shown);
  });
});

describe("quotes and evasions are refused (D158)", () => {
  it.each(["Your 'move' was predictable.", "Your ‘turn’ was predictable.", 'Your "move" was predictable.'])("the turn word rule reads through the quotes: %j", (line) => {
    expect(validChatLine(line, blunder)).toBe(false);
    expect(validChatLine(line, move)).toBe(false);
  });

  it("refuses the audit's turn cue evasion, even after a blunder", () => {
    expect(validChatLine("Oh you. Less staring, more strategy.", blunder)).toBe(false);
    expect(validChatLine("On you. Less staring, more strategy.", blunder)).toBe(false);
    expect(validChatLine("Over to you, I am done here.", move)).toBe(false);
  });

  it("refuses quotes left after normalising", () => {
    expect(validChatLine('That was a "real idea" you had.', blunder)).toBe(false);
    expect(validChatLine("I like my 'big idea' here.", move)).toBe(false);
    expect(validChatLine("I'm ready, and you're about to see why.", move)).toBe(true);
  });

  it("shows the line in its normal form, with a capital first letter", () => {
    expect(readTaunt(JSON.stringify({ reaction: '"i am just getting started."' }), taunt)).toBe("I am just getting started.");
    expect(readTaunt(JSON.stringify({ reaction: "Your 'move' was predictable." }), taunt)).toBeNull();
  });
});
