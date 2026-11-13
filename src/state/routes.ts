// Route choice: pure helpers for the case where one piece has several legal
// moves that END on the same square but get there by different jumps.
//
// Two different complete chains from the same square always have different
// landing-square lists (the jumped pieces are the squares in between, so the
// same landings mean the same captures). Neither can be a prefix of the other,
// because a chain only ends when no jump is left. So the routes always part
// ways at some landing square, and asking about that square tells them apart.
import { samePosition } from "../engine";
import type { Move, Position } from "../engine";

// Index of the first landing square where the routes disagree, or -1 if none.
function firstDifference(routes: readonly Move[]): number {
  const [first, ...others] = routes;
  if (!first) return -1;

  const shortest = Math.min(...routes.map((route) => route.path.length));
  for (let i = 0; i < shortest; i++) {
    if (others.some((route) => !samePosition(route.path[i]!, first.path[i]!))) return i;
  }
  return -1;
}

// The squares the player can click to say which route they mean: each
// distinct landing square at the point where the routes first differ.
export function routeChoices(routes: readonly Move[]): Position[] {
  const index = firstDifference(routes);
  if (index < 0) return [];

  const squares: Position[] = [];
  for (const route of routes) {
    const square = route.path[index]!;
    if (!squares.some((seen) => samePosition(seen, square))) squares.push(square);
  }
  return squares;
}

// Keeps only the routes that land on the clicked square at the point where
// they differ. Returns null if the click is not one of the route choices.
export function narrowRoutes(routes: readonly Move[], clicked: Position): Move[] | null {
  const index = firstDifference(routes);
  if (index < 0) return null;

  const kept = routes.filter((route) => samePosition(route.path[index]!, clicked));
  return kept.length > 0 ? kept : null;
}
