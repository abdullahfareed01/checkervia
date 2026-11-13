import { useCallback, useState } from "react";
import { toAiLevel } from "../ai";
import type { AiLevel } from "../ai";

const STORAGE_KEY = "draft.aiLevel";

// Storage can be missing or blocked (private windows, tests), so every access
// is guarded; the level then simply is not remembered.
function readStored(): AiLevel {
  try {
    return toAiLevel(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return toAiLevel(null);
  }
}

/** The chosen AI level, remembered in this browser between visits. */
export function useAiLevel(): [AiLevel, (level: AiLevel) => void] {
  const [level, setLevel] = useState<AiLevel>(readStored);
  const change = useCallback((next: AiLevel) => {
    setLevel(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Not remembered; the game works the same.
    }
  }, []);
  return [level, change];
}
