import { describe, expect, it } from "vitest";
import { getLegalMoves, initialBoard } from "../engine";
import { boardFrom } from "../engine/testUtils";
import {
  PROMPT_VERSION,
  buildPrompt,
  buildRetryNote,
  describeBoard,
  describeMove,
  describeMoves,
} from "./prompt";

describe("describeBoard", () => {
  const lines = describeBoard(initialBoard()).split("\n");

  it("letters columns A to H across the top, as on the board", () => {
    expect(lines[0]).toBe("  A B C D E F G H");
  });

  it("numbers rows 8 to 1 from the top, with white at the top and black at the bottom", () => {
    expect(lines[1]).toBe("8 . w . w . w . w");
    expect(lines[3]).toBe("6 . w . w . w . w");
    expect(lines[4]).toBe("5 . . . . . . . .");
    expect(lines[6]).toBe("3 b . b . b . b .");
    expect(lines[8]).toBe("1 b . b . b . b .");
    expect(lines).toHaveLength(9);
  });

  it("writes Kings as capital letters", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "....W...",
      "........",
      "..B.....",
      "........",
      "b.......",
    ]);
    const text = describeBoard(board).split("\n");
    expect(text[4]).toBe("5 . . . . W . . .");
    expect(text[6]).toBe("3 . . B . . . . .");
    expect(text[8]).toBe("1 b . . . . . . .");
  });
});

describe("describeMove", () => {
  it("shows a simple move as from -> to, with the board's square names", () => {
    const [first] = getLegalMoves(initialBoard(), "black");
    expect(describeMove(first!, 1)).toBe("1: A3 -> B4");
  });

  it("lists captured pieces", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      "...w....",
      "..b.....",
      "........",
      "........",
    ]);
    const [capture] = getLegalMoves(board, "black");
    expect(describeMove(capture!, 4)).toBe("4: C3 -> E5 | captures D4");
  });

  it("shows the route and every capture for a multi jump", () => {
    const board = boardFrom([
      "........",
      "........",
      "........",
      "........",
      ".....w..",
      "........",
      "...w....",
      "..b.....",
    ]);
    const [chain] = getLegalMoves(board, "black");
    expect(describeMove(chain!, 1)).toBe(
      "1: C1 -> G5 | route E3, G5 | captures D2, F4",
    );
  });

  it("keeps two routes to the same square apart", () => {
    const diamond = boardFrom([
      "........",
      "........",
      "........",
      "..w.w...",
      "........",
      "..w.w...",
      "...b....",
      "........",
    ]);
    const lines = describeMoves(getLegalMoves(diamond, "black")).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toBe(lines[1]!.replace(/^2/, "1"));
  });
});

describe("describeMoves", () => {
  it("numbers the legal moves from 1, one line each", () => {
    const moves = getLegalMoves(initialBoard(), "black");
    const lines = describeMoves(moves).split("\n");
    expect(lines).toHaveLength(7);
    lines.forEach((line, index) => expect(line.startsWith(`${index + 1}: `)).toBe(true));
  });
});

describe("buildPrompt", () => {
  const board = initialBoard();
  const moves = getLegalMoves(board, "black");
  const prompt = buildPrompt(board, "black", moves);

  it("states the direction of play for both sides", () => {
    expect(prompt).toContain("Black moves up toward row 8. White moves down toward row 1.");
  });

  it("says which side the model plays", () => {
    expect(prompt).toContain("You are playing Black.");
    expect(buildPrompt(board, "white", getLegalMoves(board, "white"))).toContain(
      "You are playing White.",
    );
  });

  it("includes the board grid, the legend and the numbered moves", () => {
    expect(prompt).toContain(describeBoard(board));
    expect(prompt).toContain("b = black piece, B = black king, w = white piece, W = white king");
    expect(prompt).toContain(describeMoves(moves));
  });

  it("asks for a reply of exactly {\"move\": <number>, \"reason\": \"<why>\"}", () => {
    expect(prompt).toContain('Reply with exactly {"move": <number>, "reason": "<why>", "reaction": "<line>"}');
    expect(prompt).toContain("one short sentence (at most 20 words)");
  });

  it("puts the rules first and the move list last", () => {
    expect(prompt.indexOf("Rules:")).toBeLessThan(prompt.indexOf("Position"));
    expect(prompt.indexOf("Position")).toBeLessThan(prompt.indexOf("Legal moves"));
    expect(prompt.trimEnd().endsWith(describeMoves(moves))).toBe(true);
  });
});

describe("prompt version and retry note", () => {
  it("has a version label", () => {
    expect(PROMPT_VERSION).toBe("v8");
  });

  it("the retry note contains the reason and repeats the reply format", () => {
    const note = buildRetryNote("Move 9 is not in the list.", 7);
    expect(note).toContain("Move 9 is not in the list.");
    expect(note).toContain('{"move": <number>, "reason": "<why>", "reaction": "<line>"}');
    expect(note).toContain("1 to 7");
  });
});
