// D110: the reports queue. Players with reports first (open ones on top,
// with how many different reporters), then the reports themselves, newest
// first, with the actions to review, dismiss, action or open them again.
import { useState } from "react";
import { LEVEL_NAMES } from "../players";
import type { ReportGroup, ReportRow, ReportSource, ReportStatus } from "../moderation";
import type { Page } from "../protocol";
import { useAdminRead } from "../useAdminRead";
import { useActions } from "./ActionDialog";
import { lift, reportStatus, suspend } from "./actions";
import { countryName } from "./AnalyticsReports";
import { dateTime } from "./format";

const STATUS_LABEL: Readonly<Record<ReportStatus, string>> = { open: "Open", reviewed: "Reviewed", dismissed: "Dismissed", actioned: "Actioned" };
const NEXT: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = { open: ["reviewed", "dismissed", "actioned"], reviewed: ["dismissed", "actioned", "open"], dismissed: ["open"], actioned: ["open"] };
const count = (value: number) => value.toLocaleString("en-GB");

export function ReportGroups({ rows, onShow, onSuspend, onLift }: { rows: readonly ReportGroup[]; onShow: (row: ReportGroup) => void; onSuspend: (row: ReportGroup) => void; onLift: (row: ReportGroup) => void }) {
  if (!rows.length) return <p className="adm-panel adm-dim">No players with reports in this status.</p>;
  const now = Date.now();
  return <div className="adm-panel adm-flush"><div className="adm-table-scroll"><table className="adm-data-table adm-list-table">
    <caption className="adm-sr">Players with reports, most open reports first</caption>
    <thead><tr><th scope="col" className="adm-left">Player</th><th scope="col" className="adm-left">Flag</th><th scope="col">Open</th><th scope="col">Reports</th><th scope="col">Reporters</th><th scope="col" className="adm-left">Latest</th><th scope="col"><span className="adm-sr">Actions</span></th></tr></thead>
    <tbody>{rows.map((row) => {
      const suspended = row.suspendedUntil !== null && Date.parse(row.suspendedUntil) > now;
      return <tr key={row.playerId}>
        <th scope="row" className="adm-left adm-row-head"><span>{row.username}</span>{suspended && <span className="adm-badge adm-badge-suspended">Suspended</span>}{row.hidden && <span className="adm-badge">Hidden</span>}</th>
        <td className="adm-left" data-label="Flag">{countryName(row.country)}</td>
        <td data-label="Open">{count(row.open)}</td><td data-label="Reports">{count(row.reports)}</td><td data-label="Reporters">{count(row.reporters)}</td>
        <td className="adm-left adm-num" data-label="Latest">{dateTime(row.lastAt)}</td>
        <td className="adm-cell-actions">
          <button type="button" className="adm-button adm-button-quiet" onClick={() => onShow(row)}>Show reports</button>
          {suspended ? <button type="button" className="adm-button adm-button-quiet" onClick={() => onLift(row)}>Lift</button>
            : <button type="button" className="adm-button adm-button-quiet" onClick={() => onSuspend(row)}>Suspend</button>}
        </td>
      </tr>;
    })}</tbody>
  </table></div></div>;
}

export function ReportRows({ rows, onStatus }: { rows: readonly ReportRow[]; onStatus: (row: ReportRow, status: ReportStatus) => void }) {
  if (!rows.length) return <p className="adm-panel adm-dim">No reports match these filters.</p>;
  return <div className="adm-panel adm-flush"><div className="adm-table-scroll"><table className="adm-data-table adm-list-table">
    <caption className="adm-sr">Reports, newest first</caption>
    <thead><tr><th scope="col" className="adm-left">Reported</th><th scope="col" className="adm-left">By</th><th scope="col" className="adm-left">Reason</th><th scope="col" className="adm-left">When</th><th scope="col" className="adm-left">Note</th><th scope="col"><span className="adm-sr">Actions</span></th></tr></thead>
    <tbody>{rows.map((row) => <tr key={`${row.source}:${row.key}`}>
      <th scope="row" className="adm-left adm-row-head"><span>{row.reported}</span><span className={`adm-badge adm-badge-${row.status}`}>{STATUS_LABEL[row.status]}</span></th>
      <td className="adm-left" data-label="By">{row.source === "ai" ? "AI" : row.reporter}</td>
      <td className="adm-left adm-span-2" data-label="Reason">{row.reason === "abandoned" ? "Abandoned game" : row.reason}{row.detail ? `, ${row.detail}` : ""}{row.level ? ` (${LEVEL_NAMES[row.level - 1] ?? row.level})` : ""}{row.source === "room" && row.game ? ` (room ${row.game})` : ""}</td>
      <td className="adm-left adm-num" data-label="When">{dateTime(row.createdAt)}</td>
      <td className="adm-left adm-break adm-span-all" data-label="Note">{row.reviewNote ?? "None"}</td>
      <td className="adm-cell-actions">{NEXT[row.status].map((status) => <button key={status} type="button" className="adm-button adm-button-quiet" onClick={() => onStatus(row, status)}>{status === "open" ? "Open again" : status === "reviewed" ? "Reviewed" : status === "dismissed" ? "Dismiss" : "Actioned"}</button>)}</td>
    </tr>)}</tbody>
  </table></div></div>;
}

export function Reports() {
  const [status, setStatus] = useState<ReportStatus | "all">("open");
  const [source, setSource] = useState<ReportSource | "">("");
  const [player, setPlayer] = useState<{ id: string; username: string } | null>(null);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const filters = { ...(status === "all" ? {} : { status }), ...(source ? { source } : {}), ...(player ? { playerId: player.id } : {}) };
  const [groups, reloadGroups] = useAdminRead<readonly ReportGroup[]>("reportGroups", status === "all" ? {} : { status });
  const [reports, reloadReports] = useAdminRead<Page<ReportRow>>("reports", { ...filters, limit: 25, ...(cursors.at(-1) ? { cursor: cursors.at(-1) } : {}) });
  const reload = () => { reloadGroups(); reloadReports(); };
  const actions = useActions(reload);
  const restart = () => setCursors([undefined]);
  const busy = groups.kind === "loading" || reports.kind === "loading";
  return <section className="adm-overview" aria-label="Reports" aria-busy={busy}>
    <div className="adm-toolbar">
      <div className="adm-filter-actions">
        <div className="adm-periods" role="group" aria-label="Report status">{(["open", "reviewed", "dismissed", "actioned", "all"] as const).map((value) => <button key={value} type="button" className="adm-button adm-button-quiet" aria-pressed={value === status} onClick={() => { setStatus(value); restart(); }}>{value === "all" ? "All" : STATUS_LABEL[value]}</button>)}</div>
        <label className="adm-field adm-inline-field">Source<select value={source} onChange={(event) => { setSource(event.target.value as ReportSource | ""); restart(); }}><option value="">All sources</option><option value="ai">Abandoned games (AI)</option><option value="room">Online rooms</option></select></label>
      </div>
      <button type="button" className="adm-button adm-button-quiet" disabled={busy} onClick={reload}>Refresh reports</button>
    </div>
    {actions.notice}
    <h2 className="adm-panel-title">Players with reports</h2>
    {groups.kind === "loading" ? <p role="status">Loading players with reports</p> : groups.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{groups.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reloadGroups}>Try again</button></div>
      : <ReportGroups rows={groups.value} onShow={(row) => { setPlayer({ id: row.playerId, username: row.username }); restart(); }}
        onSuspend={(row) => actions.open(suspend({ id: row.playerId, username: row.username }))} onLift={(row) => actions.open(lift({ id: row.playerId, username: row.username }))} />}
    <div className="adm-toolbar"><h2 className="adm-panel-title">{player ? `Reports on ${player.username}` : "Reports"}</h2>{player && <button type="button" className="adm-button adm-button-quiet" onClick={() => { setPlayer(null); restart(); }}>Show all players</button>}</div>
    {reports.kind === "loading" ? <p role="status">Loading reports</p> : reports.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{reports.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reloadReports}>Try reports again</button></div> : <>
      <ReportRows rows={reports.value.rows} onStatus={(row, next) => actions.open(reportStatus(row, next))} />
      <nav className="adm-pagination" aria-label="Report pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => setCursors((before) => before.slice(0, -1))}>Newer reports</button><span className="adm-num">Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!reports.value.next} onClick={() => { const next = reports.value.next; if (next) setCursors((before) => [...before, next]); }}>Older reports</button></nav>
    </>}
    {actions.dialog}
  </section>;
}

