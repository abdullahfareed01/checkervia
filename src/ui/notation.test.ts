import { describe, expect, it } from "vitest";
import { at } from "../engine/testUtils";
import { moveText, squareName } from "./notation";

describe("notation", () => {
  it("names squares like the board's edge labels: column letter, row 8 at the top", () => {
    expect(squareName(at(0, 0))).toBe("A8");
    expect(squareName(at(5, 0))).toBe("A3");
    expect(squareName(at(7, 7))).toBe("H1");
  });

  it("writes a step as from → to", () => {
    expect(moveText({ from: at(5, 0), to: at(4, 1), path: [at(4, 1)], captured: [] })).toBe("A3 → B4");
  });

  it("writes every landing of a multi jump and the number captured", () => {
    const move = { from: at(7, 2), to: at(3, 6), path: [at(5, 4), at(3, 6)], captured: [at(6, 3), at(4, 5)] };
    expect(moveText(move)).toBe("C1 → E3 → G5 ×2");
  });

  it("marks a move that made a King", () => {
    expect(moveText({ from: at(1, 2), to: at(0, 1), path: [at(0, 1)], captured: [] }, true)).toBe("C7 → B8 ♛");
  });
});
