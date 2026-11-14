// What this browser keeps for the leaderboard (D57), in localStorage, each
// read inside try and catch and checked field by field:
// - the device id: random, made once, sent with every request (the server
//   stores only a keyed hash of it, for rate limits);
// - the profile: the username, the flag and the secret token returned once
//   when the username was claimed. Clearing browser data loses it;
// - the last qualifying win that was not submitted, so it can be submitted
//   once later from the Menu or Settings.
import { useSyncExternalStore } from "react";
import type { AiLevel } from "../../ai/difficulty";
import { LEVELS } from "../../ai/difficulty";
import { isCountryCode } from "../../leaderboard/countries";
import { DEVICE_ID_PATTERN, GAME_ID_PATTERN, TOKEN_PATTERN } from "../../leaderboard/protocol";
import type { EncodedMove } from "../../leaderboard/protocol";
import { isValidUsername } from "../../leaderboard/username";

export const DEVICE_KEY = "checkervia.device";
export const PROFILE_KEY = "checkervia.profile";
export const PENDING_KEY = "checkervia.pendingWin";

export interface Profile {
  readonly username: string;
  readonly country: string | null;
  readonly token: string;
}

export interface PendingWin {
  readonly gameId: string;
  readonly level: AiLevel;
  readonly moves: readonly EncodedMove[];
}

interface Snapshot {
  readonly profile: Profile | null;
  readonly pending: PendingWin | null;
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
  return { username: data.username, country: isCountryCode(data.country) ? data.country : null, token: data.token };
}

function asPending(value: unknown): PendingWin | null {
  const data = value as Partial<PendingWin> | null;
  if (!data || typeof data.gameId !== "string" || !GAME_ID_PATTERN.test(data.gameId)) return null;
  if (!LEVELS.includes(data.level as AiLevel) || !Array.isArray(data.moves) || data.moves.length === 0) return null;
  return { gameId: data.gameId, level: data.level as AiLevel, moves: data.moves };
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

function current(): Snapshot {
  snapshot ??= { profile: asProfile(read(PROFILE_KEY)), pending: asPending(read(PENDING_KEY)) };
  return snapshot;
}

function change(next: Partial<Snapshot>): void {
  snapshot = { ...current(), ...next };
  if ("profile" in next) write(PROFILE_KEY, next.profile);
  if ("pending" in next) write(PENDING_KEY, next.pending);
  for (const listener of listeners) listener();
}

export const leaderboardStore = {
  get: current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setProfile: (profile: Profile | null) => change({ profile }),
  setCountry: (country: string | null) => {
    const profile = current().profile;
    if (profile) change({ profile: { ...profile, country } });
  },
  setPending: (pending: PendingWin | null) => change({ pending }),
  /** Tests: read storage again. */
  reload: () => {
    snapshot = null;
    for (const listener of listeners) listener();
  },
};

export function useLeaderboardProfile(): Snapshot {
  return useSyncExternalStore(leaderboardStore.subscribe, leaderboardStore.get, leaderboardStore.get);
}
