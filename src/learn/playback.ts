// Playback rules for Learn mode, kept pure so they can be tested.
import type { Frame } from "./frames";

// Time to read a caption: a base plus a little per word, within limits.
const BASE_MS = 1_500;
const PER_WORD_MS = 280;
const MIN_READ_MS = 3_500;
const MAX_READ_MS = 10_000;

/**
 * How long autoplay stays on a frame: the move's animation (if any) plus
 * enough time to read its caption. `animationMs` comes from the UI.
 */
export function frameDelay(frame: Frame, animationMs: number): number {
  const words = frame.caption.trim().split(/\s+/).filter(Boolean).length;
  const reading = Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, BASE_MS + words * PER_WORD_MS));
  return animationMs + reading;
}

export type PlaybackTarget = "first" | "back" | "forward" | "last" | { scene: number };

/**
 * The frame to show after a control is used. "first" and "last" go to the
 * start and end of the current scene; { scene } jumps to that scene's intro.
 * The result always stays inside the list.
 */
export function targetIndex(frames: readonly Frame[], current: number, to: PlaybackTarget): number {
  const clamp = (index: number) => Math.min(Math.max(index, 0), frames.length - 1);
  if (to === "back") return clamp(current - 1);
  if (to === "forward") return clamp(current + 1);

  const scene = typeof to === "object" ? to.scene : frames[current]?.sceneIndex ?? 0;
  const inScene = frames.flatMap((frame, index) => (frame.sceneIndex === scene ? [index] : []));
  if (inScene.length === 0) return clamp(current);
  return to === "last" ? inScene[inScene.length - 1]! : inScene[0]!;
}
