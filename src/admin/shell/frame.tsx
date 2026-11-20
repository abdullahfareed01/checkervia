// D111: what the frame shares with its pages. A page puts its controls (the
// period, Refresh, Export) in the header row beside Open Game, and can open
// another section. The menu badges (players online, open reports,
// suspensions) come from the latest overview totals.
import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { OverviewPeriod, OverviewTotals } from "../analytics";

export interface Frame {
  readonly slot: HTMLElement | null;
  readonly go: (sectionId: string) => void;
}
export const FrameContext = createContext<Frame>({ slot: null, go: () => undefined });
export const useFrame = () => useContext(FrameContext);

/** The page's header controls; inline when there is no frame (tests). */
export function PageActions({ children }: { children: ReactNode }) {
  const { slot } = useFrame();
  return slot ? createPortal(children, slot) : <div className="adm-toolbar">{children}</div>;
}

export interface Badges { readonly onlineNow: number; readonly openReports: number; readonly suspended: number }
let badges: Badges | null = null;
const listeners = new Set<() => void>();
export function publishBadges(totals: Pick<OverviewTotals, "onlineNow" | "openReports" | "suspended">): void {
  const next = { onlineNow: totals.onlineNow, openReports: totals.openReports, suspended: totals.suspended };
  if (badges && badges.onlineNow === next.onlineNow && badges.openReports === next.openReports && badges.suspended === next.suspended) return;
  badges = next;
  listeners.forEach((listener) => listener());
}
export function useBadges(): Badges | null {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => badges, () => null);
}

/** The statistics period, kept while moving between the overview pages. */
let lastPeriod: OverviewPeriod = "30";
export const rememberedPeriod = () => lastPeriod;
export const rememberPeriod = (period: OverviewPeriod) => { lastPeriod = period; };

/**
 * Sizes from data: a bar's `data-w` or `data-h` percent becomes its width or
 * height through the CSSOM, which the admin CSP allows (`style-src 'self'`
 * forbids style attributes in markup, not script set styles).
 */
export function useDataSizes(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>("[data-w]").forEach((node) => { node.style.width = `${node.dataset["w"]}%`; });
    root.current?.querySelectorAll<HTMLElement>("[data-h]").forEach((node) => { node.style.height = `${node.dataset["h"]}%`; });
  });
}
