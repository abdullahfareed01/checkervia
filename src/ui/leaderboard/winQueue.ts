// Automatic wins (D61). A qualifying win against the AI is put in the queue
// (profile.ts) when the game ends, and sent when the result panel appears.
// A win that cannot be sent (offline, a server problem, too many requests)
// stays queued and is sent again when the device is back online and when
// the app opens. The game id makes every repeat safe: the server answers a
// win it already has with "duplicate", which counts as done.
//
// The result panel shows the status of its own game's win: sending, added
// (with the rank this week), a problem (the three messages of D59), or a
// refusal the player cannot fix.
import { useSyncExternalStore } from "react";
import { AI_LEVELS } from "../../ai/difficulty";
import type { AiLevel } from "../../ai/difficulty";
import { leaderboardApi } from "./api";
import type { ApiResult } from "./api";
import { leaderboardStore } from "./profile";
import type { QueuedWin } from "./profile";
import { problemOf } from "./Problem";
import type { Problem } from "./Problem";

export type WinStatus =
  | { readonly kind: "sending" }
  | { readonly kind: "added"; readonly rank: number | null; readonly level: AiLevel }
  | { readonly kind: "problem"; readonly problem: Problem }
  | { readonly kind: "refused"; readonly text: string };

const statuses = new Map<string, WinStatus>();
const sending = new Set<string>();
const listeners = new Set<() => void>();

function setStatus(gameId: string, status: WinStatus): void {
  statuses.set(gameId, status);
  for (const listener of listeners) listener();
}

/** What the server's answer means for a queued win. */
export function outcomeOf(result: ApiResult<{ weekRank: number | null }>, level: AiLevel): { status: WinStatus; keep: boolean } {
  if (result.kind === "ok") return { status: { kind: "added", rank: result.value.weekRank, level }, keep: false };
  if (result.kind === "failed" && result.code === "duplicate") return { status: { kind: "added", rank: null, level }, keep: false };
  if (result.kind === "failed" && result.status === 422) {
    return { status: { kind: "refused", text: "This game could not be checked, so it cannot be added." }, keep: false };
  }
  if (result.kind === "failed" && result.status === 401) {
    return { status: { kind: "refused", text: "Your profile was not found on the server, so this win cannot be added." }, keep: false };
  }
  // Offline, a server problem, too many requests, or any other refusal: try again later.
  return { status: { kind: "problem", problem: problemOf(result) }, keep: true };
}

/** Sends one queued win (never twice at once). */
export async function sendWin(win: QueuedWin): Promise<WinStatus> {
  if (sending.has(win.gameId)) return statuses.get(win.gameId) ?? { kind: "sending" };
  sending.add(win.gameId);
  setStatus(win.gameId, { kind: "sending" });
  try {
    const result = await leaderboardApi.submitWin(win.gameId, win.level, win.moves);
    const { status, keep } = outcomeOf(result, win.level);
    if (!keep) leaderboardStore.dequeue(win.gameId);
    setStatus(win.gameId, status);
    return status;
  } finally {
    sending.delete(win.gameId);
  }
}

/** Sends the queued win with this game id, if it is still queued. */
export function sendQueued(gameId: string): void {
  const win = leaderboardStore.freshQueue().find((queued) => queued.gameId === gameId);
  if (win && leaderboardStore.get().profile) void sendWin(win);
}

/** Sends every queued win, one after another, stopping at the first problem. */
export async function flushQueue(): Promise<void> {
  if (!leaderboardStore.get().profile) return;
  for (const win of leaderboardStore.freshQueue()) {
    const status = await sendWin(win);
    if (status.kind === "problem") return;
  }
}

/** On app open and whenever the device comes back online. Returns the cleanup. */
export function startQueueRetries(): () => void {
  const flush = () => void flushQueue();
  flush();
  window.addEventListener("online", flush);
  return () => window.removeEventListener("online", flush);
}

/** The status of one game's win, for the result panel (undefined before it is sent). */
export function useWinStatus(gameId: string): WinStatus | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => statuses.get(gameId),
    () => statuses.get(gameId),
  );
}

/** "Added. You are number 12 this week on Strongest." */
export function addedText(status: Extract<WinStatus, { kind: "added" }>): string {
  const level = AI_LEVELS[status.level].name;
  return status.rank !== null ? `Added. You are number ${status.rank} this week on ${level}.` : `Added. Your win on ${level} counts.`;
}
