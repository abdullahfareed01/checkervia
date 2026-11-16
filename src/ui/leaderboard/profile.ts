// What this browser keeps for the leaderboard (D57, D61), in localStorage,
// each read inside try and catch and checked field by field:
// - the device id: random, made once, sent with every request (the server
//   stores only a keyed hash of it, for rate limits);
// - the profile: the username, the flag, the avatar id and the secret token
//   returned once when the username was claimed. Clearing browser data
//   loses it;
// - the win queue: qualifying wins not yet accepted by the server (offline
//   or a server problem), sent again later. Each is known by its game id, so
//   the server's duplicate check keeps a repeat harmless. A win older than
//   seven days is dropped.
import { useSyncExternalStore } from "react";
import type { AiLevel } from "../../ai/difficulty";
import { LEVELS } from "../../ai/difficulty";
import type { Player } from "../../engine";
import { isAvatarId } from "../../leaderboard/avatars";
import { isCountryCode } from "../../leaderboard/countries";
import { DEVICE_ID_PATTERN, GAME_ID_PATTERN, TOKEN_PATTERN, parseColour } from "../../leaderboard/protocol";
import type { EncodedMove } from "../../leaderboard/protocol";
import { isValidUsername } from "../../leaderboard/username";

export const DEVICE_KEY = "checkervia.device";
export const PROFILE_KEY = "checkervia.profile";
export const QUEUE_KEY = "checkervia.winQueue";
export const QUEUE_MAX_AGE_MS = 7 * 86_400_000;
const QUEUE_MAX = 20; // far more than honest play leaves unsent

export interface Profile {
  readonly username: string;
  readonly country: string | null;
  readonly avatar: string | null; // null for profiles from before avatars
  readonly token: string;
}

export interface QualifyingWin {
  readonly gameId: string;
  readonly level: AiLevel;
  readonly colour: Player; // the player's colour (D81)
  readonly moves: readonly EncodedMove[];
}

export interface QueuedWin extends QualifyingWin {
  readonly queuedAt: number; // ms since 1970
}

interface Snapshot {
  readonly profile: Profile | null;
  readonly queue: readonly QueuedWin[];
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the leaderboard still works this visit.
  }
}

function asProfile(value: unknown): Profile | null {
  const data = value as Partial<Profile> | null;
  if (!data || typeof data.username !== "string" || !isValidUsername(data.username)) return null;
  if (typeof data.token !== "string" || !TOKEN_PATTERN.test(data.token)) return null;
  return {
    username: data.username,
    country: isCountryCode(data.country) ? data.country : null,
    avatar: isAvatarId(data.avatar) ? data.avatar : null,
    token: data.token,
  };
}

function asQueuedWin(value: unknown, now: number): QueuedWin | null {
  const data = value as Partial<QueuedWin> | null;
  if (!data || typeof data.gameId !== "string" || !GAME_ID_PATTERN.test(data.gameId)) return null;
  if (!LEVELS.includes(data.level as AiLevel) || !Array.isArray(data.moves) || data.moves.length === 0) return null;
  if (typeof data.queuedAt !== "number" || now - data.queuedAt > QUEUE_MAX_AGE_MS || data.queuedAt > now + 60_000) return null;
  // Wins queued before random colours (D81) have no colour: they were Black.
  const colour = data.colour === undefined ? "black" : parseColour(data.colour);
  if (!colour) return null;
  return { gameId: data.gameId, level: data.level as AiLevel, colour, moves: data.moves, queuedAt: data.queuedAt };
}

function asQueue(value: unknown, now: number): QueuedWin[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asQueuedWin(item, now)).filter((win): win is QueuedWin => win !== null);
}

/** A random version 4 UUID (randomUUID needs a secure page; this does not). */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A random id, made once per browser. */
export function deviceId(): string {
  const stored = read(DEVICE_KEY);
  if (typeof stored === "string" && DEVICE_ID_PATTERN.test(stored)) return stored;
  const made = randomId();
  write(DEVICE_KEY, made);
  return made;
}

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();
// Tests move the clock.
let clock: () => number = Date.now;

function current(): Snapshot {
  snapshot ??= { profile: asProfile(read(PROFILE_KEY)), queue: asQueue(read(QUEUE_KEY), clock()) };
  return snapshot;
}

function change(next: Partial<Snapshot>): void {
  snapshot = { ...current(), ...next };
  if ("profile" in next) write(PROFILE_KEY, next.profile);
  if ("queue" in next) write(QUEUE_KEY, next.queue!.length > 0 ? next.queue : null);
  for (const listener of listeners) listener();
}

export const leaderboardStore = {
  get: current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setProfile: (profile: Profile | null) => change({ profile }),
  /** After an edit on the server: the parts that changed. */
  updateProfile: (changes: Partial<Omit<Profile, "token">>) => {
    const profile = current().profile;
    if (profile) change({ profile: { ...profile, ...changes } });
  },
  /** Keeps a win until the server has it (once per game id). */
  enqueue: (win: QualifyingWin) => {
    const queue = current().queue.filter((queued) => queued.gameId !== win.gameId);
    change({ queue: [...queue, { ...win, queuedAt: clock() }].slice(-QUEUE_MAX) });
  },
  dequeue: (gameId: string) => {
    if (current().queue.some((queued) => queued.gameId === gameId)) change({ queue: current().queue.filter((queued) => queued.gameId !== gameId) });
  },
  /** The queue without the wins older than seven days (they are forgotten). */
  freshQueue: (): readonly QueuedWin[] => {
    const fresh = asQueue(current().queue, clock());
    if (fresh.length !== current().queue.length) change({ queue: fresh });
    return fresh;
  },
  /** Tests: read storage again, with this clock. */
  reload: (now: () => number = Date.now) => {
    clock = now;
    snapshot = null;
    for (const listener of listeners) listener();
  },
};

export function useLeaderboardProfile(): Snapshot {
  return useSyncExternalStore(leaderboardStore.subscribe, leaderboardStore.get, leaderboardStore.get);
}
