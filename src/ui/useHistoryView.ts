import { useEffect, useRef } from "react";
import type { HistoryTarget } from "../state/gameReducer";

// The Board animates when its key changes to a new positive number; 0 means
// "show it straight away". Only one step forward animates (a new move, or the
// forward arrow); going back or jumping does not.
export function nextAnimationKey(previousIndex: number, index: number, previousKey: number): number {
  if (index === previousIndex) return previousKey;
  return index === previousIndex + 1 ? index : 0;
}

// Keeps the animation key for the position on screen. (Refs updated during
// render: safe here because the same input always gives the same key, so a
// second render in React's StrictMode changes nothing.)
export function useAnimationKey(index: number): number {
  const previous = useRef(index);
  const key = useRef(0);
  key.current = nextAnimationKey(previous.current, index, key.current);
  previous.current = index;
  return key.current;
}

const KEYS: Record<string, HistoryTarget> = {
  ArrowLeft: "back",
  ArrowRight: "forward",
  Home: "first",
  End: "last",
};

// Keyboard arrows step through the history (Home and End jump to the start
// and the latest position). Ignored while a popup is open or while typing.
export function useHistoryKeys(onGo: (to: HistoryTarget) => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const to = KEYS[event.key];
      if (!to || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role='dialog']")) return;
      event.preventDefault();
      onGo(to);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onGo, enabled]);
}
