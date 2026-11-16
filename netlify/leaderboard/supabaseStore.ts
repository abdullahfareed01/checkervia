// The Supabase adapter: Postgres through the server's secret key (a legacy
// service_role JWT or a new sb_secret key, D58), used only in the Netlify
// functions (never in the browser bundle). Tables and functions
// come from docs/07-deployment/leaderboard-migration.sql and
// leaderboard-migration-2.sql (avatars, renames and reserved names, D61, D62). Row Level Security
// is on with no policies, so only this key can read or write.
//
// Every failure is thrown as an error carrying only its Postgres code;
// guarded() in http.ts logs that code and answers with a calm 503.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVELS, toAiLevel } from "../../src/ai/difficulty";
import type { AiLevel } from "../../src/ai/difficulty";
import { aiRecordOf } from "./store";
import type { LeaderboardStore, LevelCounts, PlayerRecord, RankedRow } from "./store";

const UNIQUE_VIOLATION = "23505";
// PostgREST's "no such function" (PGRST202) and Postgres's (42883).
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
const PLAYER_COLUMNS = "id, username, username_key, country, avatar, hidden, username_changed_at";

class StoreError extends Error {
  constructor(readonly code: string) {
    super(`storage error ${code}`);
  }
}

interface PostgrestError {
  readonly code?: string;
}

function check<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw new StoreError(result.error.code ?? "unknown");
  return result.data;
}

interface PlayerRow {
  id: string;
  username: string;
  username_key: string;
  country: string | null;
  avatar: string | null;
  hidden: boolean;
  username_changed_at: string | null;
}
const toPlayer = (row: PlayerRow): PlayerRecord => ({
  id: row.id,
  username: row.username,
  usernameKey: row.username_key,
  country: row.country,
  avatar: row.avatar,
  hidden: row.hidden,
  usernameChangedAt: row.username_changed_at === null ? null : new Date(row.username_changed_at),
});

interface RankedDbRow {
  rank: number;
  player_id: string;
  username: string;
  country: string | null;
  avatar: string | null;
  wins: number;
  best_moves: number;
}
const toRanked = (row: RankedDbRow): RankedRow => ({
  rank: Number(row.rank),
  playerId: row.player_id,
  username: row.username,
  country: row.country,
  avatar: row.avatar,
  wins: Number(row.wins),
  bestMoves: Number(row.best_moves),
});

const rankArgs = (level: AiLevel, since: Date | null) => ({ p_level: level, p_since: since?.toISOString() ?? null });

/**
 * True for a legacy key (the service_role JWT, "eyJ..."). The new secret
 * keys ("sb_secret_...") are not JWTs: Supabase reads them from the apikey
 * header only and refuses them as a Bearer token (D58).
 */
export function isJwtKey(key: string): boolean {
  return key.startsWith("eyJ");
}

/**
 * Every request's key headers, set here last so they never depend on how a
 * supabase-js version fills them in: apikey always, and Authorization only
 * for a legacy JWT key (removed otherwise).
 */
export function withKeyHeaders(fetchImpl: typeof fetch, key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("apikey", key);
    if (isJwtKey(key)) headers.set("Authorization", `Bearer ${key}`);
    else headers.delete("Authorization");
    return fetchImpl(input, { ...init, headers });
  };
}

// `fetchImpl` lets the tests answer in place of the database.
export function createSupabaseStore(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): LeaderboardStore {
  // A copied key often carries a space or a line break at its end.
  const key = serviceRoleKey.trim();
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withKeyHeaders(fetchImpl, key) },
  });

  async function onePlayer(column: "username_key" | "token_hash", value: string): Promise<PlayerRecord | null> {
    const row = check(await db.from("players").select(PLAYER_COLUMNS).eq(column, value).maybeSingle<PlayerRow>());
    return row ? toPlayer(row) : null;
  }

  return {
    playerByKey: (usernameKey) => onePlayer("username_key", usernameKey),
    playerByTokenHash: (tokenHash) => onePlayer("token_hash", tokenHash),

    async createPlayer(player) {
      const result = await db
        .from("players")
        .insert({
          username: player.username,
          username_key: player.usernameKey,
          country: player.country,
          avatar: player.avatar,
          token_hash: player.tokenHash,
          device_hash: player.deviceHash,
          ip_hash: player.ipHash,
        })
        .select(PLAYER_COLUMNS)
        .single<PlayerRow>();
      if (result.error?.code === UNIQUE_VIOLATION) return "taken";
      const row = check(result);
      if (!row) throw new StoreError("noRow");
      return toPlayer(row);
    },

    async reservedFor(usernameKey) {
      const row = check(
        await db
          .from("username_reservations")
          .select("player_id")
          .eq("username_key", usernameKey)
          .gt("reserved_until", new Date().toISOString())
          .maybeSingle<{ player_id: string }>(),
      );
      return row?.player_id ?? null;
    },

    async updatePlayer(playerId, changes) {
      const row = {
        ...(changes.country !== undefined ? { country: changes.country } : {}),
        ...(changes.avatar !== undefined ? { avatar: changes.avatar } : {}),
      };
      if (Object.keys(row).length > 0) check(await db.from("players").update(row).eq("id", playerId));
    },

    async renamePlayer(playerId, username, usernameKey, waitDays, reserveDays) {
      const row = check(
        await db
          .rpc("rename_player", { p_player: playerId, p_username: username, p_username_key: usernameKey, p_wait_days: waitDays, p_reserve_days: reserveDays })
          .single<{ outcome: string; next_change_at: string | null }>(),
      );
      if (!row || (row.outcome !== "renamed" && row.outcome !== "taken" && row.outcome !== "tooSoon")) throw new StoreError("noRow");
      return { outcome: row.outcome, nextChangeAt: row.next_change_at === null ? null : new Date(row.next_change_at) };
    },

    async addWin(win) {
      const result = await db.from("wins").insert({
        player_id: win.playerId,
        game_id: win.gameId,
        level: win.level,
        moves: win.moves,
        moves_hash: win.movesHash,
        move_count: win.moveCount,
        stats: win.stats,
      });
      if (result.error?.code === UNIQUE_VIOLATION) return "duplicate";
      check(result);
      return "added";
    },

    async saveGameResult(result, replace) {
      // `resigned` only when true, so reports work before migration 3 is run.
      const row = {
        player_id: result.playerId,
        game_id: result.gameId,
        level: result.level,
        result: result.result,
        ...(result.resigned ? { resigned: true } : {}),
      };
      if (replace) {
        check(await db.from("game_results").upsert(row, { onConflict: "player_id,game_id" }));
        return "added";
      }
      const inserted = await db.from("game_results").insert(row);
      if (inserted.error?.code === UNIQUE_VIOLATION) return "duplicate";
      check(inserted);
      return "added";
    },

    async rankedPage(level, since, offset, limit) {
      const result = await db
        .rpc("leaderboard_ranked", rankArgs(level, since), { count: "exact" })
        .order("rank")
        .range(offset, offset + limit - 1);
      const rows = check(result) as RankedDbRow[] | null;
      return { rows: (rows ?? []).map(toRanked), total: result.count ?? 0 };
    },

    async rankedRow(level, since, playerId) {
      const row = check(await db.rpc("leaderboard_ranked", rankArgs(level, since)).eq("player_id", playerId).maybeSingle<RankedDbRow>());
      return row ? toRanked(row) : null;
    },

    async levelCounts(playerId): Promise<LevelCounts[]> {
      const rows = check(await db.rpc("player_level_stats", { p_player: playerId })) as
        | { level: number; wins: number; best_moves: number | null; losses: number; games: number }[]
        | null;
      return (rows ?? [])
        .map((row) => ({
          level: toAiLevel(row.level),
          wins: Number(row.wins),
          bestMoves: row.best_moves === null ? null : Number(row.best_moves),
          losses: Number(row.losses),
          games: Number(row.games),
        }))
        .sort((a, b) => a.level - b.level);
    },

    async aiRecord() {
      const answer = await db.rpc("ai_record");
      // Before migration 3 the function does not exist yet: count the games
      // straight from the table (hidden players left out), a win and a loss
      // count per level. No resignations are stored before then, so 0.
      if (answer.error && MISSING_FUNCTION.has(answer.error.code ?? "")) {
        const count = async (level: number, result: "win" | "loss") => {
          const counted = await db
            .from("game_results")
            .select("player_id, players!inner(hidden)", { count: "exact", head: true })
            .eq("players.hidden", false)
            .eq("level", level)
            .eq("result", result);
          check(counted);
          return counted.count ?? 0;
        };
        return aiRecordOf(
          await Promise.all(
            LEVELS.map(async (level) => {
              const [aiWins, aiLosses] = await Promise.all([count(level, "loss"), count(level, "win")]);
              return { level, games: aiWins + aiLosses, aiWins, aiLosses, resigned: 0 };
            }),
          ),
        );
      }
      const rows = (check(answer) ?? []) as { level: number; games: number; ai_wins: number; ai_losses: number; resigned: number }[];
      return aiRecordOf(
        LEVELS.map((level) => {
          const row = rows.find((candidate) => Number(candidate.level) === level);
          return {
            level,
            games: Number(row?.games ?? 0),
            aiWins: Number(row?.ai_wins ?? 0),
            aiLosses: Number(row?.ai_losses ?? 0),
            resigned: Number(row?.resigned ?? 0),
          };
        }),
      );
    },

    async hitRateLimit(key, windowSeconds, limit) {
      const row = check(
        await db
          .rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit })
          .single<{ allowed: boolean; retry_after_seconds: number }>(),
      );
      if (!row) throw new StoreError("noRow");
      return { allowed: row.allowed, retryAfterSeconds: Number(row.retry_after_seconds) };
    },
  };
}
