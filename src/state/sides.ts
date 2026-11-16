// The person's colour for a new game against the AI (D81): Black or White,
// one chance in two each, like chess.com. Kept out of the reducer, which
// must stay pure: callers pick the colour and pass it in the action.
import type { Player } from "../engine";

export function randomSide(random: () => number = Math.random): Player {
  return random() < 0.5 ? "black" : "white";
}
