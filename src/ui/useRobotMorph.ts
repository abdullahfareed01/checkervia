// The browser animates path geometry. JavaScript runs only when a target
// changes, sampling the SVG clock to continue an interrupted expression.
import { useEffect, useLayoutEffect, useRef } from "react";
import { betweenPaths, MORPH_MS, WINK_OPEN_EYE, WINK_CLOSED_EYE, pathData, winkEyeAt } from "./robotGeometry";
import type { RobotPose } from "./robotGeometry";

type Paths = RobotPose["paths"];
export interface MorphFrame {
  readonly from: Paths;
  readonly to: Paths;
  readonly started: number;
  readonly requested?: Paths;
  readonly winkRequested?: boolean;
  readonly wink?: boolean;
}

export function sampleFace(frame: MorphFrame, now: number): Paths {
  const paths = Object.fromEntries(Object.entries(frame.to).map(([key, target]) => [key,
    betweenPaths(frame.from[key as keyof Paths], target, (now - frame.started) / MORPH_MS),
  ])) as unknown as Paths;
  return frame.wink && now >= frame.started + MORPH_MS
    ? { ...paths, leftEye: winkEyeAt(now - frame.started - MORPH_MS) }
    : paths;
}

function motionAllowed(): boolean {
  return !["off", "reduced"].includes(document.documentElement.dataset.anim ?? "")
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopMorph(animation: SVGAnimateElement): void {
  // Removing the values invalidates an already active SMIL interval too;
  // changing only its future begin time does not immediately stop it.
  animation.setAttribute("begin", "indefinite");
  animation.removeAttribute("from");
  animation.removeAttribute("to");
  animation.removeAttribute("values");
}

function playMorph(group: SVGGElement, paths: Paths, wink: boolean, previous: MorphFrame | null): MorphFrame {
  const now = group.ownerSVGElement!.getCurrentTime() * 1000;
  const allowed = motionAllowed(), activeWink = wink && allowed;
  const to = activeWink ? { ...paths, leftEye: WINK_OPEN_EYE } : paths;
  const from = previous ? sampleFace(previous, now) : to;
  for (const path of group.querySelectorAll<SVGPathElement>("path[data-morph]")) {
    const key = path.dataset.morph as keyof Paths;
    const animation = path.querySelector<SVGAnimateElement>("animate")!;
    const cycle = path.querySelector<SVGAnimateElement>("[data-wink]");
    if (cycle) stopMorph(cycle);
    const start = pathData(from[key]), target = pathData(to[key]);
    const canAnimate = typeof animation.beginElement === "function";
    if (canAnimate && allowed && ((previous !== null && start !== target) || (activeWink && key === "leftEye"))) {
      animation.setAttribute("from", start);
      animation.setAttribute("to", target);
      animation.setAttribute("begin", `${now / 1000}s`);
    } else stopMorph(animation);
    if (cycle && activeWink && canAnimate) {
      const open = pathData(WINK_OPEN_EYE), closed = pathData(WINK_CLOSED_EYE);
      cycle.setAttribute("values", [open, closed, closed, open, open].join(";"));
      // Begin after the entry morph; the loop starts and ends fully open.
      cycle.setAttribute("begin", `${(now + MORPH_MS) / 1000}s`);
    }
  }
  return { from: allowed ? from : to, to, requested: paths, started: now, winkRequested: wink, wink: activeWink };
}

export function useRobotMorph(paths: Paths, wink = false) {
  const ref = useRef<SVGGElement>(null);
  const frame = useRef<MorphFrame | null>(null);

  useLayoutEffect(() => {
    const group = ref.current;
    if (!group?.ownerSVGElement) return;
    if (frame.current?.requested === paths && frame.current.winkRequested === wink) return;
    frame.current = playMorph(group, paths, wink, frame.current);
  }, [paths, wink]);

  useEffect(() => {
    const updateMotion = () => {
      const group = ref.current, current = frame.current;
      if (!group || !current) return;
      if (motionAllowed()) {
        if (current.winkRequested && !current.wink) frame.current = playMorph(group, current.requested!, true, current);
        return;
      }
      for (const animation of group.querySelectorAll<SVGAnimateElement>("animate")) stopMorph(animation);
      const target = current.requested ?? current.to;
      frame.current = { from: target, to: target, requested: target, winkRequested: current.winkRequested,
        started: group.ownerSVGElement!.getCurrentTime() * 1000 };
    };
    const observer = new MutationObserver(updateMotion);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-anim"] });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", updateMotion);
    return () => { observer.disconnect(); media.removeEventListener("change", updateMotion); };
  }, []);
  return ref;
}
