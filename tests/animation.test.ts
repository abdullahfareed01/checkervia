// Phase B: the move animation planner (pure), the player (with fake elements
// and fake timers) and the shake. Timings are at speed 1 unless said.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Move } from "../src/engine";
import { at } from "../src/engine/testUtils";
import { LIFT, TIMING, clampSpeed, moveAnimationTime, planMove, staggerOrder } from "../src/ui/animation/plan";
import type { MovePlan, PlanStep } from "../src/ui/animation/plan";
import { arcKeyframes, playPlan, travelKeyframes } from "../src/ui/animation/player";
import { SHAKE_MS, SHAKE_PX, shakeAt } from "../src/ui/animation/shake";

const step: Move = { from: at(5, 2), to: at(4, 3), path: [at(4, 3)], captured: [] };
const jump: Move = { from: at(5, 2), to: at(3, 4), path: [at(3, 4)], captured: [at(4, 3)] };
const doubleJump: Move = { from: at(7, 2), to: at(3, 6), path: [at(5, 4), at(3, 6)], captured: [at(6, 3), at(4, 5)] };
const standard = { level: "standard" as const, speed: 1 };
const cinematic = { level: "cinematic" as const, speed: 1 };

const kinds = (plan: MovePlan) => plan.steps.map((s) => s.kind);
const of = <K extends PlanStep["kind"]>(plan: MovePlan, kind: K) => plan.steps.filter((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind);
const timeOf = (s: PlanStep) => ("start" in s ? s.start : s.time);

describe("animation planner", () => {
  it("a simple move: one 240 ms hop, the clack at the landing, then the settle", () => {
    const plan = planMove(step, false, standard);
    expect(plan.animated).toBe(true);
    expect(of(plan, "hop")).toEqual([{ kind: "hop", hop: 0, from: at(5, 2), to: at(4, 3), start: 0, duration: 240 }]);
    expect(of(plan, "beat")).toEqual([{ kind: "beat", time: 240, beat: { event: "move", options: { column: 3 } } }]);
    expect(of(plan, "settle")).toEqual([{ kind: "settle", at: at(4, 3), start: 240, duration: TIMING.settleMs }]);
    expect(of(plan, "highlight")[0]!.start).toBe(240);
    expect(plan.landing).toBe(240);
    expect(plan.lockUntil).toBe(240);
    expect(plan.total).toBe(240 + TIMING.settleMs);
  });

  it("a capture: a longer hop (300 ms), and the jumped piece goes as the capturing piece lands", () => {
    const plan = planMove(jump, false, standard);
    expect(of(plan, "hop")[0]!.duration).toBe(300);
    expect(of(plan, "capture")).toEqual([{ kind: "capture", index: 0, square: at(4, 3), start: 300, duration: 180 }]);
    expect(of(plan, "beat")[0]).toMatchObject({ time: 300, beat: { event: "capture" } });
    expect(plan.total).toBe(300 + 180);
    expect(kinds(plan)).not.toContain("dust"); // Cinematic only
  });

  it("hops stay within 240 to 320 ms at speed 1", () => {
    for (const move of [step, jump, doubleJump]) {
      for (const hop of of(planMove(move, false, standard), "hop")) {
        expect(hop.duration).toBeGreaterThanOrEqual(240);
        expect(hop.duration).toBeLessThanOrEqual(320);
      }
    }
  });

  it("a multi jump: hop by hop (260 ms each), a sound and a capture at each landing, in order", () => {
    const plan = planMove(doubleJump, false, standard);
    expect(of(plan, "hop").map((h) => [h.start, h.duration, h.to])).toEqual([
      [0, 260, at(5, 4)],
      [260, 260, at(3, 6)],
    ]);
    expect(of(plan, "beat").map((b) => [b.time, b.beat.event, b.beat.options.hop, b.beat.options.finalHop])).toEqual([
      [260, "hop", 0, false],
      [520, "hop", 1, true],
    ]);
    expect(of(plan, "capture").map((c) => [c.start, c.square])).toEqual([
      [260, at(6, 3)],
      [520, at(4, 5)],
    ]);
    expect(plan.lockUntil).toBe(520); // input waits for the hops, no longer
    expect(plan.total).toBe(520 + 180);
  });

  it("steps come in time order", () => {
    for (const plan of [planMove(doubleJump, true, cinematic), planMove(jump, false, standard)]) {
      const times = plan.steps.map(timeOf);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it("crowning: a 400 ms crown after the landing, its chime just after the clack", () => {
    const plan = planMove(step, true, standard);
    expect(of(plan, "crown")).toEqual([{ kind: "crown", at: at(4, 3), start: 240, duration: 400 }]);
    expect(of(plan, "beat").map((b) => [b.time, b.beat.event])).toEqual([
      [240, "move"],
      [240 + TIMING.crownAfterMs, "crown"],
    ]);
    expect(plan.total).toBe(240 + 400);
    expect(plan.lockUntil).toBe(240); // the crown does not hold the board
  });

  it("Cinematic adds a faint dust ring per capture, at the same moment", () => {
    const plan = planMove(doubleJump, false, cinematic);
    expect(of(plan, "dust").map((d) => [d.start, d.square])).toEqual([
      [260, at(6, 3)],
      [520, at(4, 5)],
    ]);
  });

  it("speed scales every duration, and stays between 0.75 and 1.5", () => {
    const fast = planMove(doubleJump, false, { level: "standard", speed: 1.5 });
    expect(of(fast, "hop").map((h) => h.duration)).toEqual([173, 173]);
    expect(fast.landing).toBe(346);
    const slow = planMove(step, false, { level: "standard", speed: 0.75 });
    expect(slow.landing).toBe(320);
    expect(clampSpeed(3)).toBe(1.5);
    expect(clampSpeed(0.1)).toBe(0.75);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });

  it("Off and Reduced: straight to the final state, no lock, at most a 100 ms fade; the hops still sound", () => {
    const off = planMove(doubleJump, true, { level: "off", speed: 1 });
    const reduced = planMove(doubleJump, true, { level: "reduced", speed: 1 });
    for (const plan of [off, reduced]) {
      expect(plan.animated).toBe(false);
      expect(plan.lockUntil).toBe(0);
      expect(kinds(plan)).not.toContain("hop");
      expect(of(plan, "beat").map((b) => [b.time, b.beat.event])).toEqual([
        [0, "hop"],
        [70, "hop"],
        [140, "crown"],
      ]);
    }
    expect(of(off, "fade")).toEqual([]);
    expect(of(reduced, "fade")).toEqual([{ kind: "fade", start: 0, duration: 100 }]);
    expect(of(reduced, "fade")[0]!.duration).toBeLessThanOrEqual(100);
  });

  it("the time a move takes follows the level (the result panel waits for it)", () => {
    expect(moveAnimationTime(doubleJump, standard)).toBe(700);
    expect(moveAnimationTime(step, { level: "off", speed: 1 })).toBe(0);
  });

  it("Cinematic destinations: nearest first", () => {
    expect(staggerOrder(at(5, 2), at(4, 3))).toBe(0);
    expect(staggerOrder(at(5, 2), at(3, 4))).toBe(1);
  });
});

describe("player keyframes", () => {
  const plan = planMove(doubleJump, false, standard);
  const hops = of(plan, "hop");

  it("the travel lands on each square, offsets running from 0 to 1 in order", () => {
    const frames = travelKeyframes(hops, plan.landing);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.5, 1]);
    expect(frames.map((f) => f.transform)).toEqual(["translate(0%, 0%)", "translate(200%, -200%)", "translate(400%, -400%)"]);
  });

  it("the lift arc peaks inside each hop and is back down at every landing", () => {
    const frames = arcKeyframes(hops, plan.landing, { transform: "up" }, { transform: "rest" });
    expect(frames.map((f) => f.transform)).toEqual(["rest", "up", "rest", "up", "rest"]);
    const offsets = frames.map((f) => f.offset as number);
    offsets.slice(1).forEach((o, i) => expect(o).toBeGreaterThan(offsets[i]!));
    expect(offsets[1]).toBeGreaterThan(0);
    expect(offsets[1]).toBeLessThan(0.5);
    expect(offsets[2]).toBe(0.5);
    expect(LIFT).toBeGreaterThan(0);
  });
});

// A fake element: records the animations asked of it.
const fakeElement = () => {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  const element = {
    calls,
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
      const call = { frames, options, cancelled: false };
      calls.push(call);
      return { cancel: () => void (call.cancelled = true) } as Animation;
    },
  };
  return element as unknown as HTMLElement & { calls: typeof calls };
};

describe("player", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("plays each landing's sound at its time, unlocks at the landing, finishes at the end", () => {
    const plan = planMove(doubleJump, true, standard);
    const onBeat = vi.fn();
    const onUnlock = vi.fn();
    const onDone = vi.fn();
    playPlan(plan, {}, { onBeat, onUnlock, onDone });
    vi.advanceTimersByTime(259);
    expect(onBeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBeat).toHaveBeenLastCalledWith(expect.objectContaining({ event: "hop" }));
    vi.advanceTimersByTime(260);
    expect(onBeat).toHaveBeenCalledTimes(2);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TIMING.crownAfterMs);
    expect(onBeat).toHaveBeenLastCalledWith(expect.objectContaining({ event: "crown" }));
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(plan.total);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("animates with transforms and opacity only, each captured piece fading at its landing", () => {
    const targets = { travel: fakeElement(), lift: fakeElement(), shadow: fakeElement(), piece: fakeElement(), captured: [fakeElement(), fakeElement()], dust: [fakeElement(), fakeElement()] };
    playPlan(planMove(doubleJump, false, cinematic), targets, {});
    const all = [targets.travel, targets.lift, targets.shadow, targets.piece, ...targets.captured, ...targets.dust].flatMap((e) => e.calls);
    for (const call of all) {
      for (const frame of call.frames) {
        for (const property of Object.keys(frame)) expect(["transform", "opacity", "offset", "easing"]).toContain(property);
      }
    }
    expect(targets.captured.map((e) => e.calls[0]!.options.delay)).toEqual([260, 520]);
    expect(targets.captured[0]!.calls[0]!.options.duration).toBe(180);
    expect(targets.dust[1]!.calls).toHaveLength(1);
    expect(targets.piece.calls[0]!.options.delay).toBe(520); // the settle at the final landing
    expect(targets.travel.calls[0]!.options.duration).toBe(520);
  });

  it("cancel stops everything at once: no later sounds, no unlock, animations cancelled", () => {
    const travel = fakeElement();
    const onBeat = vi.fn();
    const onUnlock = vi.fn();
    const onDone = vi.fn();
    const cancel = playPlan(planMove(doubleJump, false, standard), { travel }, { onBeat, onUnlock, onDone });
    vi.advanceTimersByTime(100);
    cancel(); // New game in the middle of the hops
    vi.advanceTimersByTime(5000);
    expect(onBeat).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(travel.calls.every((c) => c.cancelled)).toBe(true);
  });

  it("Off and Reduced: no element animations, only the sounds", () => {
    const travel = fakeElement();
    const onBeat = vi.fn();
    playPlan(planMove(jump, false, { level: "reduced", speed: 1 }), { travel }, { onBeat });
    vi.advanceTimersByTime(0);
    expect(travel.calls).toHaveLength(0);
    expect(onBeat).toHaveBeenCalledTimes(1);
  });
});

describe("shake for a tap that does nothing", () => {
  const rootWith = (piece: HTMLElement | null) =>
    ({
      querySelector: (selector: string) => {
        expect(selector).toBe('.board [aria-label^="Row 6, column 3,"]');
        return { querySelector: () => piece, animate: () => {} };
      },
    }) as unknown as ParentNode;

  it("shakes the piece 4 px for 160 ms in Standard and Cinematic", () => {
    const piece = fakeElement();
    expect(shakeAt(at(5, 2), "standard", rootWith(piece))).toBe(true);
    expect(shakeAt(at(5, 2), "cinematic", rootWith(piece))).toBe(true);
    expect(piece.calls[0]!.options.duration).toBe(SHAKE_MS);
    expect(piece.calls[0]!.frames.map((f) => f.transform)).toContain(`translateX(${-SHAKE_PX}px)`);
    expect(SHAKE_PX).toBe(4);
    expect(SHAKE_MS).toBe(160);
  });

  it("not in Off or Reduced", () => {
    const piece = fakeElement();
    expect(shakeAt(at(5, 2), "off", rootWith(piece))).toBe(false);
    expect(shakeAt(at(5, 2), "reduced", rootWith(piece))).toBe(false);
    expect(piece.calls).toHaveLength(0);
  });
});
