// A small record of this tab's games against the AI (Change 4): wins,
// losses, the last result and the AI's recent lines, so greetings can say
// "Back for round 2" and lines do not repeat. Kept in sessionStorage: no
// personal data, gone when the tab closes.
import type { RecentLines } from "../ai/lines";

export const SESSION_KEY = "draft.session";

export interface SessionRecord {
  readonly wins: number; // games the player won against the AI
  readonly losses: number; // games the AI won (resignations included)
  readonly last: "won" | "lost" | null;
  readonly recent: RecentLines;
}

export const EMPTY_SESSION: SessionRecord = { wins: 0, losses: 0, last: null, recent: {} };

type Store = Pick<Storage, "getItem" | "setItem">;

function tabStore(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** This tab's record, or an empty one if there is none or it is unreadable. */
export function readSession(store: Store | null = tabStore()): SessionRecord {
  try {
    const value = JSON.parse(store?.getItem(SESSION_KEY) ?? "null") as Partial<SessionRecord> | null;
    if (!value || typeof value !== "object") return EMPTY_SESSION;
    const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0);
    return {
      wins: count(value.wins),
      losses: count(value.losses),
      last: value.last === "won" || value.last === "lost" ? value.last : null,
      recent: value.recent && typeof value.recent === "object" ? value.recent : {},
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function writeSession(record: SessionRecord, store: Store | null = tabStore()): void {
  try {
    store?.setItem(SESSION_KEY, JSON.stringify(record));
  } catch {
    // Not remembered; greetings just start over.
  }
}

/** The record after a finished game against the AI. */
export function withResult(record: SessionRecord, playerWon: boolean): SessionRecord {
  return playerWon
    ? { ...record, wins: record.wins + 1, last: "won" }
    : { ...record, losses: record.losses + 1, last: "lost" };
}

/** The round number of the next game: games played this session plus one. */
export function nextRound(record: SessionRecord): number {
  return record.wins + record.losses + 1;
}
