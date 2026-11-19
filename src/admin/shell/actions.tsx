// D110: the moderator's actions, as dialog requests. Each says what it does
// and whether it can be undone; the server checks everything again.
import { isValidUsername, USERNAME_MAX } from "../../leaderboard/username";
import type { ReportRow, ReportStatus } from "../moderation";
import { SUSPEND_DAYS_MAX } from "../moderation";
import type { ActionRequest } from "./ActionDialog";

export interface Target { readonly id: string; readonly username: string }
const DAYS = [1, 3, 7, 14, 30, 90, 365] as const;

function daysField(values: Record<string, unknown>, set: (name: string, value: unknown) => void) {
  return <label className="adm-field">Length
    <select name="days" value={String(values["days"])} onChange={(event) => set("days", Number(event.target.value))}>
      {DAYS.map((days) => <option key={days} value={days}>{days === 1 ? "1 day" : `${days} days`}</option>)}
    </select>
  </label>;
}

export const suspend = (player: Target, change = false): ActionRequest => ({
  title: `${change ? "Change the suspension of" : "Suspend"} ${player.username}`,
  explain: change ? "The new length counts from now and replaces the current end. The player sees the new date." : "The player cannot play ranked games until the end date. Wins, stats and the profile are kept. You can lift it at any time.",
  op: "suspend", params: { playerId: player.id, mode: change ? "change" : "suspend" }, submit: change ? "Change suspension" : "Suspend",
  initial: { days: 7 }, fields: daysField, ready: (values) => Number(values["days"]) >= 1 && Number(values["days"]) <= SUSPEND_DAYS_MAX,
});
export const ban = (player: Target): ActionRequest => ({
  title: `Ban ${player.username} permanently`, explain: "A permanent suspension with no end date. Nothing is deleted, and you can lift it later.",
  op: "suspend", params: { playerId: player.id, mode: "ban" }, submit: "Ban permanently", danger: true,
});
export const lift = (player: Target): ActionRequest => ({
  title: `Lift the suspension of ${player.username}`, explain: "The player can play again at once.",
  op: "unsuspend", params: { playerId: player.id }, submit: "Lift suspension",
});
export const deviceBan = (player: Target, ban: boolean): ActionRequest => ({
  title: `${ban ? "Ban" : "Unban"} the device of ${player.username}`,
  explain: ban ? "The device the profile was made on cannot make a new profile. Use it against repeated new accounts." : "The device may make profiles again.",
  op: "deviceBan", params: { playerId: player.id, ban }, submit: ban ? "Ban device" : "Unban device", danger: ban,
});
export const hidePlayer = (player: Target, hidden: boolean): ActionRequest => ({
  title: `${hidden ? "Hide" : "Show"} ${player.username}`,
  explain: hidden ? "The player leaves the public leaderboard and profile pages. The username stays taken." : "The player appears in public lists again.",
  op: "hidePlayer", params: { playerId: player.id, hidden }, submit: hidden ? "Hide player" : "Show player",
});
export const hideWin = (player: Target, win: { id: string; label: string }, hidden: boolean): ActionRequest => ({
  title: `${hidden ? "Hide" : "Count again"} a win of ${player.username}`, explain: `${win.label}. ${hidden ? "The win leaves the ranking but stays recorded." : "The win counts in the ranking again."}`,
  op: "hideWin", params: { winId: win.id, hidden }, submit: hidden ? "Hide win" : "Count win",
});
export const rename = (player: Target): ActionRequest => ({
  title: `Rename ${player.username}`, explain: "Use this for a name that breaks the rules. The old name is not kept for the player, and they may choose a new name at once.",
  op: "rename", params: { playerId: player.id }, submit: "Rename", initial: { username: "" },
  fields: (values, set) => <label className="adm-field">New username
    <input name="username" maxLength={USERNAME_MAX} autoComplete="off" value={String(values["username"])} onChange={(event) => set("username", event.target.value)} />
  </label>,
  ready: (values) => isValidUsername(String(values["username"])),
});
export const resetProfile = (player: Target, field: "avatar" | "country"): ActionRequest => ({
  title: `${field === "avatar" ? "Reset the avatar of" : "Remove the flag of"} ${player.username}`,
  explain: field === "avatar" ? "The avatar goes back to the neutral picture." : "The profile shows no flag until the player chooses one.",
  op: "resetProfile", params: { playerId: player.id, field }, submit: field === "avatar" ? "Reset avatar" : "Remove flag",
});
export const deletePlayer = (player: Target): ActionRequest => ({
  title: `Delete ${player.username}`, explain: "This cannot be undone. The profile, wins, results, reports and reserved names are removed. Only the audit entry remains.",
  op: "deletePlayer", params: { playerId: player.id, confirm: true }, submit: "Delete for ever", danger: true, initial: { _typed: "" },
  fields: (values, set) => <label className="adm-field">Type the username to confirm
    <input name="typed" autoComplete="off" value={String(values["_typed"])} onChange={(event) => set("_typed", event.target.value)} />
  </label>,
  ready: (values) => values["_typed"] === player.username,
});

const STATUS_SUBMIT: Readonly<Record<ReportStatus, string>> = { open: "Open again", reviewed: "Mark reviewed", dismissed: "Dismiss", actioned: "Mark actioned" };
export const reportStatus = (report: ReportRow, status: ReportStatus): ActionRequest => ({
  title: `${STATUS_SUBMIT[status]}: report on ${report.reported}`,
  explain: status === "actioned" ? "Use this after you suspended, renamed or otherwise acted on the player." : status === "dismissed" ? "The report was not a real problem. It stays in the player's history." : status === "open" ? "The report goes back into the queue." : "You looked at it; nothing needed doing yet.",
  op: "reportStatus", params: { source: report.source, key: report.key, status }, submit: STATUS_SUBMIT[status],
});
