// Development only: every leaderboard and room function on the in memory
// stores, behind one call. Used by `vite --mode online` (two real browser
// windows share it through the Vite server, see vite.config.ts) and by the
// browser preview ?online= (devOnline.ts). Never part of a Netlify function
// or of the production bundle (checked by the build test).
import { handleCheckUsername } from "../leaderboard/handlers/checkUsername";
import { handleClaimUsername } from "../leaderboard/handlers/claimUsername";
import { handleGetAiStats } from "../leaderboard/handlers/getAiStats";
import { handleGetLeaderboard } from "../leaderboard/handlers/getLeaderboard";
import { handleGetProfile } from "../leaderboard/handlers/getProfile";
import { handleReportAbandon } from "../leaderboard/handlers/reportAbandon";
import { handleReportGame } from "../leaderboard/handlers/reportGame";
import { handleSubmitWin } from "../leaderboard/handlers/submitWin";
import { handleUpdateProfile } from "../leaderboard/handlers/updateProfile";
import type { LeaderboardHandler, LeaderboardRequest, LeaderboardResponse } from "../leaderboard/http";
import { createMemoryStore } from "../leaderboard/memoryStore";
import { newToken } from "../leaderboard/security";
import { handleCreateRoom } from "./handlers/createRoom";
import { handleJoinRoom } from "./handlers/joinRoom";
import { handleLeaveRoom, handleRematch, handleResign } from "./handlers/matchActions";
import { handleMakeMove } from "./handlers/makeMove";
import { handleRoomState } from "./handlers/roomState";
import type { OnlineDeps, OnlineHandler } from "./http";
import { createMemoryOnlineStore } from "./memoryStore";

const LEADERBOARD: Record<string, LeaderboardHandler> = {
  "check-username": handleCheckUsername,
  "claim-username": handleClaimUsername,
  "submit-win": handleSubmitWin,
  "report-game": handleReportGame,
  "report-abandon": handleReportAbandon,
  "get-leaderboard": handleGetLeaderboard,
  "get-profile": handleGetProfile,
  "get-ai-stats": handleGetAiStats,
  "update-profile": handleUpdateProfile,
};

const ROOMS: Record<string, OnlineHandler> = {
  "room-create": handleCreateRoom,
  "room-join": handleJoinRoom,
  "room-state": handleRoomState,
  "room-move": handleMakeMove,
  "room-resign": handleResign,
  "room-rematch": handleRematch,
  "room-leave": handleLeaveRoom,
};

export interface DevBackend {
  readonly deps: OnlineDeps;
  /** The answer of function `name`, or null when there is no such function. */
  call(name: string, request: LeaderboardRequest): Promise<LeaderboardResponse | null>;
}

/** `now`: the server's clock (the preview can hold it still). */
export function createDevBackend(now: () => number = Date.now): DevBackend {
  const store = createMemoryStore(now);
  const deps: OnlineDeps = {
    store,
    online: createMemoryOnlineStore(),
    salt: "dev salt",
    now: () => new Date(now()),
    newToken,
    log: (message) => console.info(message),
    randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
  };
  return {
    deps,
    async call(name, request) {
      const room = ROOMS[name];
      if (room) return room(request, deps);
      const leaderboard = LEADERBOARD[name];
      return leaderboard ? leaderboard(request, deps) : null;
    },
  };
}
