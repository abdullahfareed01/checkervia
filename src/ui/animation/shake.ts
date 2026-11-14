// A small shake (4 px, 160 ms) for a tap that does nothing. It is also the
// visual stand in for a vibration on phones that cannot vibrate (iPhone).
// Transform only, on the piece (or the square when it is empty). None when
// the animation level is Off or Reduced.
import type { Position } from "../../engine";
import type { AnimationLevel } from "../settings";

export const SHAKE_PX = 4;
export const SHAKE_MS = 160;

export const SHAKE_KEYFRAMES: Keyframe[] = [0, -SHAKE_PX, SHAKE_PX, -SHAKE_PX * 0.75, SHAKE_PX * 0.5, 0].map((x) => ({
  transform: `translateX(${x}px)`,
}));

/** Shakes the piece on `position` (or the square itself) on the game board. */
export function shakeAt(position: Position, level: AnimationLevel, root: ParentNode = document): boolean {
  if (level === "off" || level === "reduced") return false;
  const square = root.querySelector<HTMLElement>(`.board [aria-label^="Row ${position.row + 1}, column ${position.col + 1},"]`);
  const target = square?.querySelector<HTMLElement>(".piece") ?? square;
  if (!target || typeof target.animate !== "function") return false;
  target.animate(SHAKE_KEYFRAMES, { duration: SHAKE_MS, easing: "ease-out" });
  return true;
}
