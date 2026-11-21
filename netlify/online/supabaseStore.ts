// The room store on Supabase (D140): Postgres through the server's secret
// key, used only in the Netlify functions. Tables and the cleanup function
// come from docs/07-deployment/leaderboard-migration-6.sql. Row Level
// Security is on with no policies, so only this key can read or write.
// A room, its players and its latest game are read in one request.
//
// As in the leaderboard adapter, every failure is thrown carrying only its
// Postgres code; guarded() logs the code and answers a calm 503.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EncodedMove } from "../../src/leaderboard/protocol";
import type { FinishReason } from "../../src/online/protocol";
import { toPlayer, withKeyHeaders } from "../leaderboard/supabaseStore";
import type { PlayerRow } from "../leaderboard/supabaseStore";
import type { MatchRecord, MemberRecord, OneRoundStore, OnlineStore, RoomSnapshot } from "./store";

const UNIQUE_VIOLATION = "23505";
const DAY_MS = 86_400_000;

class StoreError extends Error {
  constructor(readonly code: string) {
    super(`storage error ${code}`);
  }
}

function check<T>(result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new StoreError(result.error.code ?? "unknown");
  return result.data;
}

interface MemberRow {
  player_id: string;
  seat: number;
  username: string;
  avatar: string | null;
  country: string | null;
  seen_at: string;
  away: boolean;
  left_at: string | null;
}

interface MatchRow {
  id: string;
  number: number;
  black_id: string;
  white_id: string;
  moves: EncodedMove[];
  starts_at: string;
  finished: boolean;
  winner_id: string | null;
  reason: FinishReason | null;
}

interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  device_hash: string;
  created_at: string;
  used_at: string;
  closed_at: string | null;
  rematch_by: string | null;
  online_members: MemberRow[];
  online_matches: MatchRow[];
}

const date = (value: string | null) => (value === null ? null : new Date(value));

const toMember = (row: MemberRow): MemberRecord => ({
  playerId: row.player_id,
  seat: row.seat === 1 ? 1 : 0,
  username: row.username,
  avatar: row.avatar,
  country: row.country,
  seenAt: new Date(row.seen_at),
  away: row.away,
  leftAt: date(row.left_at),
});

const toMatch = (row: MatchRow): MatchRecord => ({
  id: row.id,
  number: Number(row.number),
  blackId: row.black_id,
  whiteId: row.white_id,
  moves: row.moves,
  startsAt: new Date(row.starts_at),
  finished: row.finished,
  winnerId: row.winner_id,
  reason: row.reason,
});

const toSnapshot = (row: RoomRow): RoomSnapshot => ({
  room: {
    id: row.id,
    code: row.code,
    hostId: row.host_id,
    deviceHash: row.device_hash,
    createdAt: new Date(row.created_at),
    usedAt: new Date(row.used_at),
    closedAt: date(row.closed_at),
    rematchBy: row.rematch_by,
  },
  members: row.online_members.map(toMember).sort((a, b) => a.seat - b.seat),
  match: row.online_matches[0] ? toMatch(row.online_matches[0]) : null,
});

const ROOM_SELECT =
  "id, code, host_id, device_hash, created_at, used_at, closed_at, rematch_by, " +
  "online_members (player_id, seat, username, avatar, country, seen_at, away, left_at), " +
  "online_matches (id, number, black_id, white_id, moves, starts_at, finished, winner_id, reason)";

// `fetchImpl` lets the tests answer in place of the database.
export function createSupabaseOnlineStore(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): OnlineStore {
  const key = serviceRoleKey.trim();
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withKeyHeaders(fetchImpl, key) },
  });

  // Rooms with their players and only their latest game.
  const rooms = () =>
    db
      .from("online_rooms")
      .select(ROOM_SELECT)
      .order("number", { referencedTable: "online_matches", ascending: false })
      .limit(1, { referencedTable: "online_matches" });

  return {
    async createRoom(room, host) {
      const inserted = await db
        .from("online_rooms")
        .insert({ code: room.code, host_id: room.hostId, device_hash: room.deviceHash, created_at: room.at.toISOString(), used_at: room.at.toISOString() })
        .select("id")
        .single<{ id: string }>();
      if (inserted.error?.code === UNIQUE_VIOLATION) return "codeTaken";
      const id = check(inserted)!.id;
      check(
        await db.from("online_members").insert({
          room_id: id,
          player_id: host.playerId,
          seat: 0,
          username: host.username,
          avatar: host.avatar,
          country: host.country,
          seen_at: room.at.toISOString(),
        }),
      );
      return { id, code: room.code, hostId: room.hostId, deviceHash: room.deviceHash, createdAt: room.at, usedAt: room.at, closedAt: null, rematchBy: null };
    },

    async snapshot(code) {
      const row = check(await rooms().eq("code", code).maybeSingle<RoomRow>());
      return row ? toSnapshot(row) : null;
    },

    async hostedRooms(playerId) {
      const rows = check(await rooms().eq("host_id", playerId).is("closed_at", null).returns<RoomRow[]>());
      return (rows ?? []).map(toSnapshot);
    },

    async openRoomCount(playerId, deviceHash, since) {
      const result = await db
        .from("online_rooms")
        .select("id", { count: "exact", head: true })
        .is("closed_at", null)
        .gte("used_at", since.toISOString())
        .or(`host_id.eq.${playerId},device_hash.eq.${deviceHash}`);
      check(result);
      return result.count ?? 0;
    },

    async closeRoom(roomId, at) {
      check(await db.from("online_rooms").update({ closed_at: at.toISOString() }).eq("id", roomId).is("closed_at", null));
    },

    async addMember(roomId, member, at) {
      const result = await db.from("online_members").insert({
        room_id: roomId,
        player_id: member.playerId,
        seat: 1,
        username: member.username,
        avatar: member.avatar,
        country: member.country,
        seen_at: at.toISOString(),
      });
      if (result.error?.code === UNIQUE_VIOLATION) return "full";
      check(result);
      check(await db.from("online_rooms").update({ used_at: at.toISOString() }).eq("id", roomId));
      return "added";
    },

    async touchMember(roomId, playerId, at, away) {
      check(await db.from("online_members").update({ seen_at: at.toISOString(), away }).eq("room_id", roomId).eq("player_id", playerId));
    },

    async touchRoom(roomId, at) {
      check(await db.from("online_rooms").update({ used_at: at.toISOString() }).eq("id", roomId));
    },

    async startMatch(match) {
      const result = await db.from("online_matches").insert({
        room_id: match.roomId,
        number: match.number,
        black_id: match.blackId,
        white_id: match.whiteId,
        starts_at: match.startsAt.toISOString(),
      });
      if (result.error?.code === UNIQUE_VIOLATION) return "exists";
      check(result);
      check(await db.from("online_rooms").update({ rematch_by: null }).eq("id", match.roomId));
      return "started";
    },

    async saveMove(matchId, expectedCount, moves, finish, at) {
      const rows = check(
        await db
          .from("online_matches")
          .update({
            moves,
            move_count: moves.length,
            ...(finish ? { finished: true, winner_id: finish.winnerId, reason: finish.reason, finished_at: at.toISOString() } : {}),
          })
          .eq("id", matchId)
          .eq("move_count", expectedCount)
          .eq("finished", false)
          .select("id"),
      );
      return rows?.length === 1 ? "saved" : "conflict";
    },

    async finishMatch(matchId, finish, at) {
      const rows = check(
        await db
          .from("online_matches")
          .update({ finished: true, winner_id: finish.winnerId, reason: finish.reason, finished_at: at.toISOString() })
          .eq("id", matchId)
          .eq("finished", false)
          .select("id"),
      );
      return rows?.length === 1 ? "finished" : "conflict";
    },

    async requestRematch(roomId, playerId) {
      check(await db.from("online_rooms").update({ rematch_by: playerId }).eq("id", roomId).is("rematch_by", null));
      const row = check(await db.from("online_rooms").select("rematch_by").eq("id", roomId).maybeSingle<{ rematch_by: string | null }>());
      return row?.rematch_by ?? null;
    },

    async blockedBetween(playerA, playerB) {
      const result = await db
        .from("online_blocks")
        .select("blocker_id", { count: "exact", head: true })
        .or(`and(blocker_id.eq.${playerA},blocked_id.eq.${playerB}),and(blocker_id.eq.${playerB},blocked_id.eq.${playerA})`);
      check(result);
      return (result.count ?? 0) > 0;
    },

    async leave(roomId, playerId, at) {
      check(await db.from("online_members").update({ left_at: at.toISOString() }).eq("room_id", roomId).eq("player_id", playerId));
      check(await db.from("online_rooms").update({ closed_at: at.toISOString(), used_at: at.toISOString() }).eq("id", roomId).is("closed_at", null));
    },

    async cleanup(now, keepDays, reportDays) {
      check(
        await db.rpc("online_cleanup", {
          p_rooms_before: new Date(now.getTime() - keepDays * DAY_MS).toISOString(),
          p_reports_before: new Date(now.getTime() - reportDays * DAY_MS).toISOString(),
        }),
      );
    },
  };
}

// Migration 10 (D153): the busiest steps in one call each. A function the
// database does not have yet answers null, and is not asked again for five
// minutes, so the handlers use their earlier steps meanwhile at the cost of
// one extra round per function instance every five minutes at most.
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
export const MISSING_RETRY_MS = 5 * 60_000;
const MISSING = Symbol("missing");

interface PollAnswerRow {
  counters: { allowed: boolean; retry_after_seconds: number }[];
  player: PlayerRow | null;
  room: RoomRow | null;
  touched: boolean;
}

export function createSupabaseOneRound(
  url: string,
  serviceRoleKey: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  now: () => number = Date.now,
): OneRoundStore {
  const key = serviceRoleKey.trim();
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withKeyHeaders(fetchImpl, key) },
  });
  const missingUntil = new Map<string, number>();

  async function call<T>(name: string, args: Record<string, unknown>): Promise<T | typeof MISSING> {
    if ((missingUntil.get(name) ?? 0) > now()) return MISSING;
    const result = await db.rpc(name, args);
    if (result.error && MISSING_FUNCTION.has(result.error.code ?? "")) {
      missingUntil.set(name, now() + MISSING_RETRY_MS);
      return MISSING;
    }
    missingUntil.delete(name);
    return check(result) as T;
  }

  return {
    async signInWithRoom(request) {
      const answer = await call<PollAnswerRow>("online_room_poll", {
        p_code: request.code,
        p_token_hash: request.tokenHash,
        p_keys: request.counters.map((counter) => counter.key),
        p_limits: request.counters.map((counter) => counter.limit),
        p_window_seconds: request.windowSeconds,
        p_now: request.now.toISOString(),
        p_away: request.away,
        p_idle_hours: request.idleHours,
      });
      if (answer === MISSING) return null;
      if (!answer || !Array.isArray(answer.counters) || answer.counters.length !== request.counters.length) throw new StoreError("badAnswer");
      return {
        counters: answer.counters.map((counter) => ({ allowed: counter.allowed === true, retryAfterSeconds: Number(counter.retry_after_seconds) })),
        player: answer.player ? toPlayer(answer.player) : null,
        room: answer.room ? toSnapshot(answer.room) : null,
        touched: answer.touched === true,
      };
    },

    async saveMoveAndUse(matchId, roomId, expectedCount, moves, finish, at) {
      const saved = await call<boolean>("online_save_move", {
        p_match: matchId,
        p_room: roomId,
        p_expected: expectedCount,
        p_moves: moves,
        p_finished: finish !== null,
        p_winner: finish?.winnerId ?? null,
        p_reason: finish?.reason ?? null,
        p_at: at.toISOString(),
      });
      if (saved === MISSING) return null;
      return saved === true ? "saved" : "conflict";
    },
  };
}
