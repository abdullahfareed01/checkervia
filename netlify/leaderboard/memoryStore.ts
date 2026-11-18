// The in memory store: the same behaviour as the Supabase adapter, kept in
// plain arrays. For tests, and for running the functions without a database.
// Everything is lost when the process stops.
import { LEVELS } from "../../src/ai/difficulty";
import type { AiLevel } from "../../src/ai/difficulty";
import { rankPlayers } from "../../src/leaderboard/ranking";
import { aiRecordOf } from "./store";
import type { Conduct, GameResult, LeaderboardStore, LevelCounts, NewPlayer, NewWin, PlayerRecord, RankedRow } from "./store";

interface StoredPlayer extends PlayerRecord, NewPlayer {}
const DAY_MS = 86_400_000;
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
  const reservations = new Map<string, { playerId: string; until: number }>(); // key: username key
  const reports = new Set<string>(); // player id and game id (D85)
  const conducts = new Map<string, { reports: number; totalReports: number; suspendedUntil: number | null }>();
  const conductOf = (playerId: string): Conduct => {
    const stored = conducts.get(playerId) ?? { reports: 0, totalReports: 0, suspendedUntil: null };
    const suspended = stored.suspendedUntil !== null && stored.suspendedUntil > now();
    return { reports: stored.reports, totalReports: stored.totalReports, suspendedUntil: suspended ? new Date(stored.suspendedUntil!) : null };
  };
  let nextId = 1;

  const reservedFor = (key: string): string | null => {
    const reservation = reservations.get(key);
    return reservation && reservation.until > now() ? reservation.playerId : null;
  };

  const visiblePlayer = (id: string) => players.find((player) => player.id === id && !player.hidden);
  const publicRecord = ({ id, username, usernameKey, country, avatar, hidden, usernameChangedAt }: StoredPlayer): PlayerRecord => ({
    id, username, usernameKey, country, avatar, hidden, usernameChangedAt,
  });

  function ranked(level: AiLevel, since: Date | null): RankedRow[] {
    const counted = wins.filter(
      (win) => win.level === level && !win.hidden && visiblePlayer(win.playerId) && (since === null || win.createdAt >= since.getTime()),
    );
    return rankPlayers(counted).map((row) => {
      const player = visiblePlayer(row.playerId)!;
      return {
        rank: row.rank, playerId: row.playerId, username: player.username, country: player.country, avatar: player.avatar, wins: row.wins, bestMoves: row.bestMoves,
      };
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
    async reservedFor(usernameKey) {
      return reservedFor(usernameKey);
    },
    async createPlayer(input) {
      if (players.some((player) => player.usernameKey === input.usernameKey) || reservedFor(input.usernameKey) !== null) return "taken";
      // Ids sort in the order they were made, like the time ordered tests expect.
      const player: StoredPlayer = { ...input, id: `player-${String(nextId++).padStart(6, "0")}`, hidden: false, usernameChangedAt: null };
      players = [...players, player];
      return publicRecord(player);
    },
    async updatePlayer(playerId, changes) {
      players = players.map((player) =>
        player.id === playerId
          ? { ...player, ...(changes.country !== undefined ? { country: changes.country } : {}), ...(changes.avatar !== undefined ? { avatar: changes.avatar } : {}) }
          : player,
      );
    },
    async renamePlayer(playerId, username, usernameKey, waitDays, reserveDays) {
      const player = players.find((stored) => stored.id === playerId);
      if (!player) throw Object.assign(new Error("no player"), { code: "noRow" });
      const time = now();
      const allowedAt = player.usernameChangedAt ? player.usernameChangedAt.getTime() + waitDays * DAY_MS : 0;
      if (allowedAt > time) return { outcome: "tooSoon", nextChangeAt: new Date(allowedAt) };
      const holder = reservedFor(usernameKey);
      if (players.some((other) => other.usernameKey === usernameKey && other.id !== playerId) || (holder !== null && holder !== playerId)) {
        return { outcome: "taken", nextChangeAt: null };
      }
      reservations.delete(usernameKey);
      if (player.usernameKey !== usernameKey) reservations.set(player.usernameKey, { playerId, until: time + reserveDays * DAY_MS });
      players = players.map((stored) => (stored.id === playerId ? { ...stored, username, usernameKey, usernameChangedAt: new Date(time) } : stored));
      return { outcome: "renamed", nextChangeAt: new Date(time + waitDays * DAY_MS) };
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
          resigned: own.filter((result) => result.level === level && result.resigned === true).length,
          draws: own.filter((result) => result.level === level && result.result === "draw").length,
        };
      });
    },
    async addReport(report, limit, days) {
      const key = `${report.playerId} ${report.gameId}`;
      if (reports.has(key)) return conductOf(report.playerId);
      reports.add(key);
      const current = conductOf(report.playerId);
      const totalReports = current.totalReports + 1;
      if (current.suspendedUntil) {
        conducts.set(report.playerId, { reports: current.reports, totalReports, suspendedUntil: current.suspendedUntil.getTime() });
      } else if (current.reports + 1 >= limit) {
        conducts.set(report.playerId, { reports: 0, totalReports, suspendedUntil: now() + days * DAY_MS });
      } else {
        conducts.set(report.playerId, { reports: current.reports + 1, totalReports, suspendedUntil: null });
      }
      return conductOf(report.playerId);
    },
    async conduct(playerId) {
      return conductOf(playerId);
    },
    async aiRecord() {
      const counted = [...results.values()].filter((result) => visiblePlayer(result.playerId));
      return aiRecordOf(
        LEVELS.map((level) => {
          const atLevel = counted.filter((result) => result.level === level);
          return {
            level,
            games: atLevel.length,
            aiWins: atLevel.filter((result) => result.result === "loss").length,
            aiLosses: atLevel.filter((result) => result.result === "win").length,
            resigned: atLevel.filter((result) => result.resigned === true).length,
            draws: atLevel.filter((result) => result.result === "draw").length,
          };
        }),
      );
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
