// Engine-checked facts about a move, shown next to the AI's own reason.
import { describe, expect, it } from "vitest";
import { getLegalMoves, samePosition } from "../engine";
import type { Board, Move, Player } from "../engine";
import { at, boardFrom } from "../engine/testUtils";
import { describeFacts, moveFacts } from "./moveFacts";

const EMPTY = "........";

function board(rows: Record<number, string>): Board {
  return boardFrom(Array.from({ length: 8 }, (_, row) => rows[row] ?? EMPTY));
}

// The legal move of `player` that ends on (row, col).
function moveTo(position: Board, player: Player, row: number, col: number): Move {
  const move = getLegalMoves(position, player).find((m) => samePosition(m.to, at(row, col)));
  if (!move) throw new Error(`no legal move to ${row},${col}`);
  return move;
}

const texts = (position: Board, move: Move, player: Player) =>
  describeFacts(moveFacts(position, move, player)).map((line) => line.text);

describe("moveFacts", () => {
  it("a winning capture that was the only legal move", () => {
    const position = board({ 2: ".w......", 3: "..b....." });
    const move = moveTo(position, "white", 4, 3);

    expect(moveFacts(position, move, "white")).toEqual({
      choices: 1,
      captured: 1,
      crowned: false,
      wins: true,
      movedPieceAtRisk: false,
      othersAtRisk: 0,
    });
    expect(texts(position, move, "white")).toEqual([
      "This move wins the game.",
      "It captured 1 piece. Capturing was mandatory.",
      "This was the only legal move.",
    ]);
  });

  it("crowning on the far row, and a safe square", () => {
    const position = board({ 1: "b.......", 6: ".w......" });
    const move = moveTo(position, "white", 7, 0);
    const facts = moveFacts(position, move, "white");

    expect(facts).toMatchObject({ choices: 2, crowned: true, wins: false, movedPieceAtRisk: false });
    expect(describeFacts(facts)).toEqual([
      { tone: "good", text: "The piece reached the far row and became a King." },
      { tone: "info", text: "It chose 1 of 2 legal moves." },
      { tone: "good", text: "The moved piece cannot be captured next turn." },
    ]);
  });

  it("a King moving again is not counted as crowned", () => {
    const position = board({ 1: "b.......", 6: ".W......" });
    expect(moveFacts(position, moveTo(position, "white", 7, 0), "white").crowned).toBe(false);
  });

  it("a move that hangs the moved piece and leaves another piece open", () => {
    const position = board({ 2: "...w....", 3: "..w.....", 4: "...b.b..", 5: "....b..." });
    const move = moveTo(position, "white", 3, 4);
    const facts = moveFacts(position, move, "white");

    expect(facts).toMatchObject({ captured: 0, movedPieceAtRisk: true, othersAtRisk: 1 });
    expect(describeFacts(facts).filter((line) => line.tone === "bad").map((l) => l.text)).toEqual([
      "The moved piece can be captured next turn.",
      "1 other piece can be captured next turn.",
    ]);
  });

  it("counts a multi jump", () => {
    // Black on (6,1) jumps (5,2) and then (3,4): two pieces in one move.
    const position = board({ 0: ".......w", 3: "....w...", 5: "..w.....", 6: ".b......" });
    const move = getLegalMoves(position, "black").find((m) => m.captured.length === 2)!;
    expect(texts(position, move, "black")[0]).toBe("Multi jump: it captured 2 pieces in one move.");
  });
});
