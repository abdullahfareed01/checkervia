// The leaderboard functions' handlers, with the in memory store and a fake
// clock: claims, the token, replayed wins, reports, the ranking, profiles,
// moderation, rate limits and what is never returned or logged.
import { describe, expect, it } from "vitest";
import { handleCheckUsername } from "../../netlify/leaderboard/handlers/checkUsername";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetLeaderboard } from "../../netlify/leaderboard/handlers/getLeaderboard";
import { handleGetProfile } from "../../netlify/leaderboard/handlers/getProfile";
import { LIMITS } from "../../netlify/leaderboard/handlers/limits";
import { handleReportGame } from "../../netlify/leaderboard/handlers/reportGame";
import { handleSubmitWin } from "../../netlify/leaderboard/handlers/submitWin";
import { handleUpdateProfile } from "../../netlify/leaderboard/handlers/updateProfile";
import type { LeaderboardDeps, LeaderboardHandler, LeaderboardRequest } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import type { MemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken, sha256Hex } from "../../netlify/leaderboard/security";
import { BLACK_WIN, WHITE_WIN, wonGame } from "./fixtures";

// Wednesday 18 Nov 2026, 12:00 UTC.
const START = Date.parse("2026-11-18T12:00:00Z");

interface World {
  store: MemoryStore;
  deps: LeaderboardDeps;
  logs: string[];
  clock: { time: number };
}

function world(): World {
  const clock = { time: START };
  const store = createMemoryStore(() => clock.time);
  const logs: string[] = [];
  const deps: LeaderboardDeps = { store, salt: "test salt", now: () => new Date(clock.time), newToken, log: (message) => logs.push(message) };
  return { store, deps, logs, clock };
}

let ids = 0;
const gameId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

interface Call {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  token?: string | null;
  device?: string | null;
  ip?: string;
  country?: string; // claim(): the flag the player chose ("none" by default)
}

async function call(handler: LeaderboardHandler, w: World, options: Call = {}) {
  const request: LeaderboardRequest = {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    body: options.body === undefined ? "" : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    query: new URLSearchParams(options.query ?? {}),
    authorization: options.token ? `Bearer ${options.token}` : null,
    deviceId: options.device === undefined ? "device-aaaaaaaaaaaaaaaa" : options.device,
    ip: options.ip ?? "203.0.113.7",
  };
  const response = await handler(request, w.deps);
  return { status: response.status, body: response.body as Record<string, unknown> };
}

async function claim(w: World, username: string, extra: Call = {}): Promise<string> {
  const response = await call(handleClaimUsername, w, { body: { username, country: extra.country ?? "none", avatar: "a07" }, ...extra });
  expect(response.status).toBe(201);
  return response.body["token"] as string;
}

const submit = (w: World, token: string, moves: unknown = BLACK_WIN, extra: Record<string, unknown> = {}, options: Call = {}) =>
  call(handleSubmitWin, w, { token, body: { gameId: gameId(), level: 4, mode: "vs-ai", moves, ...extra }, ...options });

const board = (w: World, query: Record<string, string> = {}, token?: string) =>
  call(handleGetLeaderboard, w, { query: { level: "4", period: "week", ...query }, token: token ?? null });

describe("claiming a username", () => {
  it("returns the token once and stores only its hash, the device and IP only hashed", async () => {
    const w = world();
    const response = await call(handleClaimUsername, w, { body: { username: "Checkers_Fan", country: "PK", avatar: "a07" } });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ username: "Checkers_Fan", country: "PK", avatar: "a07", token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });

    const stored = w.store.players[0]!;
    const token = response.body["token"] as string;
    expect(stored.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7");
    expect(JSON.stringify(stored)).not.toContain("device-aaaaaaaaaaaaaaaa");
  });

  it("never returns a token a second time: the name is taken, whatever the case", async () => {
    const w = world();
    await claim(w, "Checkers_Fan");
    for (const username of ["Checkers_Fan", "checkers_fan", "CHECKERS_FAN"]) {
      const again = await call(handleClaimUsername, w, { body: { username, country: "none", avatar: "a01" } });
      expect(again.status).toBe(409);
      expect(again.body).not.toHaveProperty("token");
    }
  });

  it("no other function ever returns a token", async () => {
    const w = world();
    const token = await claim(w, "Fan");
    const responses = [
      await call(handleCheckUsername, w, { query: { username: "Fan" } }),
      await submit(w, token),
      await call(handleReportGame, w, { token, body: { gameId: gameId(), level: 4, result: "loss" } }),
      await board(w, {}, token),
      await call(handleGetProfile, w, { query: { username: "Fan" } }),
      await call(handleUpdateProfile, w, { token, body: { country: "GB" } }),
    ];
    for (const response of responses) expect(JSON.stringify(response.body)).not.toContain(token);
  });

  it("repeats every username rule on the server", async () => {
    const w = world();
    // One device each: a device may only try 5 claims an hour.
    for (const [index, username] of ["ab", "1abc", "bad name", "fuuuck", "admin", "x__y", "trail_"].entries()) {
      const response = await call(handleClaimUsername, w, { body: { username, country: "none", avatar: "a01" }, device: `device-${String(index).padStart(16, "0")}` });
      expect(response.status).toBe(422);
      expect(response.body["problems"]).not.toEqual([]);
    }
    expect(w.store.players).toEqual([]);
  });

  it("the flag is only ever the player's choice: a country or none, never a guess (D61)", async () => {
    const w = world();
    const chosen = await call(handleClaimUsername, w, { body: { username: "Chosen", country: "JP", avatar: "a01" } });
    const none = await call(handleClaimUsername, w, { body: { username: "Nobody", country: "none", avatar: "a01" } });
    expect([chosen, none].map((response) => response.body["country"])).toEqual(["JP", null]);
    // No automatic country and no missing one: the old "auto" and null are refused.
    for (const country of ["auto", null, undefined, "", "pk"]) {
      const body = { username: "Guess", avatar: "a01", ...(country === undefined ? {} : { country }) };
      expect((await call(handleClaimUsername, w, { body })).status).toBe(400);
    }
    expect(w.store.players.map((player) => player.username)).toEqual(["Chosen", "Nobody"]);
  });

  it("an avatar from the allowed list is required and stored; nothing else about it is", async () => {
    const w = world();
    for (const avatar of [undefined, null, "a00", "a41", "men-1", "A01", 7]) {
      const body = { username: "Pic", country: "none", ...(avatar === undefined ? {} : { avatar }) };
      expect((await call(handleClaimUsername, w, { body })).status).toBe(400);
    }
    const response = await call(handleClaimUsername, w, { body: { username: "Pic", country: "none", avatar: "a40" } });
    expect(response.body["avatar"]).toBe("a40");
    expect(Object.keys(w.store.players[0]!).sort()).toEqual(
      ["avatar", "country", "deviceHash", "hidden", "id", "ipHash", "tokenHash", "username", "usernameChangedAt", "usernameKey"].sort(),
    );
  });

  it("refuses bodies that are too big, have extra keys, bad countries or no device id", async () => {
    const w = world();
    const bad = [
      await call(handleClaimUsername, w, { body: { username: "x".repeat(300), country: "none", avatar: "a01" } }),
      await call(handleClaimUsername, w, { body: { username: "Extra", country: null, admin: true } }),
      await call(handleClaimUsername, w, { body: { username: "Flag", country: "XX", avatar: "a01" } }),
      await call(handleClaimUsername, w, { body: "not json" }),
      await call(handleClaimUsername, w, { body: { username: "Device", country: "none", avatar: "a01" }, device: null }),
      await call(handleClaimUsername, w, { body: { username: "Device", country: "none", avatar: "a01" }, device: "short" }),
      await call(handleClaimUsername, w, { method: "GET" }),
    ];
    expect(bad.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 400, 405]);
  });
});

describe("checking a username", () => {
  it("says which rules fail, and whether a valid name is free", async () => {
    const w = world();
    await claim(w, "Taken_Name");
    expect((await call(handleCheckUsername, w, { query: { username: "taken_name" } })).body).toEqual({ available: false, problems: [] });
    expect((await call(handleCheckUsername, w, { query: { username: "Free_Name" } })).body).toEqual({ available: true, problems: [] });
    expect((await call(handleCheckUsername, w, { query: { username: "1x" } })).body).toEqual({ available: false, problems: ["length", "startLetter"] });
  });

  it("is rate limited per device", async () => {
    const w = world();
    const statuses: number[] = [];
    for (let index = 0; index <= LIMITS.checkUsername.perDevice; index += 1) {
      statuses.push((await call(handleCheckUsername, w, { query: { username: `Name${index}` } })).status);
    }
    expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("submitting a win", () => {
  it("replays the game and records a real win", async () => {
    const w = world();
    const token = await claim(w, "Winner");
    const response = await submit(w, token);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ moveCount: Math.ceil(BLACK_WIN.length / 2), weekRank: 1 });
  });

  it.each([
    ["the AI won", WHITE_WIN, "notWin"],
    ["the game is not finished", BLACK_WIN.slice(0, -1), "incomplete"],
    ["a move is illegal", BLACK_WIN.map((move, index) => (index === 4 ? [move[0]!, 0] : move)), "illegal"],
    ["the moves cannot be read", [["a", "b"]], "malformed"],
  ])("rejects a faked win where %s", async (_label, moves, code) => {
    const w = world();
    const token = await claim(w, "Cheater");
    const response = await submit(w, token, moves);
    expect(response.status).toBe(422);
    expect(response.body["code"]).toBe(code);
    expect((await board(w)).body["rows"]).toEqual([]);
  });

  it("rejects two player games", async () => {
    const w = world();
    const token = await claim(w, "Friends");
    const response = await submit(w, token, BLACK_WIN, { mode: "two-player" });
    expect(response.status).toBe(422);
    expect(response.body["code"]).toBe("notAi");
  });

  it("rejects the same game id twice, and the same moves under a new game id", async () => {
    const w = world();
    const token = await claim(w, "Twice");
    const id = gameId();
    expect((await call(handleSubmitWin, w, { token, body: { gameId: id, level: 4, mode: "vs-ai", moves: BLACK_WIN } })).status).toBe(201);
    expect((await call(handleSubmitWin, w, { token, body: { gameId: id, level: 4, mode: "vs-ai", moves: BLACK_WIN } })).status).toBe(409);
    expect((await submit(w, token)).status).toBe(409);
    expect((await board(w)).body["rows"]).toMatchObject([{ username: "Twice", wins: 1 }]);
  });

  it("needs a valid token", async () => {
    const w = world();
    expect((await submit(w, "")).status).toBe(401);
    expect((await submit(w, newToken())).status).toBe(401);
    expect((await submit(w, "not a token")).status).toBe(401);
  });

  it("refuses bad game ids and levels", async () => {
    const w = world();
    const token = await claim(w, "Shape");
    expect((await submit(w, token, BLACK_WIN, { gameId: "1" })).status).toBe(400);
    expect((await submit(w, token, BLACK_WIN, { level: 5 })).status).toBe(400);
    expect((await submit(w, token, BLACK_WIN, { level: "4" })).status).toBe(400);
  });
});

describe("the ranking", () => {
  it("ranks by wins, then fewest moves, then who got there first", async () => {
    const w = world();
    const early = await claim(w, "Early");
    const late = await claim(w, "Late");
    expect((await submit(w, early, BLACK_WIN)).status).toBe(201);
    w.clock.time += 60_000;
    expect((await submit(w, late, BLACK_WIN)).status).toBe(201);
    const rows = (await board(w)).body["rows"] as { username: string; rank: number }[];
    expect(rows.map((row) => [row.rank, row.username])).toEqual([[1, "Early"], [2, "Late"]]);
  });

  it("the week, the month and all time count different wins", async () => {
    const w = world();
    const token = await claim(w, "Seasons");
    w.clock.time = Date.parse("2026-10-30T12:00:00Z"); // last month
    expect((await submit(w, token)).status).toBe(201);
    w.clock.time = START;
    const counts = async (period: string) => ((await board(w, { period })).body["rows"] as unknown[]).length;
    expect([await counts("week"), await counts("month"), await counts("all")]).toEqual([0, 0, 1]);

    // A win on Monday 00:00 UTC is in the new week; Sunday 23:59 is not.
    const sunday = await claim(w, "Sunday");
    w.clock.time = Date.parse("2026-11-15T23:59:59Z");
    expect((await submit(w, sunday)).status).toBe(201);
    w.clock.time = Date.parse("2026-11-16T00:00:00Z");
    const monday = await claim(w, "Monday");
    expect((await submit(w, monday)).status).toBe(201);
    w.clock.time = START;
    const week = (await board(w)).body["rows"] as { username: string }[];
    expect(week.map((row) => row.username)).toEqual(["Monday"]);
    expect((await board(w, { period: "month" })).body["rows"]).toHaveLength(2);
  });

  it("each level has its own ranking", async () => {
    const w = world();
    const token = await claim(w, "Medium_Only");
    expect((await submit(w, token, BLACK_WIN, { level: 2 })).status).toBe(201);
    expect((await board(w, { level: "4" })).body["rows"]).toEqual([]);
    expect((await board(w, { level: "2" })).body["rows"]).toMatchObject([{ username: "Medium_Only" }]);
  });

  it("hidden players and hidden wins are left out", async () => {
    const w = world();
    const shown = await claim(w, "Shown");
    const hidden = await claim(w, "Hidden");
    const hiddenWin = gameId();
    const shownWin = gameId();
    await call(handleSubmitWin, w, { token: shown, body: { gameId: shownWin, level: 4, mode: "vs-ai", moves: BLACK_WIN } });
    await call(handleSubmitWin, w, { token: hidden, body: { gameId: hiddenWin, level: 4, mode: "vs-ai", moves: BLACK_WIN } });
    expect((await board(w)).body["total"]).toBe(2);

    w.store.hidePlayer(w.store.players[1]!.id);
    expect((await board(w)).body["rows"]).toMatchObject([{ rank: 1, username: "Shown" }]);
    expect((await board(w)).body["total"]).toBe(1);
    expect((await call(handleGetProfile, w, { query: { username: "Hidden" } })).status).toBe(404);
    // A hidden player's token no longer works, and the name stays taken.
    expect((await submit(w, hidden)).status).toBe(401);
    expect((await call(handleCheckUsername, w, { query: { username: "hidden" } })).body["available"]).toBe(false);

    w.store.hideWin(shownWin);
    expect((await board(w)).body["rows"]).toEqual([]);
  });

  it("pages, the total and the caller's own row", async () => {
    const w = world();
    const tokens: string[] = [];
    for (let index = 0; index < 23; index += 1) {
      tokens.push(await claim(w, `Player${index}`, { device: `device-${String(index).padStart(16, "0")}`, ip: `198.51.100.${index}` }));
      w.clock.time += 1000;
      expect((await submit(w, tokens[index]!, BLACK_WIN, {}, { device: `device-${String(index).padStart(16, "0")}`, ip: `198.51.100.${index}` })).status).toBe(201);
    }
    const first = await board(w, {}, tokens[22]);
    expect(first.body["total"]).toBe(23);
    expect(first.body["rows"]).toHaveLength(20);
    expect(first.body["me"]).toMatchObject({ rank: 23, username: "Player22" });
    const second = await board(w, { page: "1" });
    expect((second.body["rows"] as { rank: number }[]).map((row) => row.rank)).toEqual([21, 22, 23]);
    expect(second.body["me"]).toBeNull();
    // No player ids leave the server.
    expect(JSON.stringify(first.body)).not.toContain("player-");
  });

  it("says when the week and month reset, and refuses bad queries", async () => {
    const w = world();
    expect((await board(w)).body["resetsAt"]).toBe("2026-11-23T00:00:00.000Z");
    expect((await board(w, { period: "month" })).body["resetsAt"]).toBe("2026-12-01T00:00:00.000Z");
    expect((await board(w, { period: "all" })).body["resetsAt"]).toBeNull();
    const bad: Record<string, string>[] = [{ level: "5" }, { period: "year" }, { page: "-1" }, { page: "1.5" }, { page: "50" }];
    for (const query of bad) {
      expect((await board(w, query)).status).toBe(400);
    }
  });
});

describe("reports and the profile", () => {
  it("counts reported games and losses, and verified wins by level", async () => {
    const w = world();
    const token = await claim(w, "Stats", { country: "GB" });
    await call(handleReportGame, w, { token, body: { gameId: gameId(), level: 4, result: "loss" } });
    await call(handleReportGame, w, { token, body: { gameId: gameId(), level: 1, result: "loss" } });
    // A win reported first and then verified counts as one game.
    const id = gameId();
    await call(handleReportGame, w, { token, body: { gameId: id, level: 4, result: "win" } });
    await call(handleSubmitWin, w, { token, body: { gameId: id, level: 4, mode: "vs-ai", moves: BLACK_WIN } });
    // A reported win that was never verified counts as a game, not a win.
    await call(handleReportGame, w, { token, body: { gameId: gameId(), level: 2, result: "win" } });

    const profile = await call(handleGetProfile, w, { query: { username: "STATS" } });
    expect(profile.status).toBe(200);
    expect(profile.body).toEqual({
      username: "Stats",
      country: "GB",
      avatar: "a07",
      gamesPlayed: 4,
      wins: 1,
      losses: 2,
      winRate: 0.25,
      byLevel: [
        { level: 1, wins: 0, losses: 1 },
        { level: 2, wins: 0, losses: 0 },
        { level: 3, wins: 0, losses: 0 },
        { level: 4, wins: 1, losses: 1 },
      ],
      bestWin: { moves: Math.ceil(BLACK_WIN.length / 2), level: 4 },
      weeklyStrongestRank: 1,
    });
  });

  it("a game is reported once", async () => {
    const w = world();
    const token = await claim(w, "Once");
    const id = gameId();
    expect((await call(handleReportGame, w, { token, body: { gameId: id, level: 4, result: "loss" } })).body).toEqual({ recorded: true });
    expect((await call(handleReportGame, w, { token, body: { gameId: id, level: 4, result: "loss" } })).body).toEqual({ recorded: false });
  });

  it("a new profile has no win rate yet", async () => {
    const w = world();
    await claim(w, "Fresh");
    expect((await call(handleGetProfile, w, { query: { username: "fresh" } })).body).toMatchObject({ gamesPlayed: 0, winRate: null, bestWin: null, weeklyStrongestRank: null });
  });

  it("the flag and the avatar can be changed any time with the token", async () => {
    const w = world();
    const token = await claim(w, "Flags", { country: "PK" });
    const own = { username: "Flags", nextRenameAt: null };
    expect((await call(handleUpdateProfile, w, { token, body: { country: "CA" } })).body).toEqual({ ...own, country: "CA", avatar: "a07" });
    expect((await call(handleUpdateProfile, w, { token, body: { country: "none" } })).body).toEqual({ ...own, country: null, avatar: "a07" });
    expect((await call(handleUpdateProfile, w, { token, body: { avatar: "a33" } })).body).toEqual({ ...own, country: null, avatar: "a33" });
    expect((await call(handleUpdateProfile, w, { token, body: { avatar: "a12", country: "GB" } })).body).toEqual({ ...own, country: "GB", avatar: "a12" });
    expect((await call(handleGetProfile, w, { query: { username: "flags" } })).body).toMatchObject({ country: "GB", avatar: "a12" });
    expect((await call(handleUpdateProfile, w, { body: { country: "CA" } })).status).toBe(401);
    for (const body of [{ country: "Canada" }, { country: "auto" }, { country: null }, { avatar: "a99" }, {}, { colour: "red" }]) {
      expect((await call(handleUpdateProfile, w, { token, body })).status).toBe(400);
    }
  });
});

describe("changing the username (D61)", () => {
  const DAY = 86_400_000;
  const rename = (w: World, token: string, username: string, device = "device-aaaaaaaaaaaaaaaa") =>
    call(handleUpdateProfile, w, { token, device, body: { username } });

  it("renames once every 7 days, keeping the wins, and says when the next change is allowed", async () => {
    const w = world();
    const token = await claim(w, "First_Name");
    await submit(w, token);
    const renamed = await rename(w, token, "Second_Name");
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ username: "Second_Name", nextRenameAt: new Date(START + 7 * DAY).toISOString() });
    // Wins and stats belong to the player, so they follow the new name.
    expect((await board(w)).body["rows"]).toMatchObject([{ rank: 1, username: "Second_Name", wins: 1 }]);
    expect((await call(handleGetProfile, w, { query: { username: "second_name" } })).body).toMatchObject({ wins: 1 });

    w.clock.time += 6 * DAY;
    const tooSoon = await rename(w, token, "Third_Name");
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body).toMatchObject({ code: "renameTooSoon", nextRenameAt: new Date(START + 7 * DAY).toISOString() });
    // The own profile says so too; nobody else's does.
    expect((await call(handleGetProfile, w, { token, query: { username: "Second_Name" } })).body["nextRenameAt"]).toBe(new Date(START + 7 * DAY).toISOString());
    expect((await call(handleGetProfile, w, { query: { username: "Second_Name" } })).body).not.toHaveProperty("nextRenameAt");

    w.clock.time += DAY;
    expect((await rename(w, token, "Third_Name")).status).toBe(200);
  });

  it("the old name stays reserved for its player for 30 days: nobody else can claim or take it", async () => {
    const w = world();
    const owner = await claim(w, "Famous");
    const other = await claim(w, "Someone", { device: "device-bbbbbbbbbbbbbbbb" });
    await rename(w, owner, "Renamed");

    expect((await call(handleCheckUsername, w, { query: { username: "famous" } })).body).toEqual({ available: false, problems: [] });
    expect((await call(handleCheckUsername, w, { token: owner, query: { username: "famous" } })).body).toEqual({ available: true, problems: [] });
    expect((await call(handleClaimUsername, w, { device: "device-cccccccccccccccc", body: { username: "FAMOUS", country: "none", avatar: "a01" } })).status).toBe(409);
    expect((await rename(w, other, "Famous", "device-bbbbbbbbbbbbbbbb")).status).toBe(409);
    expect((await rename(w, other, "renamed", "device-bbbbbbbbbbbbbbbb")).body["code"]).toBe("taken");

    w.clock.time += 30 * DAY + 1;
    expect((await call(handleCheckUsername, w, { query: { username: "famous" } })).body).toEqual({ available: true, problems: [] });
    expect((await call(handleClaimUsername, w, { device: "device-dddddddddddddddd", body: { username: "Famous", country: "none", avatar: "a01" } })).status).toBe(201);
  });

  it("its owner may take the old name back after the wait", async () => {
    const w = world();
    const token = await claim(w, "Boomerang");
    await rename(w, token, "Away");
    w.clock.time += 7 * DAY;
    expect((await rename(w, token, "boomerang")).body).toMatchObject({ username: "boomerang" });
  });

  it("repeats every username rule, and the same name is no change at all", async () => {
    const w = world();
    const token = await claim(w, "Steady");
    for (const [index, username] of ["ab", "1abc", "bad name", "admin"].entries()) {
      const response = await rename(w, token, username, `device-${String(index).padStart(16, "0")}`);
      expect(response.status).toBe(422);
      expect(response.body["problems"]).not.toEqual([]);
    }
    const same = await rename(w, token, "Steady", "device-eeeeeeeeeeeeeeee");
    expect(same.body).toMatchObject({ username: "Steady", nextRenameAt: null });
    expect(w.store.players[0]!.usernameChangedAt).toBeNull();
  });

  it("is rate limited per device on top of the 7 days", async () => {
    const w = world();
    const token = await claim(w, "Tries");
    const statuses: number[] = [];
    for (let index = 0; index <= LIMITS.renameUsername.perDevice; index += 1) statuses.push((await rename(w, token, `Tries_${index}`)).status);
    expect(statuses[0]).toBe(200);
    expect(statuses.slice(1, -1).every((status) => status === 409)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("rate limits", () => {
  it("per device: 429 with the seconds left, then allowed again in the next window", async () => {
    const w = world();
    const token = await claim(w, "Busy");
    const report = (device = "device-aaaaaaaaaaaaaaaa", ip = "203.0.113.7") =>
      call(handleReportGame, w, { token, device, ip, body: { gameId: gameId(), level: 4, result: "loss" } });
    for (let index = 0; index < LIMITS.reportGame.perDevice; index += 1) expect((await report()).status).toBe(200);
    const refused = await report();
    expect(refused.status).toBe(429);
    // 12:00 is the start of an hour window, so the whole hour is left.
    expect(refused.body["retryAfter"]).toBe(3600);
    // Another device on another network is not affected.
    expect((await report("device-bbbbbbbbbbbbbbbb", "192.0.2.1")).status).toBe(200);
    w.clock.time += 3600_000;
    expect((await report()).status).toBe(200);
  });

  it("per IP address, across devices", async () => {
    const w = world();
    const statuses: number[] = [];
    for (let index = 0; index <= LIMITS.claimUsername.perIp; index += 1) {
      const response = await call(handleClaimUsername, w, { body: { username: `Shared${index}`, country: "none", avatar: "a01" }, device: `device-${String(index).padStart(16, "0")}` });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, -1).every((status) => status === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("reads are limited per IP", async () => {
    const w = world();
    let last = 0;
    for (let index = 0; index <= LIMITS.getLeaderboard.perIp; index += 1) last = (await board(w)).status;
    expect(last).toBe(429);
  });
});

describe("failures and logs", () => {
  it("a storage failure gives a calm 503 and logs only the error code", async () => {
    const w = world();
    const token = await claim(w, "Logged");
    const broken: LeaderboardDeps = {
      ...w.deps,
      store: {
        ...w.store,
        rankedPage: async () => {
          throw Object.assign(new Error(`duplicate key (token_hash)=(${token})`), { code: "XX000" });
        },
      },
    };
    const response = await handleGetLeaderboard(
      { method: "GET", body: "", query: new URLSearchParams(), authorization: `Bearer ${token}`, deviceId: null, ip: "203.0.113.7" },
      broken,
    );
    expect(response).toEqual({ status: 503, body: { error: "The leaderboard is not available right now.", code: "unavailable" } });
    expect(w.logs).toEqual(["leaderboard getLeaderboard: storage error XX000"]);
    expect(w.logs.join(" ")).not.toContain(token);
  });

  it("the fixtures are real games of different lengths", () => {
    expect(wonGame("black")).toEqual(BLACK_WIN);
    expect(BLACK_WIN.length).toBeGreaterThan(10);
    expect(WHITE_WIN.length).toBeGreaterThan(10);
  });
});
