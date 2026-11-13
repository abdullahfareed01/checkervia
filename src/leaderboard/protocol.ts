// What the browser and the leaderboard functions send each other. Shared, so
// both sides agree on the shapes and the limits. Pure.
import type { AiLevel } from "../ai/difficulty";
import type { Move, Position } from "../engine";
import type { Period } from "./periods";
import type { UsernameRule } from "./username";

// The tabs, strongest first (the default tab).
export const LEADERBOARD_LEVELS: readonly AiLevel[] = [4, 3, 2, 1];
export const PAGE_SIZE = 20;
export const MAX_PAGE = 49; // 50 pages of 20: the top 1000

// A game longer than this is refused (there is no draw rule, so a game could
// in theory go on for ever). Real games are far shorter.
export const MAX_GAME_MOVES = 600;

// Headers: the device id is a random id kept in the browser; the token comes
// from claiming a username. Both are sent only to our own functions.
export const DEVICE_HEADER = "x-checkervia-device";
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const GAME_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

// A move on the wire: the start square then every landing square, each as
// row * 8 + col (0 to 63). Captures are not sent: the server works them out.
export type EncodedMove = readonly number[];

const squareNumber = ({ row, col }: Position) => row * 8 + col;

export function encodeMove(move: Move): EncodedMove {
  return [squareNumber(move.from), ...move.path.map(squareNumber)];
}

/** "auto" asks the server to use the country it sees the request come from. */
export type CountryChoice = "auto" | string | null;

export interface ClaimRequest {
  readonly username: string;
  readonly country: CountryChoice;
}

export interface SubmitWinRequest {
  readonly gameId: string;
  readonly level: AiLevel;
  readonly mode: "vs-ai";
  readonly moves: readonly EncodedMove[];
}

export interface ReportGameRequest {
  readonly gameId: string;
  readonly level: AiLevel;
  readonly result: "win" | "loss";
}

export interface UpdateProfileRequest {
  readonly country: CountryChoice;
}

export interface CheckUsernameResponse {
  readonly available: boolean;
  readonly problems: readonly UsernameRule[];
}

export interface ClaimResponse {
  readonly username: string;
  readonly country: string | null;
  // Returned once, here only. The server keeps a hash of it.
  readonly token: string;
}

export interface SubmitWinResponse {
  readonly moveCount: number;
  readonly weekRank: number | null; // the player's rank this week on that level
}

export interface LeaderboardRow {
  readonly rank: number;
  readonly username: string;
  readonly country: string | null;
  readonly wins: number;
  readonly bestMoves: number;
}

export interface LeaderboardResponse {
  readonly level: AiLevel;
  readonly period: Period;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number; // ranked players in this level and period
  readonly resetsAt: string | null; // ISO time, null for all time
  readonly rows: readonly LeaderboardRow[];
  readonly me: LeaderboardRow | null; // the caller's own row, when they sent a token
}

export interface LevelRecord {
  readonly level: AiLevel;
  readonly wins: number;
  readonly losses: number;
}

export interface ProfileResponse {
  readonly username: string;
  readonly country: string | null;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number | null; // 0 to 1, null before the first game
  readonly byLevel: readonly LevelRecord[]; // Easy to Strongest
  readonly bestWin: { readonly moves: number; readonly level: AiLevel } | null;
  readonly weeklyStrongestRank: number | null;
}

export interface ErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly retryAfter?: number; // seconds, on 429
}
