// The idle timer with fake timers (a first line after 30 seconds, then one
// every 5 seconds while idle, D82; pause and reset) and the tab's session
// record (Change 4).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdleTimer } from "../src/ui/idleTimer";
import { idleContext } from "../src/ui/usePersonality";
import { EMPTY_SESSION, SESSION_KEY, nextRound, readSession, withResult, writeSession } from "../src/ui/session";

describe("idle timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const lines: number[] = [];
    const timer = createIdleTimer((count) => lines.push(count));
    return { lines, timer };
  }

  it("speaks after 30 seconds, then every 5 seconds until the player moves (D82)", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(29_999);
    expect(lines).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lines).toEqual([1]);
    vi.advanceTimersByTime(4_999);
    expect(lines).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(lines).toEqual([1, 2]);
    vi.advanceTimersByTime(5_000 * 8);
    expect(lines).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("re-renders with the same turn do not restart the clock", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(20_000);
    timer.update(true, 1);
    vi.advanceTimersByTime(10_000);
    expect(lines).toEqual([1]);
  });

  it("pauses and resets while inactive (page hidden, a sheet open, reviewing, game over)", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(25_000);
    timer.update(false, 1);
    vi.advanceTimersByTime(120_000);
    expect(lines).toEqual([]);
    timer.update(true, 1);
    vi.advanceTimersByTime(29_000);
    expect(lines).toEqual([]);
    vi.advanceTimersByTime(1_000);
    expect(lines).toEqual([1]);
  });

  it("after a reset, the count goes on in the same turn and the next line waits its full delay", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(30_000);
    timer.update(false, 1);
    timer.update(true, 1);
    vi.advanceTimersByTime(4_000);
    expect(lines).toEqual([1]);
    vi.advanceTimersByTime(1_000);
    expect(lines).toEqual([1, 2]);
  });

  it("a new turn starts the count again", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(40_000); // lines at 30, 35 and 40 seconds
    timer.update(true, 2);
    vi.advanceTimersByTime(30_000);
    expect(lines).toEqual([1, 2, 3, 1]);
  });

  it("stop clears everything", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    timer.stop();
    vi.advanceTimersByTime(600_000);
    expect(lines).toEqual([]);
  });
});

describe("session record (this tab only)", () => {
  const fakeStore = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
  };

  it("counts wins and losses and remembers the last result", () => {
    const afterLoss = withResult(EMPTY_SESSION, false);
    expect(afterLoss).toMatchObject({ wins: 0, losses: 1, last: "lost" });
    expect(nextRound(afterLoss)).toBe(2);
    expect(withResult(afterLoss, true)).toMatchObject({ wins: 1, losses: 1, last: "won" });
  });

  it("round trips through storage and holds no personal data", () => {
    const store = fakeStore();
    writeSession({ ...withResult(EMPTY_SESSION, true), recent: { idle: ["Tick tock, tick tock, hehe."] } }, store);
    expect(readSession(store)).toEqual({ wins: 1, losses: 0, last: "won", recent: { idle: ["Tick tock, tick tock, hehe."] } });
    expect(Object.keys(JSON.parse(store.data.get(SESSION_KEY)!)).sort()).toEqual(["last", "losses", "recent", "wins"]);
  });

  it("starts empty when storage is missing or holds rubbish", () => {
    expect(readSession(null)).toEqual(EMPTY_SESSION);
    const store = fakeStore();
    store.setItem(SESSION_KEY, "{not json");
    expect(readSession(store)).toEqual(EMPTY_SESSION);
    store.setItem(SESSION_KEY, '{"wins": -3, "losses": "x", "last": "maybe"}');
    expect(readSession(store)).toEqual(EMPTY_SESSION);
  });
});

// D73 regression: tapping the board (picking up a piece) used to clear the
// newest idle line, so the bubble showed the older line again. An idle line
// now belongs to its turn only: nothing clears it when the board is touched.
describe("an idle line stays until the move is played (D73)", () => {
  const source = readFileSync(new URL("../src/ui/usePersonality.ts", import.meta.url), "utf8");

  it("is not cleared when the player picks up a piece or a sheet opens", () => {
    expect(source).not.toMatch(/if \(!idleAllowed\) setIdle\(null\)/);
  });

  it("is dropped only when its turn is over", () => {
    expect(source).toMatch(/idle: idle && idle\.turn === turn \? idle : null/);
  });

  it("escalates: someone there?, then angry from the third line, then warnings from the sixth (D82)", () => {
    expect(source).toMatch(/text: sayRef\.current\(idleContext\(count\)\)/);
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(idleContext)).toEqual(["idle", "idle", "idleAngry", "idleAngry", "idleAngry", "idleWarn", "idleWarn", "idleWarn"]);
  });

  it("tapping or picking up a piece does not stop the idle lines; only a move does; the resign pressure still waits (D82)", () => {
    const app = readFileSync(new URL("../src/ui/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/usePersonality\(state, playerTurn && !covered, startedMove\)/);
    expect(source).toMatch(/const idleActive = ai && idleAllowed && pageVisible && !hintActive;/);
    expect(source).toMatch(/const pressureActive = ai && hintActive && idleAllowed && !busy && pageVisible;/);
  });
});
