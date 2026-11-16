// Development only (never in a production build, checked by the build test):
// ?lb=<state> answers the leaderboard calls in the browser with the real
// handlers from netlify/leaderboard on the in memory store, filled with made
// up players, so every screen state can be seen without a database.
//   ?lb=populated  45 players, this device's profile ranked about 31st
//   ?lb=long       the same with 16 character names
//   ?lb=few        two players only
//   ?lb=empty      no wins at all
//   ?lb=offline    every request fails on the network
//   ?lb=error      every request gets a 503 (a server problem)
//   ?lb=limited    every request gets a 429 with 42 seconds to wait
//   ?lb=slow       requests never finish (the loading state)
//   ?lb=new        45 players, no profile on this device
//   ?lb=renamed    like populated, with a username changed today (the
//                  rename limit shows on the Profile screen)
// Seeded players get avatars, except every seventh (players from before
// avatars, shown with the neutral person).
import { handleCheckUsername } from "../../../netlify/leaderboard/handlers/checkUsername";
import { handleClaimUsername } from "../../../netlify/leaderboard/handlers/claimUsername";
import { handleGetLeaderboard } from "../../../netlify/leaderboard/handlers/getLeaderboard";
import { handleGetAiStats } from "../../../netlify/leaderboard/handlers/getAiStats";
import { handleGetProfile } from "../../../netlify/leaderboard/handlers/getProfile";
import { handleReportGame } from "../../../netlify/leaderboard/handlers/reportGame";
import { handleSubmitWin } from "../../../netlify/leaderboard/handlers/submitWin";
import { handleUpdateProfile } from "../../../netlify/leaderboard/handlers/updateProfile";
import type { LeaderboardHandler } from "../../../netlify/leaderboard/http";
import { createMemoryStore } from "../../../netlify/leaderboard/memoryStore";
import { newToken, sha256Hex } from "../../../netlify/leaderboard/security";
import type { AiLevel } from "../../ai/difficulty";
import { AVATAR_IDS } from "../../leaderboard/avatars";
import { NAME_RESERVED_DAYS, RENAME_WAIT_DAYS } from "../../leaderboard/protocol";
import { DEVICE_HEADER } from "../../leaderboard/protocol";
import { setLeaderboardTransport } from "./api";
import { leaderboardStore, randomId } from "./profile";

const HANDLERS: Record<string, LeaderboardHandler> = {
  "check-username": handleCheckUsername,
  "claim-username": handleClaimUsername,
  "submit-win": handleSubmitWin,
  "report-game": handleReportGame,
  "get-leaderboard": handleGetLeaderboard,
  "get-profile": handleGetProfile,
  "get-ai-stats": handleGetAiStats,
  "update-profile": handleUpdateProfile,
};

const NAMES = [
  "KingMeKate", "Ozzie", "MoveMaster", "Zara_K", "DoubleJump", "Priya", "Lukas88", "Checkmate_No", "Amaru", "TheBishop",
  "Noor", "Femi_Plays", "Sakura", "Ivan_T", "Mateo", "BlackRook", "Aisha", "JumpQueen", "Kenji", "Lola",
  "Hamza_10", "Olu", "Sven", "Maya", "Diego_R", "Yusuf", "Elif", "Tariq", "Nadia", "Rafael",
  "Ingrid", "Kofi", "Mei", "Arjun", "Chloe", "Bilal", "Sofia", "Tomas", "Leila", "Omar",
  "Hana", "Pablo", "Zainab", "Erik",
];
const LONG_NAMES = ["Grandmaster_Wolf", "WWWmWWWmWWWmWWWm", "TheQuietStrategy", "Abdullah_Checker", "MidnightCrowned1"];
const COUNTRIES = ["PK", "GB", "US", "DE", "NG", "IN", "JP", "BR", "TR", "FR", null, "EG", "CA", "SE", "MX", "KE", "ES", "AE", "RS", "BO"];

export async function startDevLeaderboard(mode: string): Promise<void> {
  if (mode === "offline") {
    setLeaderboardTransport(() => Promise.reject(new TypeError("Failed to fetch")));
    return;
  }
  if (mode === "error" || mode === "limited") {
    const status = mode === "error" ? 503 : 429;
    const body = mode === "error" ? { error: "The leaderboard is not available right now.", code: "unavailable" } : { error: "Too many requests.", code: "rateLimited", retryAfter: 42 };
    setLeaderboardTransport(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    return;
  }
  if (mode === "slow") {
    setLeaderboardTransport(() => new Promise<Response>(() => {}));
    return;
  }

  let time = Date.now();
  const store = createMemoryStore(() => time);
  const deps = { store, salt: "dev salt", now: () => new Date(time), newToken, log: (message: string) => console.info(message) };
  const week = 3 * 86_400_000;

  let seeded = 0;
  async function seed(username: string, country: string | null, wins: number, level: AiLevel, token = newToken(), own = false) {
    seeded += 1;
    const avatar = own ? "a12" : seeded % 7 === 0 ? null : AVATAR_IDS[(seeded * 7) % AVATAR_IDS.length]!;
    const player = await store.createPlayer({ username, usernameKey: username.toLowerCase(), country, avatar, tokenHash: await sha256Hex(token), deviceHash: "dev", ipHash: "dev" });
    if (player === "taken") return;
    for (let index = 0; index < wins; index += 1) {
      time = Date.now() - week + index * 3_600_000 + username.length * 60_000;
      await store.addWin({ playerId: player.id, gameId: randomId(), level, moves: [[40, 33]], movesHash: randomId(), moveCount: 18 + ((username.length * 7 + index * 5) % 40), stats: { totalMoves: 1, captured: 0, kingsMade: 0, bestChain: 0 } });
      await store.saveGameResult({ playerId: player.id, gameId: randomId(), level, result: "win" }, true);
    }
    for (let index = 0; index < (username.length % 4) + 1; index += 1) {
      await store.saveGameResult({ playerId: player.id, gameId: randomId(), level, result: "loss" }, false);
    }
  }

  if (mode !== "empty") {
    const names = mode === "few" ? NAMES.slice(0, 2) : mode === "long" ? [...LONG_NAMES, ...NAMES.slice(5)] : NAMES;
    for (const [index, name] of names.entries()) {
      const wins = Math.max(1, 24 - Math.floor(index * 0.55));
      await seed(name, COUNTRIES[index % COUNTRIES.length]!, wins, 4);
      if (index % 3 === 0) await seed(`${name.slice(0, 12)}_h`, COUNTRIES[(index + 3) % COUNTRIES.length]!, Math.max(1, 9 - index / 5), 3);
    }
    // Three players tied on wins and best moves, to show the tie break.
    if (mode !== "few") {
      for (const name of ["Tie_Alpha", "Tie_Bravo", "Tie_Charlie"]) await seed(name, "NZ", 5, 2);
    }
  }
  time = Date.now();

  if (mode !== "new" && mode !== "empty" && mode !== "few") {
    const token = newToken();
    const username = mode === "long" ? "YourVeryLongName" : "You_Player";
    await seed(username, "PK", 8, 4, token, true);
    time = Date.now();
    const own = (await store.playerByKey(username.toLowerCase()))!;
    if (mode === "renamed") await store.renamePlayer(own.id, "You_Renamed", "you_renamed", RENAME_WAIT_DAYS, NAME_RESERVED_DAYS);
    const shown = (await store.playerByKey(mode === "renamed" ? "you_renamed" : username.toLowerCase()))!;
    leaderboardStore.setProfile({ username: shown.username, country: "PK", avatar: shown.avatar, token });
  } else if (mode === "new") {
    leaderboardStore.setProfile(null);
  }
  time = Date.now();

  setLeaderboardTransport(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    const handler = HANDLERS[url.pathname.split("/").pop() ?? ""];
    if (!handler) return new Response("{}", { status: 404 });
    const headers = new Headers(init?.headers);
    time = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 250)); // a little network time
    const result = await handler(
      {
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
        query: url.searchParams,
        authorization: headers.get("authorization"),
        deviceId: headers.get(DEVICE_HEADER),
        ip: "127.0.0.1",
      },
      deps,
    );
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  });
}
