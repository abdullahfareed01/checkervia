import { describe, expect, it } from "vitest";
import type { Move } from "../engine";
import { at } from "../engine/testUtils";
import {
  JUMP_MS,
  STEP_MS,
  captureTimes,
  hopKeyframes,
  moveDuration,
  routeSquares,
  squareCenter,
} from "./moveGeometry";

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

describe("moveDuration", () => {
  it("gives each hop its own time, jumps a little slower", () => {
    expect(moveDuration(step)).toBe(STEP_MS);
    expect(moveDuration(doubleJump)).toBe(2 * JUMP_MS);
  });
});

describe("hopKeyframes", () => {
  it("a step slides straight to the destination", () => {
    expect(hopKeyframes(step)).toEqual([
      { dx: 0, dy: 0, scale: 1, offset: 0 },
      { dx: 1, dy: -1, scale: 1, offset: 1 },
    ]);
  });

  it("a double jump lands on each square, rising over each captured piece", () => {
    expect(hopKeyframes(doubleJump)).toEqual([
      { dx: 0, dy: 0, scale: 1, offset: 0 },
      { dx: 1, dy: -1, scale: 1.18, offset: 0.25 }, // over (6,3)
      { dx: 2, dy: -2, scale: 1, offset: 0.5 }, // lands on (5,4)
      { dx: 3, dy: -3, scale: 1.18, offset: 0.75 }, // over (4,5)
      { dx: 4, dy: -4, scale: 1, offset: 1 }, // lands on (3,6)
    ]);
  });

  it("the raised midpoints sit exactly over the captured pieces", () => {
    const frames = hopKeyframes(doubleJump).filter((f) => f.scale > 1);
    frames.forEach((frame, i) => {
      const captured = doubleJump.captured[i]!;
      expect(doubleJump.from.col + frame.dx).toBe(captured.col);
      expect(doubleJump.from.row + frame.dy).toBe(captured.row);
    });
  });

  it("offsets always run from 0 to 1 in order", () => {
    const offsets = hopKeyframes(doubleJump).map((f) => f.offset);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(1);
    offsets.slice(1).forEach((o, i) => expect(o).toBeGreaterThan(offsets[i]!));
  });
});

describe("captureTimes", () => {
  it("removes each captured piece as the mover passes over it", () => {
    expect(captureTimes(doubleJump)).toEqual([0.25, 0.75]);
    expect(captureTimes(step)).toEqual([]);
  });
});
