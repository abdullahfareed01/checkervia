// The admin's read only operations (phase 1, D100): the players table, one
// player's details and the audit log. Every value from the page is checked
// here before it reaches the database.
import { isCountryCode } from "../../../src/leaderboard/countries";
import { ACTION_PATTERN, PLAYER_SORTS, PLAYER_STATUSES, PLAYERS_PAGE_MAX, UUID_PATTERN, decodeCursor, encodeCursor } from "../../../src/admin/protocol";
import type { AuditRow, Page, PlayerRow, PlayerSort, PlayerStatus } from "../../../src/admin/protocol";
import { fail, invalid, ok } from "../http";
import type { AdminResponse } from "../http";
import type { AdminOperation } from "./operation";

const SEARCH_MAX = 64;

/** An optional ISO time; undefined when the value is not one. */
function time(value: unknown): Date | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.length <= max ? value : undefined;
}

/** A page cursor; null when there is none, undefined when it is not one of ours. */
function cursorOf(value: unknown): [string, string] | null | undefined {
  if (value === undefined) return null;
  return (typeof value === "string" && decodeCursor(value)) || undefined;
}

function limitOf(value: unknown, fallback: number, max: number): number | undefined {
  if (value === undefined) return fallback;
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max ? (value as number) : undefined;
}

export const playersOperation: AdminOperation = {
  kind: "read",
  keys: ["search", "status", "country", "level", "joinedFrom", "joinedTo", "activeFrom", "activeTo", "sort", "desc", "cursor", "limit"],
  async run(params, _admin, deps): Promise<AdminResponse> {
    const search = text(params["search"], SEARCH_MAX);
    const status = params["status"] === undefined ? null : PLAYER_STATUSES.includes(params["status"] as PlayerStatus) ? (params["status"] as PlayerStatus) : undefined;
    const country = params["country"] === undefined ? null : params["country"] === "none" || isCountryCode(params["country"]) ? (params["country"] as string) : undefined;
    const level = params["level"] === undefined ? null : [1, 2, 3, 4].includes(params["level"] as number) ? (params["level"] as number) : undefined;
    const sort = params["sort"] === undefined ? "joined" : PLAYER_SORTS.includes(params["sort"] as PlayerSort) ? (params["sort"] as PlayerSort) : undefined;
    const desc = params["desc"] === undefined ? true : typeof params["desc"] === "boolean" ? params["desc"] : undefined;
    const limit = limitOf(params["limit"], 50, PLAYERS_PAGE_MAX);
    const times = ["joinedFrom", "joinedTo", "activeFrom", "activeTo"].map((key) => time(params[key]));
    const cursor = cursorOf(params["cursor"]);
    if ([search, status, country, level, sort, desc, limit, cursor, ...times].includes(undefined)) return invalid();
    if (cursor && !UUID_PATTERN.test(cursor[1])) return invalid();
    if ((times[0] && times[1] && times[0] > times[1]) || (times[2] && times[3] && times[2] > times[3])) return invalid();

    const rows = await deps.store.players({
      search: search!,
      status: status!,
      country: country!,
      level: level!,
      joinedFrom: times[0]!,
      joinedTo: times[1]!,
      activeFrom: times[2]!,
      activeTo: times[3]!,
      sort: sort!,
      desc: desc!,
      after: cursor ? { value: cursor[0], id: cursor[1] } : null,
      limit: limit! + 1,
    });
    const shown = rows.slice(0, limit);
    const last = shown.at(-1);
    const page: Page<PlayerRow> = {
      rows: shown.map((entry) => entry.row),
      next: rows.length > limit! && last ? encodeCursor(last.sortValue, last.row.id) : null,
    };
    return ok(page);
  },
};

export const playerOperation: AdminOperation = {
  kind: "read",
  keys: ["id"],
  async run(params, admin, deps) {
    const id = params["id"];
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) return invalid();
    const detail = await deps.store.playerDetail(admin.id, admin.ipHash, id);
    return detail ? ok(detail) : fail(404, "notFound", "No player with this id.");
  },
};

export const auditOperation: AdminOperation = {
  kind: "read",
  keys: ["search", "action", "playerId", "cursor", "limit"],
  async run(params, _admin, deps) {
    const search = text(params["search"], SEARCH_MAX);
    const action = text(params["action"], 40);
    const playerId = text(params["playerId"], 36);
    const limit = limitOf(params["limit"], 30, 100);
    const cursor = cursorOf(params["cursor"]);
    if ([search, action, playerId, limit, cursor].includes(undefined)) return invalid();
    if ((action && !ACTION_PATTERN.test(action)) || (playerId && !UUID_PATTERN.test(playerId))) return invalid();
    const before = cursor ? Number(cursor[0]) : null;
    if (before !== null && !Number.isSafeInteger(before)) return invalid();

    const rows = await deps.store.audit({ search: search!, action: action!, playerId: playerId!, before, limit: limit! + 1 });
    const shown = rows.slice(0, limit);
    const page: Page<AuditRow> = { rows: shown, next: rows.length > limit! ? encodeCursor(shown.at(-1)!.id, "") : null };
    return ok(page);
  },
};


// Export the selected filtered page only. The same validation and page limit
// apply; do not release records if the audit entry cannot be saved.
export const playersExportOperation: AdminOperation = {
  kind: "read",
  keys: playersOperation.keys,
  async run(params, admin, deps) {
    const response = await playersOperation.run(params, admin, deps);
    if (response.status !== 200) return response;
    const page = response.body as Page<PlayerRow>;
    await deps.store.log({ adminId: admin.id, ipHash: admin.ipHash, action: "player.export", outcome: "ok",
      details: { scope: "page", rows: page.rows.length, filters: params } });
    return response;
  },
};
