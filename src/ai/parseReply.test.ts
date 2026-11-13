import { describe, expect, it } from "vitest";
import { MAX_REASON_LENGTH, cleanReason, parseReply } from "./parseReply";

const COUNT = 7; // pretend the legal list has 7 moves

function expectNumber(text: string, number: number) {
  expect(parseReply(text, COUNT)).toEqual({ ok: true, number });
}

function expectRejected(text: string, reasonPart: string) {
  const result = parseReply(text, COUNT);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toContain(reasonPart);
}

describe("parseReply: accepted replies", () => {
  it("reads plain JSON", () => {
    expectNumber('{"move": 3}', 3);
  });

  it("accepts the first and last move in the list", () => {
    expectNumber('{"move": 1}', 1);
    expectNumber('{"move": 7}', 7);
  });

  it("ignores spacing and line breaks", () => {
    expectNumber('  {\n  "move":   5\n}  ', 5);
  });

  it("accepts JSON inside a code fence", () => {
    expectNumber('```json\n{"move": 4}\n```', 4);
  });

  it("accepts JSON with words before and after it", () => {
    expectNumber('I will take the capture. {"move": 2} Good luck!', 2);
  });

  it("accepts a whole number written with a decimal point, like 3.0", () => {
    expectNumber('{"move": 3.0}', 3);
  });

  it("accepts extra fields and nested objects", () => {
    expectNumber('{"move": 6, "why": {"idea": "keeps the back row"}}', 6);
  });

  it("is not confused by braces inside strings", () => {
    expectNumber('{"note": "a } here", "move": 2}', 2);
  });

  it("accepts the same move stated twice", () => {
    expectNumber('{"move": 3} ... again: {"move": 3}', 3);
  });

  it("skips a broken brace before a valid object", () => {
    expectNumber('{ oops {"move": 5}', 5);
  });
});

describe("parseReply: rejected replies", () => {
  it("rejects a number above the list", () => {
    expectRejected('{"move": 8}', "Move 8 is not in the list");
    expectRejected('{"move": 8}', "1 to 7");
  });

  it("rejects zero", () => {
    expectRejected('{"move": 0}', "Move 0 is not in the list");
  });

  it("rejects a negative number", () => {
    expectRejected('{"move": -2}', "Move -2 is not in the list");
  });

  it("rejects a decimal", () => {
    expectRejected('{"move": 2.5}', "whole number");
  });

  it("rejects a number written as a string", () => {
    expectRejected('{"move": "3"}', "must be a number");
  });

  it("rejects null, booleans and arrays", () => {
    expectRejected('{"move": null}', "null");
    expectRejected('{"move": true}', "boolean");
    expectRejected('{"move": [3]}', "an array");
  });

  it("rejects garbage text", () => {
    expectRejected("banana", '"move"');
  });

  it("rejects an empty reply", () => {
    expectRejected("", '"move"');
  });

  it("rejects a bare number with no JSON", () => {
    expectRejected("3", '"move"');
  });

  it("rejects JSON without a move field", () => {
    expectRejected('{"choice": 3}', '"move"');
  });

  it("rejects broken JSON", () => {
    expectRejected('{"move": }', '"move"');
  });

  it("rejects a reply that names two different moves", () => {
    expectRejected('{"move": 1} or maybe {"move": 2}', "more than one different move");
  });

  it("rejects everything when the list is empty", () => {
    expect(parseReply('{"move": 1}', 0).ok).toBe(false);
  });
});

describe("parseReply: the optional reason", () => {
  it("returns the reason next to the number", () => {
    expect(parseReply('{"move": 3, "reason": "Takes a piece."}', COUNT)).toEqual({
      ok: true,
      number: 3,
      reason: "Takes a piece.",
    });
  });

  it("accepts a reply without a reason, or with a reason that is not text", () => {
    expectNumber('{"move": 3}', 3);
    expectNumber('{"move": 3, "reason": 42}', 3);
    expectNumber('{"move": 3, "reason": null}', 3);
    expectNumber('{"move": 3, "reason": "   "}', 3);
  });

  it("does not let a bad reason save a bad move", () => {
    expectRejected('{"move": 9, "reason": "Best move."}', "not in the list");
  });

  it("tidies whitespace", () => {
    expect(cleanReason("  Keeps\n the   centre.  ")).toBe("Keeps the centre.");
  });

  it("cuts a very long reason", () => {
    const long = cleanReason("word ".repeat(100))!;
    expect(long.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });

  it("keeps markup as plain text (React escapes it when shown)", () => {
    expect(cleanReason("<b>bold</b>")).toBe("<b>bold</b>");
  });
});
