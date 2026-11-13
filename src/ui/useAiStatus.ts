import { useCallback, useEffect, useRef, useState } from "react";
import { checkAiHealth } from "../ai";
import type { AiStatus } from "../ai";

// How long the splash takes to fade out once loading is done.
const SPLASH_FADE_MS = 350;

/**
 * Checks once at start whether the AI function is ready, and again on
 * `recheck`. `status` is "checking" while a check runs. `loaded` turns true
 * when the first check has finished, and stays true.
 */
export function useAiStatus(check: () => Promise<AiStatus> = checkAiHealth) {
  const [status, setStatus] = useState<AiStatus | "checking">("checking");
  const [loaded, setLoaded] = useState(false);
  const [round, setRound] = useState(0);
  // Kept in a ref so a new function on each render does not restart the check.
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    let current = true;
    setStatus("checking");
    void checkRef.current().then((result) => {
      if (!current) return;
      setStatus(result);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [round]);

  const recheck = useCallback(() => setRound((n) => n + 1), []);
  return { status, loaded, recheck };
}

/**
 * Splash visibility: shown until `loaded`, then "leaving" while it fades out,
 * then gone. The fade is skipped for users who prefer reduced motion.
 */
export function useSplash(loaded: boolean): "shown" | "leaving" | "gone" {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    if (!loaded) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      setPhase("gone");
      return undefined;
    }
    setPhase("leaving");
    const timer = setTimeout(() => setPhase("gone"), SPLASH_FADE_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  return phase;
}
