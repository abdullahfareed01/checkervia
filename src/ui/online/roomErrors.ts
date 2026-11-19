// What the player reads when making, joining or using a room fails (D142).
// Calm, short, and saying what to do next. No dashes (owner rule).
import { MAX_OPEN_ROOMS } from "../../online/protocol";
import type { ApiResult } from "../leaderboard/api";
import { tooManyText } from "../leaderboard/Problem";
import type { Problem } from "../leaderboard/Problem";

export const ONLINE_OFFLINE = "You are offline. Check your connection and try again.";
export const ONLINE_SERVER = "Online play is having a problem. Please try again in a moment.";

const ROOM_TEXTS: Record<string, string> = {
  invalid: "That is not a room code. A code has 6 letters and numbers.",
  roomNotFound: "There is no room with this code. Check it with your friend.",
  roomFull: "This room already has two players.",
  roomExpired: "This room has expired. Ask your friend for a new code.",
  roomClosed: "This game has finished and the room is closed. Ask your friend for a new code.",
  notMember: "You are not in this room any more.",
  noProfile: "Your profile was not found. Make a new one to play online.",
  tooManyRooms: `You have ${MAX_OPEN_ROOMS} rooms with games going. Finish or leave one first.`,
};

/** The words for a failed request about a room. */
export function roomProblemText(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): string {
  if (result.kind === "offline") return ONLINE_OFFLINE;
  if (result.kind === "serverError") return ONLINE_SERVER;
  if (result.status === 429) return tooManyText(result.retryAfter ?? null);
  return ROOM_TEXTS[result.code] ?? ONLINE_SERVER;
}

export const createProblemText = roomProblemText;

/** Why a room the player was in cannot be shown any more (useRoom's refusal). */
export const refusalText = (code: string) => ROOM_TEXTS[code] ?? ONLINE_SERVER;

/** A connection problem while in a room, in the room's words. */
export function onlineProblemText(problem: Problem): string {
  if (problem.kind === "offline") return ONLINE_OFFLINE;
  if (problem.kind === "server") return ONLINE_SERVER;
  return tooManyText(problem.retryAfter);
}
