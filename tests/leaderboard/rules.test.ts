// The pure parts of the leaderboard: the replay of a claimed win, the UTC
// periods and the ranking order.
import { describe, expect, it } from "vitest";
import { periodEnd, periodStart, resetsInText } from "../../src/leaderboard/periods";
import { rankPlayers } from "../../src/leaderboard/ranking";
import { replayWin } from "../../netlify/leaderboard/replay";
import { BLACK_WIN, WHITE_WIN } from "./fixtures";

describe("replaying a claimed win", () => {
  it("accepts a complete win by the player and counts only the player's moves", () => {
    const result = replayWin(BLACK_WIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moveCount).toBe(Math.ceil(BLACK_WIN.length / 2));
    expect(result.stats.totalMoves).toBe(BLACK_WIN.length);
    // The player took all 12 of White's pieces, or left White with no move.
    expect(result.stats.captured).toBeGreaterThan(0);
  });

  it("refuses a game the AI won", () => {
    expect(replayWin(WHITE_WIN)).toEqual({ ok: false, reason: "notWin" });
  });

  it("refuses a game that is not finished", () => {
    expect(replayWin(BLACK_WIN.slice(0, -1))).toEqual({ ok: false, reason: "incomplete" });
    expect(replayWin(BLACK_WIN.slice(0, 10))).toEqual({ ok: false, reason: "incomplete" });
  });

  it("refuses a move after the game is over", () => {
    expect(replayWin([...BLACK_WIN, [40, 33]])).toEqual({ ok: false, reason: "illegal" });
  });

  it("refuses an illegal move anywhere in the game", () => {
    const faked = BLACK_WIN.map((move, index) => (index === 6 ? [move[0]!, move[0]!] : move));
    expect(replayWin(faked)).toEqual({ ok: false, reason: "illegal" });
  });

  it("refuses a faked short win: moves that skip the rules", () => {
    // Black's first move, then a jump that is not there.
    expect(replayWin([BLACK_WIN[0]!, [17, 26], [40, 22]])).toEqual({ ok: false, reason: "illegal" });
  });

  it("refuses White moving first (the player is Black and moves first)", () => {
    expect(replayWin(BLACK_WIN.slice(1))).toEqual({ ok: false, reason: "illegal" });
  });

  it("refuses a capture sent without its last landing", () => {
    const capture = BLACK_WIN.findIndex((move, index) => index % 2 === 0 && move.length > 2);
    const cut = BLACK_WIN.map((move, index) => (index === capture ? move.slice(0, -1) : move));
    if (capture >= 0 && BLACK_WIN[capture]!.length > 2) expect(replayWin(cut)).toMatchObject({ ok: false, reason: "illegal" });
  });

  it.each([
    ["not a list", "moves"],
    ["empty", []],
    ["a square off the board", [[40, 64]]],
    ["a fraction", [[40.5, 33]]],
    ["a move of one square", [[40]]],
    ["too many moves", Array.from({ length: 601 }, () => [40, 33])],
  ])("refuses a malformed game: %s", (_label, moves) => {
    expect(replayWin(moves)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("periods in UTC", () => {
  // 2026 Nov 16 is a Monday.
  it("a week starts on Monday at 00:00 UTC", () => {
    expect(periodStart("week", new Date("2026-11-18T15:00:00Z"))?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-11-16T00:00:00Z"))?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodEnd("week", new Date("2026-11-18T15:00:00Z"))?.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("Sunday late at night still belongs to the week that began on Monday", () => {
    expect(periodStart("week", new Date("2026-11-22T23:59:59.999Z"))?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("week", new Date("2026-11-23T00:00:00Z"))?.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("a week can span two months and two years", () => {
    expect(periodStart("week", new Date("2027-01-01T12:00:00Z"))?.toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });

  it("a month starts on its first day at 00:00 UTC and ends at the next", () => {
    expect(periodStart("month", new Date("2026-11-30T23:59:59Z"))?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(periodStart("month", new Date("2026-12-01T00:00:00Z"))?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(periodEnd("month", new Date("2026-12-15T00:00:00Z"))?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(periodEnd("month", new Date("2028-02-10T00:00:00Z"))?.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("all time has no start and no end", () => {
    expect(periodStart("all", new Date())).toBeNull();
    expect(periodEnd("all", new Date())).toBeNull();
  });

  it("writes the time left with its two largest units", () => {
    const end = new Date("2026-11-23T00:00:00Z");
    expect(resetsInText(end, new Date("2026-11-20T19:00:00Z"))).toBe("Resets in 2d 5h");
    expect(resetsInText(end, new Date("2026-11-22T18:48:00Z"))).toBe("Resets in 5h 12m");
    expect(resetsInText(end, new Date("2026-11-22T23:48:00Z"))).toBe("Resets in 12m");
    expect(resetsInText(end, new Date("2026-11-22T23:59:59Z"))).toBe("Resets in 1m");
  });
});

describe("ranking", () => {
  const win = (playerId: string, moveCount: number, createdAt: number) => ({ playerId, moveCount, createdAt });

  it("most wins first", () => {
    const ranked = rankPlayers([win("a", 30, 1), win("b", 40, 2), win("b", 40, 3)]);
    expect(ranked.map((row) => [row.rank, row.playerId, row.wins])).toEqual([[1, "b", 2], [2, "a", 1]]);
  });

  it("on equal wins, fewest moves in the best win", () => {
    const ranked = rankPlayers([win("a", 30, 1), win("a", 25, 2), win("b", 40, 3), win("b", 22, 4)]);
    expect(ranked.map((row) => [row.playerId, row.bestMoves])).toEqual([["b", 22], ["a", 25]]);
  });

  it("then whoever reached that number of wins first", () => {
    // Both have 2 wins with a best of 20; a's second win came later.
    const ranked = rankPlayers([win("a", 20, 1), win("b", 20, 2), win("b", 30, 3), win("a", 30, 5)]);
    expect(ranked.map((row) => row.playerId)).toEqual(["b", "a"]);
    expect(ranked[0]!.reachedAt).toBe(3);
  });

  it("a full tie is broken by the id, so the order never changes", () => {
    const ranked = rankPlayers([win("z", 20, 1), win("m", 20, 1)]);
    expect(ranked.map((row) => row.playerId)).toEqual(["m", "z"]);
  });
});
