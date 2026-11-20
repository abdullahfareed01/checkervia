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
import { Badge, DataTable, FlagName, number, SectionCard, toneOf, When } from "./ui";
import type { Column } from "./ui";

const STATUS_LABEL: Readonly<Record<ReportStatus, string>> = { open: "Open", reviewed: "Reviewed", dismissed: "Dismissed", actioned: "Actioned" };
const NEXT: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = { open: ["reviewed", "dismissed", "actioned"], reviewed: ["dismissed", "actioned", "open"], dismissed: ["open"], actioned: ["open"] };

const suspendedNow = (row: ReportGroup) => row.suspendedUntil !== null && Date.parse(row.suspendedUntil) > Date.now();
export function ReportGroups({ rows, onShow, onSuspend, onLift }: { rows: readonly ReportGroup[]; onShow: (row: ReportGroup) => void; onSuspend: (row: ReportGroup) => void; onLift: (row: ReportGroup) => void }) {
  const columns: readonly Column<ReportGroup>[] = [
    { label: "Player", head: true, cell: (row) => <><span>{row.username}</span>{suspendedNow(row) && <Badge tone="warn">Suspended</Badge>}{row.hidden && <Badge>Hidden</Badge>}</> },
    { label: "Flag", cell: (row) => <FlagName code={row.country} /> },
    { label: "Open", numeric: true, cell: (row) => number(row.open) },
    { label: "Reports", numeric: true, cell: (row) => number(row.reports) },
    { label: "Reporters", numeric: true, cell: (row) => number(row.reporters) },
    { label: "Latest", cell: (row) => <When iso={row.lastAt} /> },
    { label: "Actions", actions: true, cell: (row) => <>
      <button type="button" className="adm-button adm-button-quiet" onClick={() => onShow(row)}>Show reports</button>
      {suspendedNow(row) ? <button type="button" className="adm-button adm-button-quiet" onClick={() => onLift(row)}>Lift</button>
        : <button type="button" className="adm-button adm-button-quiet" onClick={() => onSuspend(row)}>Suspend</button>}
    </> },
  ];
  return <DataTable label="Players with reports, most open reports first" columns={columns} rows={rows} rowKey={(row) => row.playerId}
    empty={{ title: "No players with reports in this status.", text: "Players appear here once someone reports them, the most open reports first.", icon: "shield" }} />;
}

export function ReportRows({ rows, onStatus }: { rows: readonly ReportRow[]; onStatus: (row: ReportRow, status: ReportStatus) => void }) {
  const columns: readonly Column<ReportRow>[] = [
    { label: "Reported", head: true, cell: (row) => <><span>{row.reported}</span><Badge tone={toneOf(row.status)}>{STATUS_LABEL[row.status]}</Badge></> },
    { label: "By", cell: (row) => row.source === "ai" ? "AI" : row.reporter },
    { label: "Reason", span: "half", cell: (row) => <>{row.reason === "abandoned" ? "Abandoned game" : row.reason}{row.detail ? `, ${row.detail}` : ""}{row.level ? ` (${LEVEL_NAMES[row.level - 1] ?? row.level})` : ""}{row.source === "room" && row.game ? ` (room ${row.game})` : ""}</> },
    { label: "When", cell: (row) => <When iso={row.createdAt} /> },
    { label: "Note", span: "all", cell: (row) => <span className="adm-break">{row.reviewNote ?? "None"}</span> },
    { label: "Actions", actions: true, cell: (row) => <>{NEXT[row.status].map((status) => <button key={status} type="button" className="adm-button adm-button-quiet" onClick={() => onStatus(row, status)}>{status === "open" ? "Open again" : status === "reviewed" ? "Reviewed" : status === "dismissed" ? "Dismiss" : "Actioned"}</button>)}</> },
  ];
  return <DataTable label="Reports, newest first" columns={columns} rows={rows} rowKey={(row) => `${row.source}:${row.key}`}
    empty={{ title: "No reports match these filters.", text: "New reports from games and rooms appear here, newest first.", icon: "flag" }} />;
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
    <SectionCard title="Players with reports" icon="users" flush>
      {groups.kind === "loading" ? <p className="adm-card-status" role="status">Loading players with reports</p> : groups.kind === "problem" ? <div className="adm-card-status"><p className="adm-problem" role="alert">{groups.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reloadGroups}>Try again</button></div>
        : <ReportGroups rows={groups.value} onShow={(row) => { setPlayer({ id: row.playerId, username: row.username }); restart(); }}
          onSuspend={(row) => actions.open(suspend({ id: row.playerId, username: row.username }))} onLift={(row) => actions.open(lift({ id: row.playerId, username: row.username }))} />}
    </SectionCard>
    <SectionCard title={player ? `Reports on ${player.username}` : "Reports"} icon="flag" flush
      extra={player && <button type="button" className="adm-button adm-button-quiet" onClick={() => { setPlayer(null); restart(); }}>Show all players</button>}>
      {reports.kind === "loading" ? <p className="adm-card-status" role="status">Loading reports</p> : reports.kind === "problem" ? <div className="adm-card-status"><p className="adm-problem" role="alert">{reports.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reloadReports}>Try reports again</button></div>
        : <ReportRows rows={reports.value.rows} onStatus={(row, next) => actions.open(reportStatus(row, next))} />}
    </SectionCard>
    {reports.kind === "ok" && <>
      <nav className="adm-pagination" aria-label="Report pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => setCursors((before) => before.slice(0, -1))}>Newer reports</button><span className="adm-num">Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!reports.value.next} onClick={() => { const next = reports.value.next; if (next) setCursors((before) => [...before, next]); }}>Older reports</button></nav>
    </>}
    {actions.dialog}
  </section>;
}

