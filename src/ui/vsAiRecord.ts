// The player's own totals against the AI on this device (D75): games,
// wins, losses, resignations (a resignation is also a loss) and, since D89,
// draws. Kept in
// localStorage, every access in try and catch, checked on load. Clearing the
// browser data starts them again.
import { useSyncExternalStore } from "react";

export interface VsAiRecord {
  readonly games: number;
  readonly wins: number;
  readonly losses: number; // resignations included
  readonly resigned: number;
  readonly draws?: number; // D89 (missing in records from before it: 0)
}

export type VsAiOutcome = "win" | "loss" | "resigned" | "draw";

export const VS_AI_RECORD_KEY = "checkervia.vsAiRecord";
export const EMPTY_RECORD: VsAiRecord = { games: 0, wins: 0, losses: 0, resigned: 0, draws: 0 };

/** The record after one more finished game. */
export function withOutcome(record: VsAiRecord, outcome: VsAiOutcome): VsAiRecord {
  return {
    games: record.games + 1,
    wins: record.wins + (outcome === "win" ? 1 : 0),
    losses: record.losses + (outcome === "loss" || outcome === "resigned" ? 1 : 0),
    resigned: record.resigned + (outcome === "resigned" ? 1 : 0),
    draws: (record.draws ?? 0) + (outcome === "draw" ? 1 : 0),
  };
}

const count = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);

/** A stored record, or the empty one when it is missing or broken. */
export function parseRecord(raw: string | null): VsAiRecord {
  if (!raw) return EMPTY_RECORD;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const games = count(data["games"]);
    const wins = count(data["wins"]);
    const losses = count(data["losses"]);
    const resigned = count(data["resigned"]);
    // Records from before D89 have no draws.
    const draws = data["draws"] === undefined ? 0 : count(data["draws"]);
    if (games === null || wins === null || losses === null || resigned === null || draws === null) return EMPTY_RECORD;
    if (wins + losses + draws !== games || resigned > losses) return EMPTY_RECORD;
    return { games, wins, losses, resigned, draws };
  } catch {
    return EMPTY_RECORD;
  }
}

function load(): VsAiRecord {
  try {
    return parseRecord(localStorage.getItem(VS_AI_RECORD_KEY));
  } catch {
    return EMPTY_RECORD;
  }
}

let current: VsAiRecord | null = null;
const listeners = new Set<() => void>();

export const vsAiRecordStore = {
  get(): VsAiRecord {
    current ??= load();
    return current;
  },
  add(outcome: VsAiOutcome): void {
    current = withOutcome(vsAiRecordStore.get(), outcome);
    try {
      localStorage.setItem(VS_AI_RECORD_KEY, JSON.stringify(current));
    } catch {
      // Storage full or blocked: the totals still count for this visit.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useVsAiRecord(): VsAiRecord {
  return useSyncExternalStore(vsAiRecordStore.subscribe, vsAiRecordStore.get, () => EMPTY_RECORD);
}
