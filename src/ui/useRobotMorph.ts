// The browser animates path geometry. JavaScript runs only when a target
// changes, sampling the SVG clock to continue an interrupted expression.
import { useEffect, useLayoutEffect, useRef } from "react";
import { betweenPaths, MORPH_MS, pathData } from "./robotGeometry";
import type { RobotPose } from "./robotGeometry";

type Paths = RobotPose["paths"];
export interface MorphFrame { readonly from: Paths; readonly to: Paths; readonly started: number }

export function sampleFace(frame: MorphFrame, now: number): Paths {
  return Object.fromEntries(Object.entries(frame.to).map(([key, target]) => [key,
    betweenPaths(frame.from[key as keyof Paths], target, (now - frame.started) / MORPH_MS),
  ])) as unknown as Paths;
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
}

export function useRobotMorph(paths: Paths) {
  const ref = useRef<SVGGElement>(null);
  const frame = useRef<MorphFrame | null>(null);

  useLayoutEffect(() => {
    const group = ref.current;
    const svg = group?.ownerSVGElement;
    if (!group || !svg) return;
    if (frame.current?.to === paths) return;
    const now = svg.getCurrentTime() * 1000;
    const from = frame.current ? sampleFace(frame.current, now) : paths;
    const animate = frame.current !== null && motionAllowed();
    frame.current = { from: animate ? from : paths, to: paths, started: now };
    for (const path of group.querySelectorAll<SVGPathElement>("path[data-morph]")) {
      const key = path.dataset.morph as keyof Paths;
      const animation = path.querySelector<SVGAnimateElement>("animate")!;
      const start = pathData(from[key]), target = pathData(paths[key]);
      if (animate && start !== target && typeof animation.beginElement === "function") {
        animation.setAttribute("from", start);
        animation.setAttribute("to", target);
        // An absolute SVG time keeps all features on the same interval.
        // Replacing it also discards old begin instances on rapid reversals.
        animation.setAttribute("begin", `${now / 1000}s`);
      } else {
        stopMorph(animation);
      }
    }
  }, [paths]);

  useEffect(() => {
    const settle = () => {
      if (motionAllowed() || !frame.current) return;
      const group = ref.current;
      const current = frame.current.to;
      for (const animation of group?.querySelectorAll<SVGAnimateElement>("animate") ?? []) {
        stopMorph(animation);
      }
      frame.current = { from: current, to: current, started: (group?.ownerSVGElement?.getCurrentTime() ?? 0) * 1000 };
    };
    const observer = new MutationObserver(settle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-anim"] });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", settle);
    return () => { observer.disconnect(); media.removeEventListener("change", settle); };
  }, []);
  return ref;
}
