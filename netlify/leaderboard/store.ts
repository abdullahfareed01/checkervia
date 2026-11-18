// The one interface the leaderboard handlers use for storage. Two adapters:
// supabaseStore.ts (the real one, Postgres through the service role key) and
// memoryStore.ts (for tests and local work without a database).
import type { AiLevel } from "../../src/ai/difficulty";
import type { AbandonPhase, EncodedMove, SuspensionKind } from "../../src/leaderboard/protocol";

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
  readonly result: "win" | "loss" | "draw"; // a draw since D89
  readonly resigned?: boolean; // a loss by resignation (D75)
}

/** The AI's record at one level, or over all of them. */
export interface AiCounts {
  readonly games: number;
  readonly aiWins: number; // the players' losses, resignations included
  readonly aiLosses: number; // the players' wins
  readonly resigned: number; // the players' resignations
  readonly draws: number; // D89; 0 before migration 5
}

/**
 * The AI's record over every player's reported games (D75); hidden players
 * left out. The totals, and the same per level, always all four levels in
 * order (D77).
 */
export interface AiRecord extends AiCounts {
  readonly levels: readonly (AiCounts & { readonly level: AiLevel })[];
}

/** The totals from the four levels' counts. */
export function aiRecordOf(levels: readonly (AiCounts & { readonly level: AiLevel })[]): AiRecord {
  const sum = (key: keyof AiCounts) => levels.reduce((total, level) => total + level[key], 0);
  return { games: sum("games"), aiWins: sum("aiWins"), aiLosses: sum("aiLosses"), resigned: sum("resigned"), draws: sum("draws"), levels };
}

/** A report for an abandoned game (D85). */
export interface NewReport {
  readonly playerId: string;
  readonly gameId: string;
  readonly level: AiLevel;
  readonly phase: AbandonPhase;
}

/** A player's reports and suspension (D85). */
export interface Conduct {
  readonly reports: number; // towards the next suspension
  readonly totalReports: number;
  readonly suspendedUntil: Date | null; // null when not suspended now
  // From migration 7 on (D102): who suspended, and when a moderator last changed it.
  readonly kind?: SuspensionKind | null;
  readonly revisedAt?: Date | null;
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
  readonly resigned: number; // the losses that were resignations; 0 before migration 3
  readonly draws: number; // D89; 0 before migration 5
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
  /** The AI's record over every player (D75). */
  aiRecord(): Promise<AiRecord>;
  /**
   * Records a report once per game (a repeat changes nothing). Not
   * suspended: the count goes up, and at `limit` the player is suspended for
   * `days` and the count starts again from zero. While suspended a report
   * only adds to the total.
   */
  addReport(report: NewReport, limit: number, days: number): Promise<Conduct>;
  /** The player's reports and suspension now; zeros before migration 4 is run. */
  conduct(playerId: string): Promise<Conduct>;
  /** Counts a request against a fixed window and says whether it may go ahead. */
  hitRateLimit(key: string, windowSeconds: number, limit: number): Promise<RateLimitResult>;
}
