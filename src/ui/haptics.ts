// Short vibrations for the game's events, through navigator.vibrate.
// Patterns are in milliseconds: vibrate, pause, vibrate, ... The intensity
// setting scales the vibrations (not the pauses). Nothing vibrates while the
// page is hidden. Where vibration does not work (iPhone and iPad: Safari
// does not implement the Vibration API, as of 2026), the setting is shown as
// unavailable and the game uses a small visual shake for wrong taps instead.
import type { HapticIntensity } from "./settings";

export const HAPTIC_SCALE: Readonly<Record<HapticIntensity, number>> = {
  off: 0,
  light: 0.6,
  standard: 1,
  strong: 1.5,
};

/** The pattern at an intensity: vibrations scaled and rounded, pauses kept. */
export function scalePattern(pattern: readonly number[], intensity: HapticIntensity): number[] {
  const scale = HAPTIC_SCALE[intensity];
  return pattern.map((ms, index) => (index % 2 === 0 ? Math.max(1, Math.round(ms * scale)) : ms));
}

export interface Haptics {
  readonly supported: boolean;
  /** Vibrates the pattern at the intensity; false when nothing happened. */
  pulse(pattern: readonly number[], intensity: HapticIntensity): boolean;
}

export function createHaptics(options: { vibrate: ((pattern: number[]) => boolean) | null; isHidden?: () => boolean }): Haptics {
  const isHidden = options.isHidden ?? (() => false);
  return {
    supported: options.vibrate !== null,
    pulse(pattern, intensity) {
      if (!options.vibrate || intensity === "off" || pattern.length === 0 || isHidden()) return false;
      try {
        return options.vibrate(scalePattern(pattern, intensity));
      } catch {
        return false; // some browsers throw when vibration is blocked
      }
    },
  };
}

/**
 * True on iPhone and iPad. Every browser there uses Safari's engine, which
 * does not implement vibration; some versions still define navigator.vibrate
 * as a function that does nothing, so its presence proves nothing there.
 * (iPads report themselves as Macs, hence the touch check.)
 */
export function isAppleTouchDevice(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined): boolean {
  if (!nav) return false;
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** navigator.vibrate, if this browser really vibrates. */
export function browserVibrate(): ((pattern: number[]) => boolean) | null {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || isAppleTouchDevice(navigator)) return null;
  return (pattern) => navigator.vibrate(pattern);
}

let shared: Haptics | null = null;

/** The app's haptics (created on first use). */
export function haptics(): Haptics {
  shared ??= createHaptics({
    vibrate: browserVibrate(),
    isHidden: () => typeof document !== "undefined" && document.hidden,
  });
  return shared;
}
