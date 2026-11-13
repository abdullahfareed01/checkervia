// The move animation as a plan: pure timed steps, no DOM. Given a move (its
// path, the pieces it captures, whether it makes a King) and the animation
// settings, it says what happens when: each hop, each landing with its
// sound and vibration, each captured piece fading at the landing that takes
// it, the settle, the crown, the last move highlight. A small player
// (player.ts) runs the plan; the game state itself is already final.
import type { Move, Position } from "../../engine";
import { moveFeedback } from "../feedback";
import type { MoveBeat } from "../feedback";
import type { AnimationLevel } from "../settings";

// Every timing in one place, in milliseconds at speed 1.
export const TIMING = {
  stepMs: 240, // a simple move, one square
  jumpMs: 300, // a single capture, two squares
  multiHopMs: 260, // each hop of a multi jump
  settleMs: 90, // landing: scale 1.04 back to 1
  captureMs: 180, // a jumped piece shrinks and fades
  dustMs: 320, // the faint ring under a capture (Cinematic only)
  crownMs: 400, // the crown drops and a light sweeps across the piece
  crownAfterMs: 60, // the crown's chime comes just after the landing clack
  selectMs: 120, // picking up a piece
  staggerMs: 35, // Cinematic: legal destinations appear one ring at a time
  fadeMs: 100, // Reduced: at most a short fade, no travel
  instantBeatGapMs: 70, // Off and Reduced: hop sounds a moment apart
} as const;

export const LIFT = 0.16; // how high a hop rises, in squares
export const SETTLE_SCALE = 1.04;
export const SPEED_MIN = 0.75;
export const SPEED_MAX = 1.5;

export interface AnimationOptions {
  readonly level: AnimationLevel;
  readonly speed: number; // 0.75 (slower) to 1.5 (faster)
}

export type PlanStep =
  | { kind: "hop"; hop: number; from: Position; to: Position; start: number; duration: number }
  | { kind: "beat"; time: number; beat: MoveBeat }
  | { kind: "settle"; at: Position; start: number; duration: number }
  | { kind: "capture"; index: number; square: Position; start: number; duration: number }
  | { kind: "dust"; index: number; square: Position; start: number; duration: number }
  | { kind: "crown"; at: Position; start: number; duration: number }
  | { kind: "fade"; start: number; duration: number }
  | { kind: "highlight"; start: number };

export interface MovePlan {
  readonly animated: boolean; // false: Off and Reduced, the board is final at once
  readonly steps: readonly PlanStep[];
  readonly landing: number; // when the piece reaches its last square
  readonly lockUntil: number; // input waits until then (the hops), never longer
  readonly total: number; // when everything has finished
}

const stepTime = (step: PlanStep): number => ("start" in step ? step.start : step.time);

/** The speed setting, kept inside its range. */
export function clampSpeed(speed: number): number {
  return Number.isFinite(speed) ? Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed)) : 1;
}

/** How long one hop of this move takes at speed 1. */
export function hopDuration(move: Move): number {
  if (move.captured.length === 0) return TIMING.stepMs;
  return move.path.length === 1 ? TIMING.jumpMs : TIMING.multiHopMs;
}

/** The plan for a move. Steps are in time order. */
export function planMove(move: Move, crowned: boolean, options: AnimationOptions): MovePlan {
  const scale = 1 / clampSpeed(options.speed);
  const beats = moveFeedback(move, crowned);
  const steps: PlanStep[] = [];

  if (options.level === "off" || options.level === "reduced") {
    // Straight to the final position: at most a short fade (none when Off).
    // The sounds still mark each hop, a moment apart.
    const fade = options.level === "reduced" ? TIMING.fadeMs : 0;
    if (fade > 0) steps.push({ kind: "fade", start: 0, duration: fade });
    beats.forEach((beat, i) => steps.push({ kind: "beat", time: Math.round(i * TIMING.instantBeatGapMs * scale), beat }));
    steps.push({ kind: "highlight", start: 0 });
    const lastBeat = Math.round((beats.length - 1) * TIMING.instantBeatGapMs * scale);
    return { animated: false, steps: sortSteps(steps), landing: 0, lockUntil: 0, total: Math.max(fade, lastBeat) };
  }

  const hop = Math.round(hopDuration(move) * scale);
  const squares = [move.from, ...move.path];
  let time = 0;
  move.path.forEach((to, i) => {
    steps.push({ kind: "hop", hop: i, from: squares[i]!, to, start: time, duration: hop });
    time += hop;
    steps.push({ kind: "beat", time, beat: beats[i]! });
    const captured = move.captured[i];
    if (captured) {
      // The jumped piece goes as the capturing piece lands.
      steps.push({ kind: "capture", index: i, square: captured, start: time, duration: Math.round(TIMING.captureMs * scale) });
      if (options.level === "cinematic") {
        steps.push({ kind: "dust", index: i, square: captured, start: time, duration: Math.round(TIMING.dustMs * scale) });
      }
    }
  });
  const landing = time;
  steps.push({ kind: "settle", at: move.to, start: landing, duration: Math.round(TIMING.settleMs * scale) });
  steps.push({ kind: "highlight", start: landing });
  if (crowned) {
    steps.push({ kind: "crown", at: move.to, start: landing, duration: Math.round(TIMING.crownMs * scale) });
    steps.push({ kind: "beat", time: landing + Math.round(TIMING.crownAfterMs * scale), beat: beats[beats.length - 1]! });
  }
  const ordered = sortSteps(steps);
  const total = Math.max(...ordered.map((step) => stepTime(step) + ("duration" in step ? step.duration : 0)));
  return { animated: true, steps: ordered, landing, lockUntil: landing, total };
}

// Time order; at the same moment, the order they were planned in.
function sortSteps(steps: PlanStep[]): PlanStep[] {
  return steps.map((step, i) => [step, i] as const).sort((a, b) => stepTime(a[0]) - stepTime(b[0]) || a[1] - b[1]).map(([step]) => step);
}

/** How long a move takes to show under these settings (crowning aside). */
export function moveAnimationTime(move: Move, options: AnimationOptions): number {
  return planMove(move, false, options).total;
}

/** Cinematic: the order in which a legal destination appears (by distance). */
export function staggerOrder(from: Position, to: Position): number {
  return Math.max(Math.abs(to.row - from.row), Math.abs(to.col - from.col)) - 1;
}
