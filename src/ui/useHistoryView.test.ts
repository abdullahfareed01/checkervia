import { describe, expect, it } from "vitest";
import { nextAnimationKey } from "./useHistoryView";

// Feed a sequence of on-screen positions and collect the keys the Board gets.
function keysFor(indexes: number[]): number[] {
  let previousIndex = indexes[0]!;
  let key = 0;
  return indexes.map((index) => {
    key = nextAnimationKey(previousIndex, index, key);
    previousIndex = index;
    return key;
  });
}

describe("nextAnimationKey", () => {
  it("animates each new move as it is played", () => {
    expect(keysFor([0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
  });

  it("does not animate going back or jumping", () => {
    expect(keysFor([5, 4, 0, 3])).toEqual([0, 0, 0, 0]);
  });

  it("animates the forward arrow, one step at a time", () => {
    expect(keysFor([5, 2, 3, 4])).toEqual([0, 0, 3, 4]);
  });

  it("re-renders of the same position keep the same key (no replay)", () => {
    expect(keysFor([0, 1, 1, 1])).toEqual([0, 1, 1, 1]);
  });

  it("a new game starts without animation and animates its first move", () => {
    expect(keysFor([7, 0, 1])).toEqual([0, 0, 1]);
  });

  it("animates the same move again after going back and forward", () => {
    // 3 -> back to 2 (no animation) -> forward to 3 (animates move 3 again)
    expect(keysFor([3, 2, 3])).toEqual([0, 0, 3]);
  });
});
