// The browser side of the leaderboard (D57): the saved profile and device id,
// the API client's results for every kind of answer, which games can count,
// and the screens' markup (labels, roles, numbers, no "reported" on screen).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMove, getLegalMoves, initialBoard } from "../../src/engine";
import type { Board, Move, Player } from "../../src/engine";
import type { LeaderboardRow, ProfileResponse } from "../../src/leaderboard/protocol";
import { createGameState } from "../../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../../src/state/gameReducer";
import { leaderboardApi, setLeaderboardTransport } from "../../src/ui/leaderboard/api";
import { Flag } from "../../src/ui/leaderboard/Flag";
import { flagUrl } from "../../src/ui/leaderboard/flags";
import { LeaderboardScreen, Row, TopRankedPlayerCard } from "../../src/ui/leaderboard/LeaderboardScreen";
import { DEVICE_KEY, PROFILE_KEY, QUEUE_KEY, leaderboardStore } from "../../src/ui/leaderboard/profile";
import { ProfileStats } from "../../src/ui/leaderboard/ProfileSheet";
import { OFFLINE_TEXT, ProblemPanel, SERVER_TEXT, problemOf, tooManyText } from "../../src/ui/leaderboard/Problem";
import { isLeaderboardGame, qualifyingWin } from "../../src/ui/leaderboard/useLeaderboardGame";
import { BLACK_WIN } from "./fixtures";

// ---------- A small localStorage for the node test environment ----------

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
  leaderboardStore.reload();
});
afterEach(() => setLeaderboardTransport(null));

const TOKEN = "A".repeat(43);
const PROFILE = { username: "Fan_One", country: "PK", avatar: "a07", token: TOKEN };

// ---------- Fake answers ----------

interface Seen {
  url: string;
  init: RequestInit;
}
function answer(status: number, body: unknown, seen: Seen[] = []) {
  setLeaderboardTransport(async (input, init) => {
    seen.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return seen;
}

describe("what the browser keeps", () => {
  it("makes one device id and keeps it", () => {
    answer(200, {});
    void leaderboardApi.leaderboard(4, "week", 0);
    const first = storage.get(DEVICE_KEY);
    void leaderboardApi.leaderboard(4, "week", 0);
    expect(first).toMatch(/^"[0-9a-f-]{36}"$/);
    expect(storage.get(DEVICE_KEY)).toBe(first);
  });

  it("ignores a broken or tampered profile and win queue", () => {
    storage.set(PROFILE_KEY, JSON.stringify({ username: "admin", country: "PK", token: TOKEN }));
    storage.set(QUEUE_KEY, "{not json");
    leaderboardStore.reload();
    expect(leaderboardStore.get()).toEqual({ profile: null, queue: [] });

    // An unknown flag or avatar is dropped (a profile from before avatars has none).
    storage.set(PROFILE_KEY, JSON.stringify({ username: "Fan_One", country: "XX", avatar: "m01", token: TOKEN }));
    storage.set(QUEUE_KEY, JSON.stringify([{ gameId: "nope", level: 4, moves: [[40, 33]], queuedAt: Date.now() }]));
    leaderboardStore.reload();
    expect(leaderboardStore.get()).toEqual({ profile: { username: "Fan_One", country: null, avatar: null, token: TOKEN }, queue: [] });
  });

  it("survives storage that throws (private mode)", () => {
    Object.assign(globalThis, {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {},
      },
    });
    leaderboardStore.reload();
    expect(leaderboardStore.get().profile).toBeNull();
    expect(() => leaderboardStore.setProfile(PROFILE)).not.toThrow();
    expect(leaderboardStore.get().profile).toEqual(PROFILE);
  });
});

describe("the API client", () => {
  it("sends the device id always and the token once there is a profile", async () => {
    const seen = answer(200, { rows: [] });
    await leaderboardApi.leaderboard(3, "month", 2);
    leaderboardStore.setProfile(PROFILE);
    await leaderboardApi.leaderboard(3, "month", 2);
    expect(seen[0]!.url).toBe("/.netlify/functions/get-leaderboard?level=3&period=month&page=2");
    const [anonymous, signedIn] = seen.map((call) => new Headers(call.init.headers));
    expect(anonymous!.get("x-checkervia-device")).toMatch(/^[0-9a-f-]{36}$/);
    expect(anonymous!.get("authorization")).toBeNull();
    expect(signedIn!.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  // D59: offline only when the device is offline or no answer came back at all.
  it("calls it offline when the browser says so, without sending anything", async () => {
    const seen = answer(200, {});
    const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
    try {
      expect(await leaderboardApi.leaderboard(4, "week", 0)).toEqual({ kind: "offline" });
      expect(seen).toEqual([]);
    } finally {
      if (real) Object.defineProperty(globalThis, "navigator", real);
    }
  });

  it("calls a network failure offline", async () => {
    setLeaderboardTransport(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "offline" });
  });

  it("calls a 503, any other 5xx and an unreadable answer a server error, not offline", async () => {
    answer(503, { error: "x", code: "unavailable" });
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "serverError", status: 503 });
    answer(500, {});
    expect(await leaderboardApi.leaderboard(4, "week", 0)).toEqual({ kind: "serverError", status: 500 });
    setLeaderboardTransport(async () => new Response("<html>Bad gateway</html>", { status: 200 }));
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "serverError", status: 200 });
  });

  it("calls no answer in time a server error", async () => {
    vi.useFakeTimers();
    try {
      setLeaderboardTransport((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
      const pending = leaderboardApi.leaderboard(4, "week", 0);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(await pending).toEqual({ kind: "serverError", status: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes on the code, the username problems and the seconds to wait", async () => {
    answer(422, { error: "x", code: "username", problems: ["startLetter"] });
    expect(await leaderboardApi.claimUsername("1abc", "none", "a01")).toEqual({ kind: "failed", status: 422, code: "username", problems: ["startLetter"] });
    answer(429, { error: "x", code: "rateLimited", retryAfter: 42 });
    expect(await leaderboardApi.submitWin("g", 4, BLACK_WIN)).toEqual({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 42 });
  });

  it("sends the chosen flag and avatar, and saves the profile and its token after a claim", async () => {
    const seen = answer(201, PROFILE);
    await leaderboardApi.claimUsername("Fan_One", "PK", "a07");
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ username: "Fan_One", country: "PK", avatar: "a07" });
    expect(leaderboardStore.get().profile).toEqual(PROFILE);
    expect(JSON.parse(storage.get(PROFILE_KEY)!)).toEqual(PROFILE);
  });

  it("saves a renamed username, a new flag or a new avatar after a change, keeping the token", async () => {
    leaderboardStore.setProfile(PROFILE);
    const seen = answer(200, { username: "Fan_Two", country: null, avatar: "a33", nextRenameAt: "2026-11-21T12:00:00.000Z" });
    await leaderboardApi.updateProfile({ username: "Fan_Two", country: "none", avatar: "a33" });
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ username: "Fan_Two", country: "none", avatar: "a33" });
    expect(leaderboardStore.get().profile).toEqual({ username: "Fan_Two", country: null, avatar: "a33", token: TOKEN });
    answer(409, { error: "x", code: "renameTooSoon", nextRenameAt: "2026-11-21T12:00:00.000Z" });
    expect(await leaderboardApi.updateProfile({ username: "Fan_Three" })).toEqual({ kind: "failed", status: 409, code: "renameTooSoon", nextRenameAt: "2026-11-21T12:00:00.000Z" });
    expect(leaderboardStore.get().profile?.username).toBe("Fan_Two");
  });

  it("forgets a profile the server no longer knows", async () => {
    leaderboardStore.setProfile(PROFILE);
    answer(401, { error: "x", code: "noProfile" });
    await leaderboardApi.reportGame("g", 4, "loss");
    expect(leaderboardStore.get().profile).toBeNull();
  });

  it("sends a win with its moves and vs-ai, nothing else", async () => {
    const seen = answer(201, { moveCount: 27, weekRank: 3 });
    await leaderboardApi.submitWin("00000000-0000-4000-8000-000000000001", 4, BLACK_WIN);
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ gameId: "00000000-0000-4000-8000-000000000001", level: 4, mode: "vs-ai", moves: BLACK_WIN });
    expect(seen[0]!.init.method).toBe("POST");
  });
});

// ---------- Which games can count ----------

// A finished game state from real moves (only the fields the rules read).
function finishedGame(moves: readonly (readonly number[])[], options: { mode?: "vs-ai" | "two-player"; start?: Board; resignedBy?: Player | null; winner?: Player } = {}): GameState {
  const base = createGameState({ mode: options.mode ?? "vs-ai", aiLevel: 4, ...(options.start ? { board: options.start } : {}) });
  let board = base.board;
  let player: Player = "black";
  const history: HistoryEntry[] = [{ board, move: null, player: null }];
  for (const encoded of moves) {
    const move = getLegalMoves(board, player).find((legal) => legal.from.row * 8 + legal.from.col === encoded[0] && legal.path.length === encoded.length - 1) as Move;
    board = applyMove(board, move);
    history.push({ board, move, player });
    player = player === "black" ? "white" : "black";
  }
  return { ...base, board, history, winner: options.winner ?? "black", resignedBy: options.resignedBy ?? null };
}

describe("which games can count", () => {
  const gameId = "00000000-0000-4000-8000-000000000009";

  it("a win against the AI from the start is a qualifying win, with every move encoded", () => {
    const state = finishedGame(BLACK_WIN);
    expect(isLeaderboardGame(state)).toBe(true);
    expect(qualifyingWin(state, gameId)).toEqual({ gameId, level: 4, moves: BLACK_WIN });
  });

  it("an AI win, a resignation and a two player game never count", () => {
    expect(qualifyingWin(finishedGame(BLACK_WIN, { winner: "white" }), gameId)).toBeNull();
    expect(qualifyingWin(finishedGame(BLACK_WIN, { resignedBy: "white" }), gameId)).toBeNull();
    expect(qualifyingWin(finishedGame(BLACK_WIN, { mode: "two-player" }), gameId)).toBeNull();
  });

  it("a game that did not start from the normal position never counts", () => {
    const start = initialBoard().map((row, index) => (index === 0 ? row.map(() => null) : row));
    const state = { ...finishedGame([]), history: [{ board: start, move: null, player: null }] };
    expect(isLeaderboardGame(state)).toBe(false);
  });
});

// ---------- Markup ----------

const noop = () => {};
const row = (rank: number, extra: Partial<LeaderboardRow> = {}): LeaderboardRow => ({ rank, username: `Player${rank}`, country: "GB", avatar: "a05", wins: 12, bestMoves: 20, ...extra });

describe("the screens' markup", () => {
  it("opens on Strongest and This week, with tabs, a period group and the loading rows", () => {
    answer(200, {});
    const html = renderToStaticMarkup(createElement(LeaderboardScreen, { onClose: noop }));
    expect(html).toMatch(/role="tablist" aria-label="Level"/);
    expect([...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)".*?<span class="lb-tab-name">([A-Za-z]+)</g)].map((m) => [m[2], m[1]])).toEqual([
      ["Strongest", "true"], ["Hard", "false"], ["Medium", "false"], ["Easy", "false"],
    ]);
    expect(html).toMatch(/<legend class="sr-only">Period<\/legend>/);
    expect(html).toMatch(/checked="" value="week"/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading the leaderboard.");
    expect(html).toContain('aria-label="Close the leaderboard"');
  });

  it("a row is one button with everything read out, and the player's own row says so", () => {
    const html = renderToStaticMarkup(createElement(Row, { row: row(7, { username: "Fan_One", country: "PK", wins: 1 }), mine: true, onOpen: noop }));
    expect(html).toMatch(/^<button type="button" class="lb-row lb-mine" aria-label="Rank 7, Fan_One, you, Pakistan, 1 win\. Open profile\.">/);
    expect(html).toContain('<span class="lb-you">You</span>');
    expect(html).toContain('src="/avatars/a05.svg"');
  });

  it("a player from before avatars gets the neutral person", () => {
    const html = renderToStaticMarkup(createElement(Row, { row: row(9, { avatar: null }), mine: false, onOpen: noop }));
    expect(html).toContain("avatar-person");
    expect(html).not.toContain("/avatars/");
  });

  it("the top ranked player card says so, under the crown, with the wins as a big number", () => {
    const html = renderToStaticMarkup(createElement(TopRankedPlayerCard, { row: row(1, { wins: 31 }), mine: false, onOpen: noop }));
    expect(html).toContain('class="lb-place lb-place-1 top-ranked-player-card"');
    expect(html).toContain('aria-label="Top ranked player. Rank 1, Player1, United Kingdom, 31 wins. Open profile."');
    expect(html).toContain('<span class="lb-big-number lb-num">31</span><span class="lb-wins-label">wins</span>');
    expect(html).toContain("lb-place-crown");
    expect(html).toContain('<span class="lb-place-label" aria-hidden="true">Top ranked player</span>');
  });

  it("the profile shows the stats cards and wins by level, Strongest first", () => {
    const profile: ProfileResponse = {
      username: "Fan_One", country: "PK", avatar: "a07", gamesPlayed: 8, wins: 5, losses: 3, winRate: 0.625,
      byLevel: [1, 2, 3, 4].map((level) => ({ level: level as 1, wins: level, losses: 1 })),
      bestWin: { moves: 21, level: 4 }, weeklyStrongestRank: 2,
    };
    const html = renderToStaticMarkup(createElement(ProfileStats, { profile }));
    expect(html).toContain('<dt>Win rate</dt><dd class="lb-stat-number">63%</dd>');
    expect(html).toContain('<caption class="sr-only">Wins and losses by level</caption>');
    expect([...html.matchAll(/<th scope="row">.*?<\/span>(\w+)<\/th>/g)].map((m) => m[1])).toEqual(["Strongest", "Hard", "Medium", "Easy"]);
    expect(html).toContain('<span class="lb-stat-number">21</span> moves on Strongest');
  });

  it("never calls the counters reported on screen (the Terms do)", () => {
    leaderboardStore.setProfile(PROFILE);
    const screens = [
      renderToStaticMarkup(createElement(LeaderboardScreen, { onClose: noop })),
      renderToStaticMarkup(createElement(ProfileStats, { profile: { username: "A", country: null, avatar: null, gamesPlayed: 1, wins: 0, losses: 1, winRate: 0, byLevel: [], bestWin: null, weeklyStrongestRank: null } })),
    ];
    for (const html of screens) expect(html).not.toMatch(/reported/i);
  });

  it("a flag is an image with the country's name, and a missing one a neutral shape", () => {
    expect(flagUrl("PK")).toMatch(/pk\.svg/);
    expect(flagUrl(null)).toBeNull();
    expect(flagUrl("ZZ")).toBeNull();
    expect(renderToStaticMarkup(createElement(Flag, { code: "PK" }))).toMatch(/<img class="lb-flag" src="[^"]*pk\.svg[^"]*" alt="Pakistan"/);
    expect(renderToStaticMarkup(createElement(Flag, { code: null }))).toBe('<span class="lb-flag lb-flag-none" role="img" aria-label="No flag"></span>');
    expect(renderToStaticMarkup(createElement(Flag, { code: "PK", decorative: true }))).toContain('alt=""');
  });
});

// ---------- Offline, a server problem, too many requests (D59) ----------

describe("the three problems", () => {
  it("each failed result has its own problem", () => {
    expect(problemOf({ kind: "offline" })).toEqual({ kind: "offline" });
    expect(problemOf({ kind: "serverError", status: 503 })).toEqual({ kind: "server" });
    expect(problemOf({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 42 })).toEqual({ kind: "limited", retryAfter: 42 });
    expect(problemOf({ kind: "failed", status: 429, code: "rateLimited" })).toEqual({ kind: "limited", retryAfter: null });
    expect(problemOf({ kind: "failed", status: 400, code: "invalid" })).toEqual({ kind: "server" });
  });

  it("says how long to wait after too many requests", () => {
    expect(tooManyText(42)).toBe("Too many requests. Try again in 42 seconds.");
    expect(tooManyText(1)).toBe("Too many requests. Try again in 1 second.");
    expect(tooManyText(119)).toBe("Too many requests. Try again in 119 seconds.");
    expect(tooManyText(3600)).toBe("Too many requests. Try again in 60 minutes.");
    expect(tooManyText(null)).toBe("Too many requests. Try again in a moment.");
  });

  it.each([
    ["offline", { kind: "offline" } as const, OFFLINE_TEXT, "M4 4l16 16"],
    ["a server problem", { kind: "server" } as const, SERVER_TEXT, '<circle cx="12" cy="12" r="9"'],
    ["too many requests", { kind: "limited", retryAfter: 42 } as const, "Too many requests. Try again in 42 seconds.", "icon-hourglass"],
  ])("the panel for %s: its words, its icon and Try again", (_label, problem, text, icon) => {
    const html = renderToStaticMarkup(createElement(ProblemPanel, { problem, onRetry: noop }));
    expect(html).toContain('role="status"');
    expect(html).toContain(`<p class="lb-state-text">${text}</p>`);
    expect(html).toContain(icon);
    expect(html).toContain(">Try again</button>");
  });

  it("the server problem never says offline, and offline never blames the server", () => {
    expect(SERVER_TEXT).toBe("The leaderboard is having a problem. Please try again in a moment.");
    expect(SERVER_TEXT).not.toMatch(/offline/i);
    expect(OFFLINE_TEXT).toBe("You are offline. The leaderboard is not available right now.");
  });
});
