// D112: light and dark. The dashboard follows the device (prefers-color-
// scheme) unless the admin picks Light or Dark, which this browser keeps.
// The choice is a per device convenience, so it lives in localStorage and
// every read and write survives storage being blocked.
import { useSyncExternalStore } from "react";

export const THEMES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEMES)[number];
const KEY = "checkervia-admin-theme";
const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;

export function readTheme(): ThemeChoice {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Light or Dark sets `data-theme` on the page; System removes it, so the CSS media query decides. */
export function applyTheme(choice: ThemeChoice, root: { dataset: DOMStringMap } | undefined = globalThis.document?.documentElement): void {
  current = choice;
  if (!root) return;
  if (choice === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = choice;
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, choice);
  } catch {
    // Blocked storage: the choice still applies until the page closes.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => current ?? readTheme(),
    () => "system",
  );
}
