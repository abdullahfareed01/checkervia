// The admin store on Supabase: every call is one of migration 7's functions
// (or migration 1's rate limit), through the server's secret key, the same
// way as the leaderboard's adapter (both kinds of key, D58). Failures throw
// an error that carries only the Postgres code, never a value.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRow, PlayerRow } from "../../src/admin/protocol";
import { withKeyHeaders } from "../leaderboard/supabaseStore";
import { periodSums, previousRange } from "../../src/admin/analytics";
import type { DailyTotals, LevelTotals, OverviewTotals } from "../../src/admin/analytics";
import type { AdminStore } from "./store";
import type { LiveData, LivePlayer, ReportGroup, ReportRow } from "../../src/admin/moderation";
import { REPORT_STATUSES } from "../../src/admin/moderation";

export class AdminStoreError extends Error {
  constructor(readonly code: string) {
    super(`storage error ${code}`);
  }
}

function check<T>(result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new AdminStoreError(result.error.code ?? "unknown");
  return result.data;
}

const iso = (value: unknown): string => new Date(String(value)).toISOString();
const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));
const int = (value: unknown): number => Number(value ?? 0);
const nullableText = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
const rowsOf = (result: Parameters<typeof check>[0]): Record<string, unknown>[] => (check(result) ?? []) as Record<string, unknown>[];
const levelTotals = (row: Record<string, unknown>): LevelTotals => ({ level: int(row["level"]), games: int(row["games"]), wins: int(row["wins"]), losses: int(row["losses"]), draws: int(row["draws"]), resigned: int(row["resigned"]), abandoned: int(row["abandoned"]) });
function headlineLevels(result: Parameters<typeof check>[0]): LevelTotals[] {
  const headline = check(result) as Record<string, unknown> | null;
  if (!headline) throw new AdminStoreError("noRow");
  return ((headline["levels"] ?? []) as Record<string, unknown>[]).map(levelTotals);
}

/** A row of admin_players as the page receives it. */
export function toPlayerRow(row: Record<string, unknown>): PlayerRow {
  const kind = row["suspension_kind"];
  return {
    id: String(row["id"]),
    username: String(row["username"]),
    avatar: (row["avatar"] as string | null) ?? null,
    country: (row["country"] as string | null) ?? null,
    joinedAt: iso(row["created_at"]),
    lastActiveAt: iso(row["last_active"]),
    hidden: row["hidden"] === true,
    suspendedUntil: isoOrNull(row["suspended_until"]),
    suspensionKind: kind === "reports" || kind === "admin" || kind === "permanent" ? kind : null,
    deviceBanned: row["device_banned"] === true,
    wins: int(row["wins"]),
    winsByLevel: [int(row["wins_1"]), int(row["wins_2"]), int(row["wins_3"]), int(row["wins_4"])],
    games: int(row["games"]),
    losses: int(row["losses"]),
    draws: int(row["draws"]),
    resigned: int(row["resigned"]),
    abandoned: int(row["abandoned"]),
    reports: int(row["reports"]),
    reporters: int(row["reporters"]),
  };
}

export function toAuditRow(row: Record<string, unknown>): AuditRow {
  const outcome = row["outcome"];
  return {
    id: int(row["id"]),
    at: iso(row["at"]),
    adminEmail: (row["admin_email"] as string | null) ?? null,
    action: String(row["action"]),
    outcome: outcome === "refused" || outcome === "failed" ? outcome : "ok",
    reason: (row["reason"] as string | null) ?? null,
    targetPlayer: (row["target_player"] as string | null) ?? null,
    targetLabel: (row["target_label"] as string | null) ?? null,
    details: (row["details"] as Record<string, unknown> | null) ?? {},
  };
}

const isoArg = (date: Date | null) => date?.toISOString() ?? null;

export function toReportRow(row: Record<string, unknown>): ReportRow {
  const status = REPORT_STATUSES.find((value) => value === row["status"]) ?? "open";
  return {
    source: row["source"] === "room" ? "room" : "ai", key: String(row["key"]),
    reportedId: String(row["reported_id"]), reported: String(row["reported"]),
    reporterId: nullableText(row["reporter_id"]), reporter: String(row["reporter"] ?? "AI"),
    reason: String(row["reason"]), detail: nullableText(row["detail"]), game: nullableText(row["game"]),
    level: row["level"] == null ? null : int(row["level"]), createdAt: iso(row["created_at"]), status, reviewNote: nullableText(row["review_note"]),
  };
}

export function toReportGroup(row: Record<string, unknown>): ReportGroup {
  return {
    playerId: String(row["player_id"]), username: String(row["username"]), country: nullableText(row["country"]),
    reports: int(row["reports"]), reporters: int(row["reporters"]), open: int(row["open"]), lastAt: iso(row["last_at"]),
    suspendedUntil: isoOrNull(row["suspended_until"]), hidden: row["hidden"] === true,
  };
}

const counts = (value: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries((value ?? {}) as Record<string, unknown>).map(([key, n]) => [key, int(n)]));
const livePlayer = (value: unknown): LivePlayer => {
  const row = (value ?? {}) as Record<string, unknown>;
  return { id: String(row["id"]), username: String(row["username"]), country: nullableText(row["country"]) };
};
/** admin_live's JSON: counts only, never the board of a game in progress. */
export function toLiveData(raw: Record<string, unknown> | null): LiveData {
  if (!raw) throw new AdminStoreError("noRow");
  return {
    online: int(raw["online"]), modes: counts(raw["modes"]), levels: counts(raw["levels"]),
    countries: ((raw["countries"] ?? []) as Record<string, unknown>[]).map((row) => ({ country: String(row["country"] ?? ""), n: int(row["n"]), ai: int(row["ai"]), two: int(row["two"]), online: int(row["online"]) })),
    roomGames: ((raw["roomGames"] ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]), number: int(row["number"]), startedAt: iso(row["started_at"]), moveCount: int(row["move_count"]),
      black: livePlayer(row["black"]), white: livePlayer(row["white"]),
    })),
    rooms: raw["rooms"] === true,
  };
}

export function createSupabaseAdminStore(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): AdminStore {
  const key = serviceRoleKey.trim();
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withKeyHeaders(fetchImpl, key) },
  });

  return {
    async countries(range) {
      const rows = rowsOf(await db.rpc("admin_countries", { p_since: range.since }));
      return { range, rows: rows.map((row) => ({ country: String(row["country"] ?? ""), players: int(row["players"]), signups: int(row["signups"]), games: int(row["games"]), onlineNow: int(row["online_now"]) })) };
    },
    async winners(range, level) {
      const [ranked, top, headline] = await Promise.all([
        db.rpc("admin_rankings", { p_level: level, p_since: range.since, p_limit: 25 }),
        db.rpc("admin_top_winners", { p_limit: 25 }),
        db.rpc("admin_overview", { p_since: range.since }),
      ]);
      return { range, level, levels: headlineLevels(headline),
        rows: rowsOf(ranked).map((row) => ({ rank: int(row["rank"]), playerId: String(row["player_id"]), username: String(row["username"]), country: nullableText(row["country"]), wins: int(row["wins"]), bestMoves: row["best_moves"] == null ? null : int(row["best_moves"]), games: int(row["games"]) })),
        top: rowsOf(top).map((row) => ({ playerId: String(row["player_id"]), username: String(row["username"]), country: nullableText(row["country"]), hidden: row["hidden"] === true, wins: int(row["wins"]), games: int(row["games"]) })),
      };
    },
    async resigned(range) {
      const [headline, daily, players] = await Promise.all([
        db.rpc("admin_overview", { p_since: range.since }),
        db.rpc("admin_daily_levels", { p_from: range.from, p_to: range.to }),
        db.rpc("admin_resigners", { p_since: range.since, p_limit: 25 }),
      ]);
      return { range, levels: headlineLevels(headline),
        daily: rowsOf(daily).map((row) => ({ ...levelTotals(row), day: String(row["day"]).slice(0, 10) })),
        rows: rowsOf(players).map((row) => ({ playerId: String(row["player_id"]), username: String(row["username"]), country: nullableText(row["country"]), resigned: int(row["resigned"]), abandoned: int(row["abandoned"]), games: int(row["games"]) })),
      };
    },
    async overview(range) {
      // Each query reads summary tables. All time changes headline totals;
      // daily charts remain bounded to the last 90 days and say so in the UI.
      // D111: the window just before (same length) feeds the change arrows.
      const before = previousRange(range);
      const [headline, daily, weekly, earlier] = await Promise.all([
        db.rpc("admin_overview", { p_since: range.since }),
        db.rpc("admin_daily", { p_from: range.from, p_to: range.to }),
        db.rpc("admin_weekly_active", { p_from: range.from, p_to: range.to }),
        before ? db.rpc("admin_daily", { p_from: before.from, p_to: before.to }) : Promise.resolve(null),
      ]);
      const raw = check(headline) as Record<string, unknown> | null;
      if (!raw) throw new AdminStoreError("noRow");
      const totals: OverviewTotals = {
        registered: int(raw["registered"]), newPlayers: int(raw["newPlayers"]),
        visitors: int(raw["visitors"]), visitorsToday: int(raw["visitorsToday"]), onlineNow: int(raw["onlineNow"]),
        games: int(raw["games"]), onlineGames: int(raw["onlineGames"]),
        resigned: int(raw["resigned"]), abandoned: int(raw["abandoned"]),
        openReports: int(raw["openReports"]), suspended: int(raw["suspended"]),
        levels: ((raw["levels"] ?? []) as Record<string, unknown>[]).map((row): LevelTotals => ({
          level: int(row["level"]), games: int(row["games"]), wins: int(row["wins"]), losses: int(row["losses"]),
          draws: int(row["draws"]), resigned: int(row["resigned"]), abandoned: int(row["abandoned"]),
        })),
      };
      const days = (check(daily) ?? []) as Record<string, unknown>[];
      const weeks = (check(weekly) ?? []) as Record<string, unknown>[];
      const weekValues = new Map(weeks.map((row) => [String(row["week"]).slice(0, 10), int(row["active"])]));
      const weeklyActive = [];
      const monday = new Date(`${range.from}T00:00:00.000Z`);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      while (monday.toISOString().slice(0, 10) <= range.to) {
        const week = monday.toISOString().slice(0, 10);
        // The query omits empty weeks. Keep their zeroes so the chart does
        // not join two busy weeks across an invisible inactive week.
        weeklyActive.push({ week, active: weekValues.get(week) ?? 0 });
        monday.setUTCDate(monday.getUTCDate() + 7);
      }
      const toDaily = (row: Record<string, unknown>): DailyTotals => ({
        day: String(row["day"]).slice(0, 10), registrations: int(row["registrations"]), deletions: int(row["deletions"]),
        registered: int(row["registered"]), visitors: int(row["visitors"]), active: int(row["active"]),
        games: int(row["games"]), wins: int(row["wins"]), losses: int(row["losses"]), draws: int(row["draws"]),
        resigned: int(row["resigned"]), abandoned: int(row["abandoned"]), onlineGames: int(row["online_games"]),
      });
      return {
        range, totals,
        daily: days.map(toDaily),
        weekly: weeklyActive,
        previous: earlier ? periodSums(((check(earlier) ?? []) as Record<string, unknown>[]).map(toDaily)) : null,
      };
    },
    async hitRateLimit(rateKey, windowSeconds, limit) {
      const row = check(
        await db.rpc("hit_rate_limit", { p_key: rateKey, p_window_seconds: windowSeconds, p_limit: limit }).single<{ allowed: boolean; retry_after_seconds: number }>(),
      );
      if (!row) throw new AdminStoreError("noRow");
      return { allowed: row.allowed, retryAfterSeconds: Number(row.retry_after_seconds) };
    },

    async gate(userId, email) {
      const row = check(await db.rpc("admin_gate", { p_user: userId, p_email: email }).single<{ allowed: boolean; enroll_open: boolean }>());
      return { allowed: row?.allowed === true, enrollOpen: row?.enroll_open === true };
    },

    async closeEnrollment(userId) {
      check(await db.rpc("admin_close_enrollment", { p_user: userId }));
    },

    async log(entry) {
      check(
        await db.rpc("admin_log", {
          p_admin: entry.adminId,
          p_action: entry.action,
          p_outcome: entry.outcome,
          p_reason: entry.reason ?? null,
          p_target: entry.targetPlayer ?? null,
          p_label: entry.targetLabel ?? null,
          p_details: entry.details ?? {},
          p_ip_hash: entry.ipHash,
        }),
      );
    },

    async players(filter) {
      const rows = check(
        await db.rpc("admin_players", {
          p_search: filter.search,
          p_status: filter.status,
          p_country: filter.country,
          p_level: filter.level,
          p_joined_from: isoArg(filter.joinedFrom),
          p_joined_to: isoArg(filter.joinedTo),
          p_active_from: isoArg(filter.activeFrom),
          p_active_to: isoArg(filter.activeTo),
          p_sort: filter.sort,
          p_desc: filter.desc,
          p_after: filter.after?.value ?? null,
          p_after_id: filter.after?.id ?? null,
          p_limit: filter.limit,
        }),
      ) as Record<string, unknown>[] | null;
      return (rows ?? []).map((row) => ({ row: toPlayerRow(row), sortValue: String(row["sort_value"]) }));
    },

    async playerDetail(adminId, ipHash, playerId) {
      const detail = check(await db.rpc("admin_player_detail", { p_admin: adminId, p_ip_hash: ipHash, p_player: playerId }));
      return (detail as Record<string, unknown> | null) ?? null;
    },

    async audit(filter) {
      const rows = check(
        await db.rpc("admin_audit_page", {
          p_search: filter.search,
          p_action: filter.action,
          p_player: filter.playerId,
          p_before: filter.before,
          p_limit: filter.limit,
        }),
      ) as Record<string, unknown>[] | null;
      return (rows ?? []).map(toAuditRow);
    },

    async reports(filter) {
      const rows = rowsOf(await db.rpc("admin_reports", {
        p_status: filter.status, p_source: filter.source, p_player: filter.playerId,
        p_before: filter.before?.at ?? null, p_before_key: filter.before?.key ?? null, p_limit: filter.limit,
      }));
      return rows.map(toReportRow);
    },

    async reportGroups(status, limit) {
      return rowsOf(await db.rpc("admin_report_groups", { p_status: status, p_limit: limit })).map(toReportGroup);
    },

    async live() {
      return toLiveData(check(await db.rpc("admin_live")) as Record<string, unknown> | null);
    },

    // Every action is one migration 7 function: the change and its audit row
    // (with the reason) commit together, or neither does.
    async setReportStatus(c, source, reportKey, status) {
      return check(await db.rpc("admin_set_report_status", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_source: source, p_key: reportKey, p_status: status, p_note: c.reason })) === true;
    },
    async suspend(c, playerId, until, permanent, action) {
      const end = check(await db.rpc("admin_suspend", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_until: isoArg(until), p_permanent: permanent, p_action: action, p_reason: c.reason }));
      return isoOrNull(end);
    },
    async unsuspend(c, playerId) {
      return check(await db.rpc("admin_unsuspend", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_reason: c.reason })) === true;
    },
    async deviceBan(c, playerId, ban) {
      return check(await db.rpc("admin_device_ban", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_ban: ban, p_reason: c.reason })) === true;
    },
    async hidePlayer(c, playerId, hidden) {
      return check(await db.rpc("admin_hide_player", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_hidden: hidden, p_reason: c.reason })) === true;
    },
    async hideWin(c, winId, hidden) {
      return check(await db.rpc("admin_hide_win", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_win: winId, p_hidden: hidden, p_reason: c.reason })) === true;
    },
    async rename(c, playerId, username, usernameKey) {
      const answer = check(await db.rpc("admin_force_rename", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_username: username, p_username_key: usernameKey, p_reason: c.reason }));
      return answer === "renamed" || answer === "taken" ? answer : "notFound";
    },
    async resetProfile(c, playerId, field) {
      return check(await db.rpc("admin_reset_profile", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_field: field, p_reason: c.reason })) === true;
    },
    async deletePlayer(c, playerId) {
      return check(await db.rpc("admin_delete_player", { p_admin: c.adminId, p_ip_hash: c.ipHash, p_player: playerId, p_reason: c.reason })) === true;
    },
  };
}
