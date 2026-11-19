// D110: suspended, banned and device banned players, from the same guarded
// players list (filtered by status), with the days left and the actions to
// change, lift or ban.
import { useState } from "react";
import type { Page, PlayerRow, PlayerStatus } from "../protocol";
import { useAdminRead } from "../useAdminRead";
import { useActions } from "./ActionDialog";
import { ban, deviceBan, lift, suspend } from "./actions";
import { countryName } from "./AnalyticsReports";
import { date } from "./format";

type Tab = Extract<PlayerStatus, "suspended" | "banned" | "device">;
const TABS: readonly [Tab, string][] = [["suspended", "Suspended"], ["banned", "Banned"], ["device", "Device banned"]];
const KIND: Readonly<Record<string, string>> = { reports: "AI reports", admin: "Moderator", permanent: "Permanent ban" };

/** Whole days left, rounded up as the player sees them; null for none or a ban. */
export function daysLeft(row: PlayerRow, now: Date): number | null {
  if (!row.suspendedUntil || row.suspensionKind === "permanent") return null;
  const left = Date.parse(row.suspendedUntil) - now.getTime();
  return left > 0 ? Math.ceil(left / 86_400_000) : null;
}

export function SuspensionTable({ rows, tab, now, onAction }: { rows: readonly PlayerRow[]; tab: Tab; now: Date; onAction: (kind: "change" | "lift" | "ban" | "unbanDevice", row: PlayerRow) => void }) {
  if (!rows.length) return <p className="adm-panel adm-dim">{tab === "device" ? "No device bans." : tab === "banned" ? "No permanent bans." : "No one is suspended."}</p>;
  return <div className="adm-panel adm-flush"><div className="adm-table-scroll"><table className="adm-data-table adm-list-table">
    <caption className="adm-sr">{TABS.find(([value]) => value === tab)![1]} players</caption>
    <thead><tr><th scope="col" className="adm-left">Player</th><th scope="col" className="adm-left">Flag</th><th scope="col" className="adm-left">By</th><th scope="col" className="adm-left">Ends</th><th scope="col">Days left</th><th scope="col">Reports</th><th scope="col"><span className="adm-sr">Actions</span></th></tr></thead>
    <tbody>{rows.map((row) => {
      const left = daysLeft(row, now);
      return <tr key={row.id}>
        <th scope="row" className="adm-left adm-row-head"><span>{row.username}</span>{row.deviceBanned && tab !== "device" && <span className="adm-badge adm-badge-banned">Device banned</span>}</th>
        <td className="adm-left" data-label="Flag">{countryName(row.country)}</td>
        <td className="adm-left" data-label="By">{row.suspensionKind ? KIND[row.suspensionKind] : "Not suspended"}</td>
        <td className="adm-left adm-num" data-label="Ends">{row.suspensionKind === "permanent" ? "Never" : row.suspendedUntil && left ? date(row.suspendedUntil) : "None"}</td>
        <td data-label="Days left">{left ?? (row.suspensionKind === "permanent" ? "Permanent" : "None")}</td>
        <td data-label="Reports">{row.reports.toLocaleString("en-GB")}</td>
        <td className="adm-cell-actions">{tab === "device" ? <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("unbanDevice", row)}>Unban device</button> : <>
          {tab === "suspended" && <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("change", row)}>Change</button>}
          <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("lift", row)}>Lift</button>
          {tab === "suspended" && <button type="button" className="adm-button adm-button-danger" onClick={() => onAction("ban", row)}>Ban</button>}
        </>}</td>
      </tr>;
    })}</tbody>
  </table></div></div>;
}

export function Suspensions() {
  const [tab, setTab] = useState<Tab>("suspended");
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [result, reload] = useAdminRead<Page<PlayerRow>>("players", { status: tab, sort: "active", desc: true, limit: 25, ...(cursors.at(-1) ? { cursor: cursors.at(-1) } : {}) });
  const actions = useActions(reload);
  const act = (kind: "change" | "lift" | "ban" | "unbanDevice", row: PlayerRow) =>
    actions.open(kind === "change" ? suspend(row, true) : kind === "lift" ? lift(row) : kind === "ban" ? ban(row) : deviceBan(row, false));
  return <section className="adm-overview" aria-label="Suspensions" aria-busy={result.kind === "loading"}>
    <div className="adm-toolbar">
      <div className="adm-periods" role="group" aria-label="Kind of restriction">{TABS.map(([value, label]) => <button key={value} type="button" className="adm-button adm-button-quiet" aria-pressed={value === tab} onClick={() => { setTab(value); setCursors([undefined]); }}>{label}</button>)}</div>
      <button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}>Refresh</button>
    </div>
    <p className="adm-dim adm-small">Suspend a player from Players or Reports. Nothing is deleted while a player is suspended, and an expired suspension lifts by itself.</p>
    {actions.notice}
    {result.kind === "loading" ? <p role="status">Loading suspensions</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try again</button></div> : <>
      <SuspensionTable rows={result.value.rows} tab={tab} now={new Date()} onAction={act} />
      <nav className="adm-pagination" aria-label="Suspension pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => setCursors((before) => before.slice(0, -1))}>Previous page</button><span className="adm-num">Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!result.value.next} onClick={() => { const next = result.value.next; if (next) setCursors((before) => [...before, next]); }}>Next page</button></nav>
    </>}
    {actions.dialog}
  </section>;
}
