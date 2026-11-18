// D81: random colours on the server. A win is replayed from the start for
// the colour the player had (as White, the AI's first move comes first);
// every move of both sides must be legal, the game complete and won by that
// colour. Wins as White and as Black rank the same, every game counts once
// for the player and the AI, and a resignation counts as resigned.
import { describe, expect, it } from "vitest";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetAiStats } from "../../netlify/leaderboard/handlers/getAiStats";
import { handleGetLeaderboard } from "../../netlify/leaderboard/handlers/getLeaderboard";
import { handleGetProfile } from "../../netlify/leaderboard/handlers/getProfile";
import { handleReportGame } from "../../netlify/leaderboard/handlers/reportGame";
import { handleSubmitWin } from "../../netlify/leaderboard/handlers/submitWin";
import type { LeaderboardDeps, LeaderboardHandler, LeaderboardRequest } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import { replayWin } from "../../netlify/leaderboard/replay";
import { newToken } from "../../netlify/leaderboard/security";
import { applyMove, getLegalMoves, initialBoard } from "../../src/engine";
import { encodeMove, parseColour } from "../../src/leaderboard/protocol";
import { BLACK_WIN, WHITE_WIN } from "./fixtures";

const START = Date.parse("2026-11-18T12:00:00Z");

function world() {
  const store = createMemoryStore(() => START);
  const deps: LeaderboardDeps = { store, salt: "test salt", now: () => new Date(START), newToken, log: () => {} };
  return { store, deps };
}
type World = ReturnType<typeof world>;

let ids = 0;
const gameId = () => `00000000-0000-4000-9000-${String(++ids).padStart(12, "0")}`;

async function call(handler: LeaderboardHandler, w: World, options: { body?: unknown; query?: Record<string, string>; token?: string; device?: string } = {}) {
  const request: LeaderboardRequest = {
    method: options.body === undefined ? "GET" : "POST",
    body: options.body === undefined ? "" : JSON.stringify(options.body),
    query: new URLSearchParams(options.query ?? {}),
    authorization: options.token ? `Bearer ${options.token}` : null,
    deviceId: options.device ?? "device-cccccccccccccccc",
    ip: "203.0.113.9",
  };
  const response = await handler(request, w.deps);
  return { status: response.status, body: response.body as Record<string, unknown> };
}

async function claim(w: World, username: string, device = "device-cccccccccccccccc"): Promise<string> {
  const response = await call(handleClaimUsername, w, { body: { username, country: "none", avatar: "a07" }, device });
  expect(response.status).toBe(201);
  return response.body["token"] as string;
}

const submit = (w: World, token: string, body: Record<string, unknown>) =>
  call(handleSubmitWin, w, { token, body: { gameId: gameId(), level: 4, mode: "vs-ai", ...body } });

describe("replaying a win for either colour", () => {
  it("a White win: the replay starts with the AI's (Black's) first move and counts only White's moves", () => {
    const result = replayWin(WHITE_WIN, "white");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.moveCount).toBe(Math.floor(WHITE_WIN.length / 2));
    expect(result.stats.totalMoves).toBe(WHITE_WIN.length);
  });

  it("a Black win, as before (also with no colour given)", () => {
    const result = replayWin(BLACK_WIN, "black");
    expect(result).toMatchObject({ ok: true, moveCount: Math.ceil(BLACK_WIN.length / 2) });
    expect(replayWin(BLACK_WIN)).toEqual(result);
  });

  it("a forged colour is refused: the game must be won by the colour claimed", () => {
    expect(replayWin(BLACK_WIN, "white")).toEqual({ ok: false, reason: "notWin" });
    expect(replayWin(WHITE_WIN, "black")).toEqual({ ok: false, reason: "notWin" });
  });

  it("an illegal move by the AI (Black's first move) is refused", () => {
    // Black moving a piece from its own back row first is not legal.
    expect(replayWin([[63, 54], ...WHITE_WIN.slice(1)], "white")).toEqual({ ok: false, reason: "illegal" });
    // White can never move first.
    const whiteFirst = getLegalMoves(initialBoard(), "white")[0]!;
    expect(replayWin([encodeMove(whiteFirst), ...WHITE_WIN], "white")).toEqual({ ok: false, reason: "illegal" });
    // A legal opening, then an AI move from the wrong side later on.
    const opening = getLegalMoves(initialBoard(), "black")[0]!;
    const reply = getLegalMoves(applyMove(initialBoard(), opening), "white")[0]!;
    expect(replayWin([encodeMove(opening), encodeMove(reply), encodeMove(reply)], "white")).toEqual({ ok: false, reason: "illegal" });
  });

  it("an unfinished White game is refused", () => {
    expect(replayWin(WHITE_WIN.slice(0, -1), "white")).toEqual({ ok: false, reason: "incomplete" });
  });

  it("only Black and White are colours", () => {
    expect([parseColour("black"), parseColour("white"), parseColour("red"), parseColour(1), parseColour(null)]).toEqual(["black", "white", null, null, null]);
  });
});

describe("submitting wins as White and as Black", () => {
  it("a White win is accepted with its colour; claimed as Black it is refused", async () => {
    const w = world();
    const token = await claim(w, "White_Wins");
    expect((await submit(w, token, { colour: "white", moves: WHITE_WIN })).status).toBe(201);
    expect((await submit(w, token, { colour: "black", moves: WHITE_WIN })).body).toMatchObject({ code: "notWin" });
    expect((await submit(w, token, { moves: WHITE_WIN })).body).toMatchObject({ code: "notWin" }); // no colour: Black
  });

  it("a Black win is accepted, with or without its colour", async () => {
    const w = world();
    const token = await claim(w, "Black_Wins");
    expect((await submit(w, token, { colour: "white", moves: BLACK_WIN })).body).toMatchObject({ code: "notWin" });
    expect((await submit(w, token, { colour: "black", moves: BLACK_WIN })).status).toBe(201);
    // Older clients send no colour (and the same moves cannot count twice anywhere).
    const other = world();
    expect((await submit(other, await claim(other, "Old_Client"), { moves: BLACK_WIN })).status).toBe(201);
  });

  it("a colour that is not Black or White is refused before anything is replayed", async () => {
    const w = world();
    const token = await claim(w, "Bad_Colour");
    for (const colour of ["red", "", 1, null, ["white"]]) {
      expect((await submit(w, token, { colour, moves: WHITE_WIN })).status).toBe(400);
    }
  });

  it("the same game twice is a duplicate, for either colour", async () => {
    const w = world();
    const token = await claim(w, "Twice");
    for (const [colour, moves] of [["white", WHITE_WIN], ["black", BLACK_WIN]] as const) {
      const id = gameId();
      expect((await call(handleSubmitWin, w, { token, body: { gameId: id, level: 4, mode: "vs-ai", colour, moves } })).status).toBe(201);
      expect((await call(handleSubmitWin, w, { token, body: { gameId: id, level: 4, mode: "vs-ai", colour, moves } })).body).toMatchObject({ code: "duplicate" });
    }
  });

  it("wins as White and as Black weigh the same in the ranking: one win each, ordered by the player's own moves", async () => {
    const w = world();
    const white = await claim(w, "Plays_White", "device-dddddddddddddddd");
    const black = await claim(w, "Plays_Black", "device-eeeeeeeeeeeeeeee");
    await submit(w, white, { colour: "white", moves: WHITE_WIN });
    await submit(w, black, { colour: "black", moves: BLACK_WIN });
    const board = await call(handleGetLeaderboard, w, { query: { level: "4", period: "week" } });
    const rows = board.body["rows"] as { username: string; wins: number; bestMoves: number }[];
    const byName = Object.fromEntries(rows.map((row) => [row.username, row]));
    expect(byName["Plays_White"]).toMatchObject({ wins: 1, bestMoves: Math.floor(WHITE_WIN.length / 2) });
    expect(byName["Plays_Black"]).toMatchObject({ wins: 1, bestMoves: Math.ceil(BLACK_WIN.length / 2) });
    // Fewer own moves ranks first, whatever the colour.
    const order = [...rows].sort((a, b) => a.bestMoves - b.bestMoves).map((row) => row.username);
    expect(rows.map((row) => row.username)).toEqual(order);
  });
});

describe("every game counts once for the player and for the AI, for either colour", () => {
  it("wins, losses and resignations as White and as Black", async () => {
    const w = world();
    const token = await claim(w, "Both_Sides");
    // A White win: reported, then verified (and the retry queue sends it again).
    const whiteWin = gameId();
    await call(handleReportGame, w, { token, body: { gameId: whiteWin, level: 4, result: "win" } });
    await call(handleSubmitWin, w, { token, body: { gameId: whiteWin, level: 4, mode: "vs-ai", colour: "white", moves: WHITE_WIN } });
    await call(handleSubmitWin, w, { token, body: { gameId: whiteWin, level: 4, mode: "vs-ai", colour: "white", moves: WHITE_WIN } });
    await call(handleReportGame, w, { token, body: { gameId: whiteWin, level: 4, result: "win" } });
    // A Black win: verified first, then reported.
    const blackWin = gameId();
    await call(handleSubmitWin, w, { token, body: { gameId: blackWin, level: 3, mode: "vs-ai", colour: "black", moves: BLACK_WIN } });
    await call(handleReportGame, w, { token, body: { gameId: blackWin, level: 3, result: "win" } });
    // A loss as White, a resignation as Black, a resignation as White (each reported twice).
    for (const level of [4, 2, 1]) {
      const id = gameId();
      const body = { gameId: id, level, result: "loss", ...(level === 4 ? {} : { resigned: true }) };
      await call(handleReportGame, w, { token, body });
      await call(handleReportGame, w, { token, body });
    }

    const profile = (await call(handleGetProfile, w, { query: { username: "both_sides" } })).body;
    expect(profile).toMatchObject({ gamesPlayed: 5, wins: 2, losses: 3, resigned: 2 });
    expect(profile["byLevel"]).toEqual([
      { level: 1, wins: 0, losses: 1, resigned: 1, draws: 0 },
      { level: 2, wins: 0, losses: 1, resigned: 1, draws: 0 },
      { level: 3, wins: 1, losses: 0, resigned: 0, draws: 0 },
      { level: 4, wins: 1, losses: 1, resigned: 0, draws: 0 },
    ]);

    // The AI's record: the player's wins are its losses, the player's losses its wins.
    const ai = (await call(handleGetAiStats, w)).body;
    expect(ai).toMatchObject({ games: 5, aiWins: 3, aiLosses: 2, resigned: 2 });
    const levels = ai["levels"] as { level: number; games: number; aiWins: number; aiLosses: number; resigned: number }[];
    expect(levels).toEqual([
      { level: 1, games: 1, aiWins: 1, aiLosses: 0, resigned: 1, draws: 0 },
      { level: 2, games: 1, aiWins: 1, aiLosses: 0, resigned: 1, draws: 0 },
      { level: 3, games: 1, aiWins: 0, aiLosses: 1, resigned: 0, draws: 0 },
      { level: 4, games: 2, aiWins: 1, aiLosses: 1, resigned: 0, draws: 0 },
    ]);
  });
});
