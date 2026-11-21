// Turn aware polling (D152): during a game the browser asks often while the
// opponent is to move and rarely on its own turn, keeps every other
// interval, stays far inside the 12 seconds after which a player counts as
// gone, and asks no more often per game hour than once a second did.
import { describe, expect, it } from "vitest";
import { AWAY_AFTER_MS } from "../../src/online/protocol";
import type { RoomView } from "../../src/online/protocol";
import { HIDDEN_POLL_MS, MY_TURN_CYCLE_MS, MY_TURN_POLL_MS, pollDelay, POLL_MS, THEIR_TURN_CYCLE_MS, THEIR_TURN_POLL_MS, turnOf } from "../../src/ui/online/roomSync";
import { roomView } from "./views";

const playing = (toMove: "black" | "white", extra: Partial<NonNullable<RoomView["match"]>> = {}): RoomView => {
  const base = roomView({ status: "playing" });
  return { ...base, you: { ...base.you, colour: "black" }, match: { ...base.match!, startsInMs: 0, winner: null, toMove, ...extra } };
};

describe("whose turn the game waits for", () => {
  it("is mine when my colour is to move, theirs otherwise", () => {
    expect(turnOf(playing("black"))).toBe("mine");
    expect(turnOf(playing("white"))).toBe("theirs");
  });

  it("is nobody's outside a game that is on: countdown, won, waiting, finished, closed", () => {
    expect(turnOf(playing("black", { startsInMs: 1200 }))).toBeNull();
    expect(turnOf(playing("white", { winner: "black" }))).toBeNull();
    for (const status of ["waiting", "ready", "finished", "closed", "expired"] as const) expect(turnOf({ ...playing("white"), status })).toBeNull();
    expect(turnOf({ ...playing("white"), match: null })).toBeNull();
    expect(turnOf({ ...playing("white"), you: { ...playing("white").you, colour: null } })).toBeNull();
  });
});

describe("how often the browser asks (D152)", () => {
  it("every 550 ms while the opponent is to move, every 3.5 s on my own turn", () => {
    expect(THEIR_TURN_POLL_MS).toBe(550);
    expect(MY_TURN_POLL_MS).toBe(3500);
    expect(pollDelay("playing", false, turnOf(playing("white")))).toBe(THEIR_TURN_POLL_MS);
    expect(pollDelay("playing", false, turnOf(playing("black")))).toBe(MY_TURN_POLL_MS);
  });

  it("keeps the other intervals: countdown 1 s, waiting and after the game 2 s, hidden 5 s, never once closed", () => {
    expect(pollDelay("playing", false)).toBe(POLL_MS.playing);
    expect(pollDelay("ready", false, null)).toBe(1000);
    expect(pollDelay("waiting", false, null)).toBe(2000);
    expect(pollDelay("finished", false, null)).toBe(2000);
    expect(pollDelay("closed", false, null)).toBeNull();
    expect(pollDelay("expired", false, null)).toBeNull();
    expect(pollDelay("playing", true, "theirs")).toBe(HIDDEN_POLL_MS);
    expect(pollDelay("playing", true, "mine")).toBe(HIDDEN_POLL_MS);
  });

  it("with faster answers the waits grow, so a question starts no more often than once a cycle (D152 follow up)", () => {
    expect(pollDelay("playing", false, "theirs", 600)).toBe(THEIR_TURN_CYCLE_MS - 600);
    expect(pollDelay("playing", false, "mine", 600)).toBe(MY_TURN_CYCLE_MS - 600);
    expect(pollDelay("playing", false, "theirs", 50)).toBe(THEIR_TURN_CYCLE_MS - 50);
    // Slower answers: the plain waits, never less.
    expect(pollDelay("playing", false, "theirs", 1000)).toBe(THEIR_TURN_POLL_MS);
    expect(pollDelay("playing", false, "mine", 2500)).toBe(MY_TURN_POLL_MS);
    // Not known yet: the plain waits.
    expect(pollDelay("playing", false, "theirs", null)).toBe(THEIR_TURN_POLL_MS);
    // Outside a game and while hidden, the answer time changes nothing.
    expect(pollDelay("ready", false, null, 100)).toBe(1000);
    expect(pollDelay("waiting", false, null, 100)).toBe(2000);
    expect(pollDelay("playing", true, "theirs", 100)).toBe(HIDDEN_POLL_MS);
  });

  it("stays far inside the away limit on my own turn, even if one answer is lost", () => {
    expect(2 * MY_TURN_POLL_MS).toBeLessThan(AWAY_AFTER_MS);
    expect(HIDDEN_POLL_MS * 2).toBeLessThan(AWAY_AFTER_MS);
  });

  // Each player's turns take half the game, and the next question is set
  // when the answer comes (useRoom), so the rate is the mean of
  // 1 / (interval + time for an answer) over both turns.
  const perHour = (intervals: number[], answerMs: number) => (intervals.reduce((sum, ms) => sum + 1 / (ms + answerMs), 0) / intervals.length) * 3_600_000 * 2;
  const before = (answerMs: number) => perHour([1000, 1000], answerMs);
  const after = (answerMs: number) => perHour([pollDelay("playing", false, "mine", answerMs)!, pollDelay("playing", false, "theirs", answerMs)!], answerMs);

  it("asks no more often per game hour than before, at the answer times measured on 21 Nov 2026", () => {
    // Answer times seen by the player with today's regions (latency harness):
    // 1000 ms with three database rounds, 792 ms with two (D151).
    expect(Math.round(before(1000))).toBe(3600);
    expect(after(792)).toBeLessThanOrEqual(before(1000));
  });

  it("and never more often than before, however fast the answers get (migration 10, D153)", () => {
    for (let answerMs = 20; answerMs <= 3000; answerMs += 20) expect(after(answerMs)).toBeLessThanOrEqual(before(1000));
    // About 3,500 a game hour for any answer up to 0.8 s.
    expect(Math.round(after(100))).toBe(Math.round(after(600)));
    expect(after(600)).toBeLessThan(3510);
  });

  it("and no more often than once a second would with the same answer time", () => {
    for (let answerMs = 20; answerMs <= 2000; answerMs += 20) expect(after(answerMs)).toBeLessThan(before(answerMs));
  });
});
