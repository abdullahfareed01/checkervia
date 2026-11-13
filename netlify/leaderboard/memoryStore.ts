// The in memory store: the same behaviour as the Supabase adapter, kept in
// plain arrays. For tests, and for running the functions without a database.
// Everything is lost when the process stops.
import { LEVELS } from "../../src/ai/difficulty";
import type { AiLevel } from "../../src/ai/difficulty";
import { rankPlayers } from "../../src/leaderboard/ranking";
import type { GameResult, LeaderboardStore, LevelCounts, NewPlayer, NewWin, PlayerRecord, RankedRow } from "./store";

interface StoredPlayer extends PlayerRecord, NewPlayer {}
interface StoredWin extends NewWin {
  readonly createdAt: number;
  readonly hidden: boolean;
}

export interface MemoryStore extends LeaderboardStore {
  /** Moderation, as the hidden column in the database. */
  hidePlayer(playerId: string): void;
  hideWin(gameId: string): void;
  /** What a test may inspect: never returned by any handler. */
  readonly players: readonly StoredPlayer[];
}

export function createMemoryStore(now: () => number = Date.now): MemoryStore {
  let players: StoredPlayer[] = [];
  let wins: StoredWin[] = [];
  const results = new Map<string, GameResult>(); // key: player id and game id
  const windows = new Map<string, { hits: number; end: number }>(); // key and window start
  let nextId = 1;

  const visiblePlayer = (id: string) => players.find((player) => player.id === id && !player.hidden);
  const publicRecord = ({ id, username, usernameKey, country, hidden }: StoredPlayer): PlayerRecord => ({
    id, username, usernameKey, country, hidden,
  });

  function ranked(level: AiLevel, since: Date | null): RankedRow[] {
    const counted = wins.filter(
      (win) => win.level === level && !win.hidden && visiblePlayer(win.playerId) && (since === null || win.createdAt >= since.getTime()),
    );
    return rankPlayers(counted).map((row) => {
      const player = visiblePlayer(row.playerId)!;
      return { rank: row.rank, playerId: row.playerId, username: player.username, country: player.country, wins: row.wins, bestMoves: row.bestMoves };
    });
  }

  return {
    get players() {
      return players;
    },
    hidePlayer(playerId) {
      players = players.map((player) => (player.id === playerId ? { ...player, hidden: true } : player));
    },
    hideWin(gameId) {
      wins = wins.map((win) => (win.gameId === gameId ? { ...win, hidden: true } : win));
    },

    async playerByKey(usernameKey) {
      const player = players.find((stored) => stored.usernameKey === usernameKey);
      return player ? publicRecord(player) : null;
    },
    async playerByTokenHash(tokenHash) {
      const player = players.find((stored) => stored.tokenHash === tokenHash);
      return player ? publicRecord(player) : null;
    },
    async createPlayer(input) {
      if (players.some((player) => player.usernameKey === input.usernameKey)) return "taken";
      // Ids sort in the order they were made, like the time ordered tests expect.
      const player: StoredPlayer = { ...input, id: `player-${String(nextId++).padStart(6, "0")}`, hidden: false };
      players = [...players, player];
      return publicRecord(player);
    },
    async setCountry(playerId, country) {
      players = players.map((player) => (player.id === playerId ? { ...player, country } : player));
    },
    async addWin(win) {
      const duplicate = wins.some(
        (stored) => stored.gameId === win.gameId || (stored.playerId === win.playerId && stored.level === win.level && stored.movesHash === win.movesHash),
      );
      if (duplicate) return "duplicate";
      wins = [...wins, { ...win, createdAt: now(), hidden: false }];
      return "added";
    },
    async saveGameResult(result, replace) {
      const key = `${result.playerId} ${result.gameId}`;
      if (results.has(key) && !replace) return "duplicate";
      const added = !results.has(key);
      results.set(key, result);
      return added ? "added" : "duplicate";
    },
    async rankedPage(level, since, offset, limit) {
      const rows = ranked(level, since);
      return { rows: rows.slice(offset, offset + limit), total: rows.length };
    },
    async rankedRow(level, since, playerId) {
      return ranked(level, since).find((row) => row.playerId === playerId) ?? null;
    },
    async levelCounts(playerId): Promise<LevelCounts[]> {
      const own = [...results.values()].filter((result) => result.playerId === playerId);
      return LEVELS.map((level) => {
        const levelWins = wins.filter((win) => win.playerId === playerId && win.level === level && !win.hidden);
        return {
          level,
          wins: levelWins.length,
          bestMoves: levelWins.length > 0 ? Math.min(...levelWins.map((win) => win.moveCount)) : null,
          losses: own.filter((result) => result.level === level && result.result === "loss").length,
          games: own.filter((result) => result.level === level).length,
        };
      });
    },
    async hitRateLimit(key, windowSeconds, limit) {
      const time = now();
      const windowMs = windowSeconds * 1000;
      const start = Math.floor(time / windowMs) * windowMs;
      const windowKey = `${key} ${start}`;
      const end = start + windowMs;
      const hits = (windows.get(windowKey)?.hits ?? 0) + 1;
      windows.set(windowKey, { hits, end });
      // Forget finished windows, so memory stays small.
      for (const [stored, window] of windows) if (window.end <= time) windows.delete(stored);
      return { allowed: hits <= limit, retryAfterSeconds: Math.max(1, Math.ceil((end - time) / 1000)) };
    },
  };
}
