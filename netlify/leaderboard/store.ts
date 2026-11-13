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
  readonly hidden: boolean;
}

export interface NewPlayer {
  readonly username: string;
  readonly usernameKey: string;
  readonly country: string | null;
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

export interface LeaderboardStore {
  playerByKey(usernameKey: string): Promise<PlayerRecord | null>;
  playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;
  /** "taken" when the username key is already used (hidden players included). */
  createPlayer(player: NewPlayer): Promise<PlayerRecord | "taken">;
  setCountry(playerId: string, country: string | null): Promise<void>;
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
