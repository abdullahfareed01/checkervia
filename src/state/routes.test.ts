import { describe, expect, it } from "vitest";
import type { Move } from "../engine";
import { at } from "../engine/testUtils";
import { narrowRoutes, routeChoices } from "./routes";

// Build a move from just its landing squares (captures are not needed here).
function route(...landings: [number, number][]): Move {
  const path = landings.map(([row, col]) => at(row, col));
  return { from: at(6, 3), to: path[path.length - 1]!, path, captured: [] };
}

describe("routeChoices", () => {
  it("asks about the first landing square when routes differ straight away", () => {
    const routes = [route([4, 1], [2, 3]), route([4, 5], [2, 3])];
    expect(routeChoices(routes)).toEqual([at(4, 1), at(4, 5)]);
  });

  it("skips landing squares the routes share", () => {
    const routes = [route([4, 1], [2, 3], [0, 5]), route([4, 1], [2, 5], [0, 5])];
    expect(routeChoices(routes)).toEqual([at(2, 3), at(2, 5)]);
  });

  it("lists each square once even if several routes use it", () => {
    const routes = [
      route([4, 1], [2, 3], [0, 5]),
      route([4, 1], [2, 3], [0, 1]),
      route([4, 5], [2, 3], [0, 5]),
    ];
    expect(routeChoices(routes)).toEqual([at(4, 1), at(4, 5)]);
  });

  it("returns nothing when there is no choice to make", () => {
    expect(routeChoices([route([4, 1])])).toEqual([]);
    expect(routeChoices([])).toEqual([]);
  });
});

describe("narrowRoutes", () => {
  const a = route([4, 1], [2, 3], [0, 5]);
  const b = route([4, 1], [2, 5], [0, 5]);

  it("keeps the routes that use the clicked square", () => {
    expect(narrowRoutes([a, b], at(2, 5))).toEqual([b]);
  });

  it("returns null when the click is not one of the choices", () => {
    expect(narrowRoutes([a, b], at(3, 0))).toBeNull();
    // (4,1) is shared by both routes, so it is not a choice.
    expect(narrowRoutes([a, b], at(4, 1))).toBeNull();
  });

  it("can narrow in several steps", () => {
    const c = route([4, 5], [2, 5], [0, 5]);
    const first = narrowRoutes([a, b, c], at(4, 1));
    expect(first).toEqual([a, b]);
    expect(narrowRoutes(first!, at(2, 3))).toEqual([a]);
  });
});
