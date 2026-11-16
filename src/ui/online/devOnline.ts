// Development only (never in a production build, checked by the build
// test): ?online=<state> runs the real room functions in this browser on
// the in memory stores, with you (a made up profile) and a scripted friend,
// "Zara_K" from Pakistan, so every online screen can be seen alone:
//   ?online=lobby         your profile, no room yet (try 2 Players, Online)
//   ?online=ready         both in the room, the ready screen held still
//   ?online=game          a game going; the friend plays a move when it is their turn
//   ?online=disconnected  a game where the friend has gone (the countdown)
//   ?online=result        the friend resigned: the result panel
// The friend's moves are the first legal move, after a short pause.
import { createDevBackend } from "../../../netlify/online/devBackend";
import { newToken, sha256Hex } from "../../../netlify/leaderboard/security";
import { getLegalMoves } from "../../engine";
import { encodeMove } from "../../leaderboard/protocol";
import { AWAY_AFTER_MS, READY_MS } from "../../online/protocol";
import type { RoomResponse } from "../../online/protocol";
import { replayMoves } from "../../online/game";
import { DEVICE_HEADER } from "../../leaderboard/protocol";
import { setLeaderboardTransport } from "../leaderboard/api";
import { leaderboardStore } from "../leaderboard/profile";
import { rememberRoom } from "./roomMemory";

const FRIEND_DEVICE = "dev-friend-device-0001";

export async function startDevOnline(mode: string): Promise<void> {
  let shift = 0; // the server clock's lead over this one
  let held: number | null = null; // ?online=ready: the server's clock stands still
  const backend = createDevBackend(() => held ?? Date.now() + shift);
  const { store } = backend.deps;

  async function makePlayer(username: string, country: string, avatar: string) {
    const token = newToken();
    const record = await store.createPlayer({ username, usernameKey: username.toLowerCase(), country, avatar, tokenHash: await sha256Hex(token), deviceHash: "dev", ipHash: "dev" });
    if (record === "taken") throw new Error("taken");
    return { token, username, country, avatar };
  }
  const me = await makePlayer("You_Player", "GB", "a12");
  const friend = await makePlayer("Zara_K", "PK", "a05");
  leaderboardStore.setProfile(me);

  const asFriend = (name: string, body?: unknown, query: Record<string, string> = {}) =>
    backend.call(name, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? "" : JSON.stringify(body),
      query: new URLSearchParams(query),
      authorization: `Bearer ${friend.token}`,
      deviceId: FRIEND_DEVICE,
      ip: "127.0.0.2",
    });

  setLeaderboardTransport(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    const headers = new Headers(init?.headers);
    const result = await backend.call(url.pathname.split("/").pop() ?? "", {
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
      query: url.searchParams,
      authorization: headers.get("authorization"),
      deviceId: headers.get(DEVICE_HEADER),
      ip: "127.0.0.1",
    });
    await new Promise((resolve) => setTimeout(resolve, 120)); // a little network time
    return new Response(JSON.stringify(result?.body ?? {}), { status: result?.status ?? 404, headers: { "content-type": "application/json" } });
  });
  if (mode === "lobby") return;

  // You make a room (through the real function, as the browser would), your friend joins.
  const created = await backend.call("room-create", {
    method: "POST",
    body: "{}",
    query: new URLSearchParams(),
    authorization: `Bearer ${me.token}`,
    deviceId: "dev-own-device-000001",
    ip: "127.0.0.1",
  });
  const code = (created!.body as RoomResponse).room.code;
  if (mode === "ready") held = Date.now();
  await asFriend("room-join", { code });
  rememberRoom(code);
  if (mode === "ready") return;
  shift += READY_MS;
  if (mode === "result") {
    await asFriend("room-resign", { code, match: 1 });
    return;
  }
  if (mode === "disconnected") {
    shift += AWAY_AFTER_MS + 4000;
    return;
  }

  // The friend: here every second, and a move when it is their turn.
  setInterval(async () => {
    const answer = await asFriend("room-state", undefined, { code });
    const room = (answer?.body as RoomResponse | undefined)?.room;
    const match = room?.match;
    if (!room || !match || room.status !== "playing" || match.toMove !== room.you.colour) return;
    const game = replayMoves(match.moves);
    const move = game && getLegalMoves(game.board, game.toMove)[0];
    if (move) await asFriend("room-move", { code, match: match.number, ply: match.moveCount, move: encodeMove(move) });
  }, 1200);
}
