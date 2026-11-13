// The idle timer with fake timers (30 and 60 seconds, pause and reset, at
// most two per turn) and the tab's session record (Change 4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdleTimer } from "../src/ui/idleTimer";
import { EMPTY_SESSION, SESSION_KEY, nextRound, readSession, withResult, writeSession } from "../src/ui/session";

describe("idle timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const lines: number[] = [];
    const timer = createIdleTimer((count) => lines.push(count));
    return { lines, timer };
  }

  it("speaks after 30 seconds, again after 60, and never a third time in the turn", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(29_999);
    expect(lines).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lines).toEqual([1]);
    vi.advanceTimersByTime(30_000);
    expect(lines).toEqual([1, 2]);
    vi.advanceTimersByTime(600_000);
    expect(lines).toEqual([1, 2]);
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

  it("after a reset, the second line still comes at most once", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(30_000);
    timer.update(false, 1);
    timer.update(true, 1);
    vi.advanceTimersByTime(60_000);
    expect(lines).toEqual([1, 2]);
    timer.update(false, 1);
    timer.update(true, 1);
    vi.advanceTimersByTime(600_000);
    expect(lines).toEqual([1, 2]);
  });

  it("a new turn starts the count again", () => {
    const { lines, timer } = setup();
    timer.update(true, 1);
    vi.advanceTimersByTime(60_000);
    timer.update(true, 2);
    vi.advanceTimersByTime(30_000);
    expect(lines).toEqual([1, 2, 1]);
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
