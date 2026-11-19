// Phase 3 (D110): the reports queue, live play and the moderator's actions.
// Reads use the read limit. Every action is a "write" (its own, lower rate
// limit), needs a reason of 3 to 500 characters, checks every value here
// before the database, and runs one migration 7 function that saves the
// change and its audit row together. A missing target answers 404.
import { isValidUsername, usernameKey } from "../../../src/leaderboard/username";
import { REPORT_GROUPS_MAX, REPORT_SOURCES, REPORT_STATUSES, REPORTS_PAGE_MAX, RESET_FIELDS, SUSPEND_ACTION, SUSPEND_DAYS_MAX, SUSPEND_MODES, reasonOf } from "../../../src/admin/moderation";
import type { ActionResult, ReportRow, ReportSource, ReportStatus, ResetField, SuspendMode } from "../../../src/admin/moderation";
import { UUID_PATTERN, decodeCursor, encodeCursor } from "../../../src/admin/protocol";
import type { Page } from "../../../src/admin/protocol";
import { fail, invalid, ok } from "../http";
import type { AdminDeps, AdminResponse } from "../http";
import type { AdminIdentity } from "../guard";
import type { ActionContext } from "../store";
import type { AdminOperation } from "./operation";

const REPORT_KEY = /^[0-9a-f-]{36}(:[0-9a-f-]{36})?$/;
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null | undefined =>
  value === undefined ? null : list.includes(value as T) ? (value as T) : undefined;
const uuid = (value: unknown): string | undefined => (typeof value === "string" && UUID_PATTERN.test(value) ? value : undefined);
const done = (message: string) => ok({ done: true, message } satisfies ActionResult);
const gone = () => fail(404, "notFound", "That player or record no longer exists.");

export const reportsOperation: AdminOperation = {
  kind: "read",
  keys: ["status", "source", "playerId", "cursor", "limit"],
  async run(params, _admin, deps) {
    const status = oneOf(REPORT_STATUSES, params["status"]);
    const source = oneOf(REPORT_SOURCES, params["source"]);
    const playerId = params["playerId"] === undefined ? null : uuid(params["playerId"]);
    const limit = params["limit"] === undefined ? 25 : Number.isInteger(params["limit"]) && (params["limit"] as number) >= 1 && (params["limit"] as number) <= REPORTS_PAGE_MAX ? (params["limit"] as number) : undefined;
    const cursor = params["cursor"] === undefined ? null : typeof params["cursor"] === "string" ? decodeCursor(params["cursor"]) : null;
    if ([status, source, playerId, limit].includes(undefined) || (params["cursor"] !== undefined && !cursor)) return invalid();
    if (cursor && (Number.isNaN(Date.parse(cursor[0])) || !REPORT_KEY.test(cursor[1]))) return invalid();
    const rows = await deps.store.reports({ status: status!, source: source!, playerId: playerId!, before: cursor ? { at: cursor[0], key: cursor[1] } : null, limit: limit! + 1 });
    const shown = rows.slice(0, limit), last = shown.at(-1);
    const page: Page<ReportRow> = { rows: shown, next: rows.length > limit! && last ? encodeCursor(last.createdAt, last.key) : null };
    return ok(page);
  },
};

export const reportGroupsOperation: AdminOperation = {
  kind: "read",
  keys: ["status"],
  async run(params, _admin, deps) {
    const status = oneOf(REPORT_STATUSES, params["status"]);
    if (status === undefined) return invalid();
    return ok(await deps.store.reportGroups(status, REPORT_GROUPS_MAX));
  },
};

export const liveOperation: AdminOperation = {
  kind: "read",
  keys: [],
  run: async (_params, _admin, deps) => ok(await deps.store.live()),
};

/** An action: the reason is checked first, then the action's own values. */
function action(keys: readonly string[], act: (params: Record<string, unknown>, context: ActionContext, deps: AdminDeps) => Promise<AdminResponse>): AdminOperation {
  return {
    kind: "write",
    keys: [...keys, "reason"],
    async run(params, admin: AdminIdentity, deps) {
      const reason = reasonOf(params["reason"]);
      if (!reason) return fail(400, "reason", "Write a reason of 3 to 500 characters.");
      return act(params, { adminId: admin.id, ipHash: admin.ipHash, reason }, deps);
    },
  };
}

const STATUS_WORDS: Readonly<Record<ReportStatus, string>> = { open: "opened again", reviewed: "marked reviewed", dismissed: "dismissed", actioned: "marked actioned" };
export const reportStatusOperation = action(["source", "key", "status"], async (params, context, deps) => {
  const source = oneOf(REPORT_SOURCES, params["source"]), status = oneOf(REPORT_STATUSES, params["status"]);
  const reportKey = typeof params["key"] === "string" && REPORT_KEY.test(params["key"]) ? params["key"] : undefined;
  if (!source || !status || !reportKey || (source === "ai") !== reportKey.includes(":")) return invalid();
  return (await deps.store.setReportStatus(context, source as ReportSource, reportKey, status as ReportStatus)) ? done(`Report ${STATUS_WORDS[status]}.`) : gone();
});

export const suspendOperation = action(["playerId", "mode", "days"], async (params, context, deps) => {
  const playerId = uuid(params["playerId"]), mode = oneOf(SUSPEND_MODES, params["mode"]);
  const days = params["days"];
  if (!playerId || !mode) return invalid();
  const permanent = (mode as SuspendMode) === "ban";
  if (permanent ? days !== undefined : !(Number.isInteger(days) && (days as number) >= 1 && (days as number) <= SUSPEND_DAYS_MAX)) return invalid();
  const until = permanent ? null : new Date(deps.now().getTime() + (days as number) * 86_400_000);
  const end = await deps.store.suspend(context, playerId, until, permanent, SUSPEND_ACTION[mode as SuspendMode]);
  if (!end) return gone();
  return done(permanent ? "Banned permanently." : `Suspended until ${end.slice(0, 10)} (UTC).`);
});

export const unsuspendOperation = action(["playerId"], async (params, context, deps) => {
  const playerId = uuid(params["playerId"]);
  if (!playerId) return invalid();
  return (await deps.store.unsuspend(context, playerId)) ? done("Suspension lifted.") : gone();
});

/** A yes or no action on a player or a win (device ban, hide player, hide win). */
function toggle(target: "playerId" | "winId", flag: "ban" | "hidden", run: (deps: AdminDeps, context: ActionContext, id: string, on: boolean) => Promise<boolean>, words: readonly [string, string]) {
  return action([target, flag], async (params, context, deps) => {
    const id = uuid(params[target]), on = params[flag];
    if (!id || typeof on !== "boolean") return invalid();
    return (await run(deps, context, id, on)) ? done(on ? words[0] : words[1]) : gone();
  });
}
export const deviceBanOperation = toggle("playerId", "ban", (deps, c, id, on) => deps.store.deviceBan(c, id, on), ["Device banned.", "Device unbanned."]);
export const hidePlayerOperation = toggle("playerId", "hidden", (deps, c, id, on) => deps.store.hidePlayer(c, id, on), ["Player hidden from public lists.", "Player shown again."]);
export const hideWinOperation = toggle("winId", "hidden", (deps, c, id, on) => deps.store.hideWin(c, id, on), ["Win hidden from the ranking.", "Win counted again."]);

export const renameOperation = action(["playerId", "username"], async (params, context, deps) => {
  const playerId = uuid(params["playerId"]), username = params["username"];
  if (!playerId || typeof username !== "string") return invalid();
  // The game's own rules (length, letters, reserved and blocked words).
  if (!isValidUsername(username)) return fail(400, "username", "That username breaks the game's username rules.");
  const answer = await deps.store.rename(context, playerId, username, usernameKey(username));
  if (answer === "taken") return fail(409, "taken", "That username is taken or reserved.");
  return answer === "renamed" ? done(`Renamed to ${username}.`) : gone();
});

export const resetProfileOperation = action(["playerId", "field"], async (params, context, deps) => {
  const playerId = uuid(params["playerId"]), field = oneOf(RESET_FIELDS, params["field"]);
  if (!playerId || !field) return invalid();
  return (await deps.store.resetProfile(context, playerId, field as ResetField)) ? done(field === "avatar" ? "Avatar reset." : "Flag removed.") : gone();
});

// Deleting cannot be undone: the page asks for the username to be typed,
// and the request must say so explicitly.
export const deletePlayerOperation = action(["playerId", "confirm"], async (params, context, deps) => {
  const playerId = uuid(params["playerId"]);
  if (!playerId || params["confirm"] !== true) return invalid();
  return (await deps.store.deletePlayer(context, playerId)) ? done("Player deleted. The audit entry remains.") : gone();
});
