// Runs a move plan (plan.ts) on the move layer's elements with the Web
// Animations API. Transforms and opacity only, so the browser can do it on
// the compositor without layout work. Sounds, the end of the input lock and
// the end come from timers set at the same moment as the animations.
import type { MoveBeat } from "../feedback";
import { LIFT, SETTLE_SCALE } from "./plan";
import type { MovePlan, PlanStep } from "./plan";

export interface PlayerTargets {
  travel?: HTMLElement | null; // the moving piece's box: square to square
  shadow?: HTMLElement | null; // inside travel: the shadow on the board
  lift?: HTMLElement | null; // inside travel: rises in the middle of each hop
  piece?: HTMLElement | null; // inside lift: the landing settle
  captured?: readonly (HTMLElement | null)[]; // the jumped pieces, by capture
  dust?: readonly (HTMLElement | null)[]; // Cinematic: a faint ring per capture
  crown?: HTMLElement | null; // the crown that drops on a new King
  sheen?: HTMLElement | null; // the light that sweeps across it
}

export interface PlayerHandlers {
  onBeat?: (beat: MoveBeat) => void; // a landing: its sound and vibration
  onUnlock?: () => void; // the hops are over: input may resume
  onDone?: () => void; // everything has finished
}

export interface Timers {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const PAGE_TIMERS: Timers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// Ease out for travel; up fast and down soft for the lift arc.
const EASE_OUT = "cubic-bezier(0.22, 0.8, 0.3, 1)";
const EASE_UP = "cubic-bezier(0.3, 0.7, 0.4, 1)";
const EASE_DOWN = "cubic-bezier(0.6, 0, 0.75, 0.4)";
// Where the arc peaks in a hop: early, because the travel eases out.
const PEAK = 0.42;

type Hop = Extract<PlanStep, { kind: "hop" }>;

/** The moving piece's path: one keyframe per landing (offsets in squares). */
export function travelKeyframes(hops: readonly Hop[], landing: number): Keyframe[] {
  const origin = hops[0]!.from;
  const frames: Keyframe[] = [{ offset: 0, transform: "translate(0%, 0%)", easing: EASE_OUT }];
  for (const hop of hops) {
    const dx = (hop.to.col - origin.col) * 100;
    const dy = (hop.to.row - origin.row) * 100;
    frames.push({ offset: (hop.start + hop.duration) / landing, transform: `translate(${dx}%, ${dy}%)`, easing: EASE_OUT });
  }
  return frames;
}

/** The lift arc (and the shadow under it): up in the middle of each hop. */
export function arcKeyframes(hops: readonly Hop[], landing: number, up: Keyframe, rest: Keyframe): Keyframe[] {
  const frames: Keyframe[] = [{ ...rest, offset: 0, easing: EASE_UP }];
  for (const hop of hops) {
    frames.push({ ...up, offset: (hop.start + hop.duration * PEAK) / landing, easing: EASE_DOWN });
    frames.push({ ...rest, offset: (hop.start + hop.duration) / landing, easing: EASE_UP });
  }
  return frames;
}

/** Plays the plan; returns a function that stops everything at once. */
export function playPlan(plan: MovePlan, targets: PlayerTargets, handlers: PlayerHandlers, timers: Timers = PAGE_TIMERS): () => void {
  const animations: Animation[] = [];
  const handles: unknown[] = [];
  const animate = (element: HTMLElement | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    if (element && typeof element.animate === "function") animations.push(element.animate(frames, options));
  };

  const hops = plan.steps.filter((step): step is Hop => step.kind === "hop");
  if (plan.animated && hops.length > 0) {
    const whole = { duration: plan.landing, fill: "forwards" as const };
    animate(targets.travel, travelKeyframes(hops, plan.landing), whole);
    animate(
      targets.lift,
      arcKeyframes(hops, plan.landing, { transform: `translateY(${-LIFT * 100}%) scale(1.07)` }, { transform: "translateY(0%) scale(1)" }),
      whole,
    );
    animate(targets.shadow, arcKeyframes(hops, plan.landing, { transform: "scale(0.72)", opacity: 0.28 }, { transform: "scale(1)", opacity: 0.55 }), whole);
  }

  for (const step of plan.steps) {
    switch (step.kind) {
      case "settle":
        animate(targets.piece, [{ transform: `scale(${SETTLE_SCALE})` }, { transform: "scale(1)" }], {
          delay: step.start,
          duration: step.duration,
          easing: "ease-out",
        });
        break;
      case "capture":
        animate(targets.captured?.[step.index], [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.55)" }], {
          delay: step.start,
          duration: step.duration,
          easing: "ease-in",
          fill: "forwards",
        });
        break;
      case "dust":
        animate(
          targets.dust?.[step.index],
          [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 0.35, transform: "scale(0.9)", offset: 0.3 }, { opacity: 0, transform: "scale(1.5)" }],
          { delay: step.start, duration: step.duration, easing: "ease-out", fill: "both" },
        );
        break;
      case "crown":
        animate(
          targets.crown,
          [
            { opacity: 0, transform: "translateY(-60%) scale(1.25)" },
            { opacity: 1, transform: "translateY(0%) scale(1)", offset: 0.55 },
            { opacity: 1, transform: "translateY(0%) scale(1)" },
          ],
          { delay: step.start, duration: step.duration, easing: "ease-out", fill: "both" },
        );
        animate(
          targets.sheen,
          [{ opacity: 0, transform: "translateX(-130%)" }, { opacity: 0.6, transform: "translateX(0%)", offset: 0.5 }, { opacity: 0, transform: "translateX(130%)" }],
          { delay: step.start + step.duration * 0.25, duration: step.duration * 0.75, easing: "ease-in-out", fill: "both" },
        );
        break;
      case "beat":
        handles.push(timers.setTimeout(() => handlers.onBeat?.(step.beat), step.time));
        break;
      default:
        break; // hop: above; highlight and fade: CSS on the board
    }
  }
  handles.push(timers.setTimeout(() => handlers.onUnlock?.(), plan.lockUntil));
  handles.push(timers.setTimeout(() => handlers.onDone?.(), plan.total));

  return () => {
    handles.forEach((handle) => timers.clearTimeout(handle));
    animations.forEach((animation) => animation.cancel());
  };
}
