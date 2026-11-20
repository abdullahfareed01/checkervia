// The browser's side of the online room functions (D140), through the same
// client as the leaderboard: the device id, the profile token, the timeout,
// and a result instead of a throw (ok, offline, serverError, failed).
import type { EncodedMove } from "../../leaderboard/protocol";
import type { RoomResponse } from "../../online/protocol";
import { call } from "../leaderboard/api";

export const roomApi = {
  create: () => call<RoomResponse>("room-create", { body: {} }),
  join: (code: string) => call<RoomResponse>("room-join", { body: { code } }),
  /** The room, with the moves after the first `since`; `away` while the tab is hidden. */
  state: (code: string, since: number, away: boolean, signal?: AbortSignal) =>
    call<RoomResponse>("room-state", { query: { code, since: String(since), ...(away ? { away: "1" } : {}) }, ...(signal ? { signal } : {}) }),
  move: (code: string, match: number, ply: number, move: EncodedMove) => call<RoomResponse>("room-move", { body: { code, match, ply, move } }),
  resign: (code: string, match: number) => call<RoomResponse>("room-resign", { body: { code, match } }),
  rematch: (code: string, match: number) => call<RoomResponse>("room-rematch", { body: { code, match } }),
  leave: (code: string) => call<RoomResponse>("room-leave", { body: { code } }),
};
