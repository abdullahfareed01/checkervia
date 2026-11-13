import { describe, expect, it } from "vitest";
import type { Move } from "../engine";
import { at } from "../engine/testUtils";
import { routeSquares, squareCenter } from "./moveGeometry";

// The move animation's timing and keyframes moved to animation/plan.ts and
// animation/player.ts (D53); their tests are in tests/animation.test.ts.

const step: Move = { from: at(5, 2), to: at(4, 3), path: [at(4, 3)], captured: [] };
const doubleJump: Move = {
  from: at(7, 2),
  to: at(3, 6),
  path: [at(5, 4), at(3, 6)],
  captured: [at(6, 3), at(4, 5)],
};

describe("routeSquares", () => {
  it("lists the start and every landing square", () => {
    expect(routeSquares(step)).toEqual([at(5, 2), at(4, 3)]);
    expect(routeSquares(doubleJump)).toEqual([at(7, 2), at(5, 4), at(3, 6)]);
  });
});

describe("squareCenter", () => {
  it("is the middle of the square, in board units", () => {
    expect(squareCenter(at(0, 0))).toEqual({ x: 0.5, y: 0.5 });
    expect(squareCenter(at(7, 2))).toEqual({ x: 2.5, y: 7.5 });
  });
});
