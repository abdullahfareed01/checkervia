// The browser side of the leaderboard (D57): the saved profile and device id,
// the API client's results for every kind of answer, which games can count,
// and the screens' markup (labels, roles, numbers, no "reported" on screen).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMove, getLegalMoves, initialBoard } from "../../src/engine";
import type { Board, Move, Player } from "../../src/engine";
import type { LeaderboardRow, ProfileResponse } from "../../src/leaderboard/protocol";
import { createGameState } from "../../src/state/gameReducer";
import type { GameState, HistoryEntry } from "../../src/state/gameReducer";
import { leaderboardApi, setLeaderboardTransport } from "../../src/ui/leaderboard/api";
import { Flag } from "../../src/ui/leaderboard/Flag";
import { flagUrl } from "../../src/ui/leaderboard/flags";
import { LeaderboardScreen, PodiumPlace, Row } from "../../src/ui/leaderboard/LeaderboardScreen";
import { DEVICE_KEY, PENDING_KEY, PROFILE_KEY, leaderboardStore } from "../../src/ui/leaderboard/profile";
import { ProfileStats } from "../../src/ui/leaderboard/ProfileSheet";
import { SubmitWin } from "../../src/ui/leaderboard/SubmitWin";
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
const PROFILE = { username: "Fan_One", country: "PK", token: TOKEN };

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

  it("ignores a broken or tampered profile and pending win", () => {
    storage.set(PROFILE_KEY, JSON.stringify({ username: "admin", country: "PK", token: TOKEN }));
    storage.set(PENDING_KEY, "{not json");
    leaderboardStore.reload();
    expect(leaderboardStore.get()).toEqual({ profile: null, pending: null });

    storage.set(PROFILE_KEY, JSON.stringify({ username: "Fan_One", country: "XX", token: TOKEN }));
    storage.set(PENDING_KEY, JSON.stringify({ gameId: "nope", level: 4, moves: [[40, 33]] }));
    leaderboardStore.reload();
    expect(leaderboardStore.get()).toEqual({ profile: { username: "Fan_One", country: null, token: TOKEN }, pending: null });
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

  it("calls a network failure, a 503 and any 5xx offline", async () => {
    setLeaderboardTransport(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "offline" });
    answer(503, { error: "x", code: "unavailable" });
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "offline" });
    answer(502, {});
    expect(await leaderboardApi.profile("Fan")).toEqual({ kind: "offline" });
  });

  it("passes on the code, the username problems and the seconds to wait", async () => {
    answer(422, { error: "x", code: "username", problems: ["startLetter"] });
    expect(await leaderboardApi.claimUsername("1abc", null)).toEqual({ kind: "failed", status: 422, code: "username", problems: ["startLetter"] });
    answer(429, { error: "x", code: "rateLimited", retryAfter: 42 });
    expect(await leaderboardApi.submitWin("g", 4, BLACK_WIN)).toEqual({ kind: "failed", status: 429, code: "rateLimited", retryAfter: 42 });
  });

  it("saves the profile and its token after a claim, and the flag after a change", async () => {
    answer(201, PROFILE);
    await leaderboardApi.claimUsername("Fan_One", "auto");
    expect(leaderboardStore.get().profile).toEqual(PROFILE);
    expect(JSON.parse(storage.get(PROFILE_KEY)!)).toEqual(PROFILE);
    answer(200, { username: "Fan_One", country: null });
    await leaderboardApi.updateCountry(null);
    expect(leaderboardStore.get().profile).toEqual({ ...PROFILE, country: null });
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
const row = (rank: number, extra: Partial<LeaderboardRow> = {}): LeaderboardRow => ({ rank, username: `Player${rank}`, country: "GB", wins: 12, bestMoves: 20, ...extra });

describe("the screens' markup", () => {
  it("opens on Strongest and This week, with tabs, a period group and the loading rows", () => {
    answer(200, {});
    const html = renderToStaticMarkup(createElement(LeaderboardScreen, { onClose: noop }));
    expect(html).toMatch(/role="tablist" aria-label="Level"/);
    expect([...html.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>([A-Za-z]+)</g)].map((m) => [m[2], m[1]])).toEqual([
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
  });

  it("the champion's place says so, with the crown and the wins as a big number", () => {
    const html = renderToStaticMarkup(createElement(PodiumPlace, { row: row(1, { wins: 31 }), champion: "Champion this week", mine: false, onOpen: noop }));
    expect(html).toContain('aria-label="Champion this week. Rank 1, Player1, United Kingdom, 31 wins. Open profile."');
    expect(html).toContain('<span class="lb-big-number">31</span><span class="lb-wins-label">wins</span>');
    expect(html).toContain("icon-crown");
  });

  it("the profile shows the stats cards and wins by level, Strongest first", () => {
    const profile: ProfileResponse = {
      username: "Fan_One", country: "PK", gamesPlayed: 8, wins: 5, losses: 3, winRate: 0.625,
      byLevel: [1, 2, 3, 4].map((level) => ({ level: level as 1, wins: level, losses: 1 })),
      bestWin: { moves: 21, level: 4 }, weeklyStrongestRank: 2,
    };
    const html = renderToStaticMarkup(createElement(ProfileStats, { profile }));
    expect(html).toContain('<dt>Win rate</dt><dd class="lb-card-number">63%</dd>');
    expect(html).toContain("<caption>Wins and losses by level</caption>");
    expect([...html.matchAll(/<th scope="row">(\w+)<\/th>/g)].map((m) => m[1])).toEqual(["Strongest", "Hard", "Medium", "Easy"]);
    expect(html).toContain('<span class="lb-card-number">21</span> moves on Strongest');
  });

  it("a first win asks for a username and a flag, with the rules and a live region", () => {
    const html = renderToStaticMarkup(createElement(SubmitWin, { win: { gameId: "g", level: 4, moves: BLACK_WIN }, placement: "result", onTerms: noop }));
    expect(html).toMatch(/<label for="[^"]+" class="lb-field-label">Username<\/label><input id="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+-help"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Clearing your browser data loses it.");
    expect(html).toContain(">Automatic</option><option value=\"\">No flag</option>");
    expect(html).toMatch(/<button type="submit" class="button button-primary" disabled="" aria-busy="false">Save<\/button>/);
    expect(html).toContain(">Read the Terms and notices<");
  });

  it("a later win needs one tap", () => {
    leaderboardStore.setProfile(PROFILE);
    const html = renderToStaticMarkup(createElement(SubmitWin, { win: { gameId: "g", level: 3, moves: BLACK_WIN }, placement: "result", onTerms: noop }));
    expect(html).toContain('<span class="lb-name">Fan_One</span><span class="lb-submit-level">Hard</span>');
    expect(html).toContain(">Add win<");
  });

  it("never calls the counters reported on screen (the Terms do)", () => {
    leaderboardStore.setProfile(PROFILE);
    const screens = [
      renderToStaticMarkup(createElement(LeaderboardScreen, { onClose: noop })),
      renderToStaticMarkup(createElement(SubmitWin, { win: { gameId: "g", level: 4, moves: BLACK_WIN }, placement: "sheet", onTerms: noop })),
      renderToStaticMarkup(createElement(ProfileStats, { profile: { username: "A", country: null, gamesPlayed: 1, wins: 0, losses: 1, winRate: 0, byLevel: [], bestWin: null, weeklyStrongestRank: null } })),
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
