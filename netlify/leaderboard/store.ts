// The one interface the leaderboard handlers use for storage. Two adapters:
// supabaseStore.ts (the real one, Postgres through the service role key) and
// memoryStore.ts (for tests and local work without a database).
import type { AiLevel } from "../../src/ai/difficulty";
import type { EncodedMove } from "../../src/leaderboard/protocol";

export interface PlayerRecord {
  readonly id: string;
  readonly username: string;
  readonly usernameKey: string;
  readonly country: string | null;
  readonly avatar: string | null; // an id from src/leaderboard/avatars.ts; null for players from before avatars
  readonly hidden: boolean;
  readonly usernameChangedAt: Date | null; // the last rename, null if never
}

export interface NewPlayer {
  readonly username: string;
  readonly usernameKey: string;
  readonly country: string | null;
  readonly avatar: string | null; // the handlers always set one; null is a player from before avatars
  readonly tokenHash: string;
  readonly deviceHash: string;
  readonly ipHash: string;
}

// Worked out by the server's replay, never taken from the browser.
export interface WinStats {
  readonly totalMoves: number;
  readonly captured: number;
  readonly kingsMade: number;
  readonly bestChain: number;
}

export interface NewWin {
  readonly playerId: string;
  readonly gameId: string;
  readonly level: AiLevel;
  readonly moves: readonly EncodedMove[];
  readonly movesHash: string;
  readonly moveCount: number; // the player's own moves
  readonly stats: WinStats;
}

export interface GameResult {
  readonly playerId: string;
  readonly gameId: string;
  readonly level: AiLevel;
  readonly result: "win" | "loss";
}

export interface RankedRow {
  readonly rank: number;
  readonly playerId: string;
  readonly username: string;
  readonly country: string | null;
  readonly avatar: string | null;
  readonly wins: number;
  readonly bestMoves: number;
}

export interface LevelCounts {
  readonly level: AiLevel;
  readonly wins: number; // verified by replay
  readonly bestMoves: number | null;
  readonly losses: number; // reported
  readonly games: number; // reported, plus every verified win
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface RenameResult {
  readonly outcome: "renamed" | "taken" | "tooSoon";
  // renamed: when the next change is allowed; tooSoon: when this one will be.
  readonly nextChangeAt: Date | null;
}

export interface LeaderboardStore {
  playerByKey(usernameKey: string): Promise<PlayerRecord | null>;
  playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;
  /** The player an old username is reserved for (D61), or null when it is not reserved now. */
  reservedFor(usernameKey: string): Promise<string | null>;
  /** "taken" when the username key is used (hidden players included) or reserved. */
  createPlayer(player: NewPlayer): Promise<PlayerRecord | "taken">;
  /** Changes the flag and/or the avatar (undefined: unchanged). */
  updatePlayer(playerId: string, changes: { readonly country?: string | null; readonly avatar?: string }): Promise<void>;
  /**
   * Renames in one step: refused when the last rename was less than
   * `waitDays` ago, or when the name is used or reserved for someone else.
   * The old name is then reserved for this player for `reserveDays`.
   */
  renamePlayer(playerId: string, username: string, usernameKey: string, waitDays: number, reserveDays: number): Promise<RenameResult>;
  /** "duplicate" for a game id seen before, or the same moves again by the same player on the same level. */
  addWin(win: NewWin): Promise<"added" | "duplicate">;
  /** `replace`: a verified win overwrites whatever was reported for that game. */
  saveGameResult(result: GameResult, replace: boolean): Promise<"added" | "duplicate">;
  /** One page of the ranking; hidden players and hidden wins are left out. `since` null is all time. */
  rankedPage(level: AiLevel, since: Date | null, offset: number, limit: number): Promise<{ rows: RankedRow[]; total: number }>;
  rankedRow(level: AiLevel, since: Date | null, playerId: string): Promise<RankedRow | null>;
  /** Counts for each level, Easy to Strongest. */
  levelCounts(playerId: string): Promise<LevelCounts[]>;
  /** Counts a request against a fixed window and says whether it may go ahead. */
  hitRateLimit(key: string, windowSeconds: number, limit: number): Promise<RateLimitResult>;
}
