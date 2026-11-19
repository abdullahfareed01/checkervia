// A small world for the room function tests: the in memory stores, a fake
// clock, fixed random bytes, players with tokens, and calls as the browser
// makes them.
import type { LeaderboardRequest } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import type { MemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken, sha256Hex } from "../../netlify/leaderboard/security";
import type { OnlineDeps, OnlineHandler } from "../../netlify/online/http";
import { createMemoryOnlineStore } from "../../netlify/online/memoryStore";
import type { MemoryOnlineStore } from "../../netlify/online/memoryStore";
import type { RoomView } from "../../src/online/protocol";

// Wednesday 18 Nov 2026, 12:00 UTC.
export const START = Date.parse("2026-11-18T12:00:00Z");

export interface World {
  store: MemoryStore;
  online: MemoryOnlineStore;
  deps: OnlineDeps;
  clock: { time: number };
  logs: string[];
  // The next random byte: 0 makes the host Black in a first game, 1 White.
  coin: { byte: number };
}

export function world(): World {
  const clock = { time: START };
  const coin = { byte: 0 };
  const store = createMemoryStore(() => clock.time);
  const online = createMemoryOnlineStore();
  const logs: string[] = [];
  let counter = 0;
  const randomBytes = (count: number) =>
    // Room codes: different bytes each time. One byte: the coin.
    count === 1 ? new Uint8Array([coin.byte]) : Uint8Array.from({ length: count }, (_, index) => (counter++ * 7 + index * 13) % 248);
  const deps: OnlineDeps = { store, online, salt: "test salt", now: () => new Date(clock.time), newToken, log: (message) => logs.push(message), randomBytes };
  return { store, online, deps, clock, logs, coin };
}

export interface TestPlayer {
  readonly id: string;
  readonly token: string;
  readonly device: string;
  readonly username: string;
  readonly ip: string;
}

let made = 0;

export async function player(w: World, username: string, options: { country?: string | null; avatar?: string | null } = {}): Promise<TestPlayer> {
  const token = newToken();
  made += 1;
  const record = await w.store.createPlayer({
    username,
    usernameKey: username.toLowerCase(),
    country: options.country === undefined ? "PK" : options.country,
    avatar: options.avatar === undefined ? "a07" : options.avatar,
    tokenHash: await sha256Hex(token),
    deviceHash: "d",
    ipHash: "i",
  });
  if (record === "taken") throw new Error("taken");
  return { id: record.id, token, device: `device-${String(made).padStart(16, "0")}`, username, ip: `198.51.100.${made % 250}` };
}

export interface Call {
  body?: unknown;
  query?: Record<string, string>;
  as?: TestPlayer | null;
  device?: string | null;
  ip?: string;
  method?: string;
}

export async function call(handler: OnlineHandler, w: World, options: Call = {}) {
  const request: LeaderboardRequest = {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    body: options.body === undefined ? "" : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    query: new URLSearchParams(options.query ?? {}),
    authorization: options.as ? `Bearer ${options.as.token}` : null,
    deviceId: options.device !== undefined ? options.device : (options.as?.device ?? "device-zzzzzzzzzzzzzzzz"),
    ip: options.ip ?? options.as?.ip ?? "203.0.113.9",
  };
  const response = await handler(request, w.deps);
  return { status: response.status, body: response.body as { room?: RoomView; code?: string; retryAfter?: number } };
}

/** Moves the fake clock on. */
export const later = (w: World, ms: number) => {
  w.clock.time += ms;
};
