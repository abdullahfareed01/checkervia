// D110: suspended, banned and device banned players, from the same guarded
// players list (filtered by status), with the days left and the actions to
// change, lift or ban.
import { useState } from "react";
import type { Page, PlayerRow, PlayerStatus } from "../protocol";
import { useAdminRead } from "../useAdminRead";
import { useActions } from "./ActionDialog";
import { ban, deviceBan, lift, suspend } from "./actions";
import { date } from "./format";
import { Badge, DataTable, FlagName, number, SectionCard } from "./ui";
import type { Column } from "./ui";

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
  const columns: readonly Column<PlayerRow>[] = [
    { label: "Player", head: true, cell: (row) => <><span>{row.username}</span>{row.deviceBanned && tab !== "device" && <Badge tone="danger">Device banned</Badge>}</> },
    { label: "Flag", cell: (row) => <FlagName code={row.country} /> },
    { label: "By", cell: (row) => row.suspensionKind ? KIND[row.suspensionKind] : "Not suspended" },
    { label: "Ends", cell: (row) => <span className="adm-num adm-nowrap">{row.suspensionKind === "permanent" ? "Never" : row.suspendedUntil && daysLeft(row, now) ? date(row.suspendedUntil) : "None"}</span> },
    { label: "Days left", numeric: true, cell: (row) => daysLeft(row, now) ?? (row.suspensionKind === "permanent" ? "Permanent" : "None") },
    { label: "Reports", numeric: true, cell: (row) => number(row.reports) },
    { label: "Actions", actions: true, cell: (row) => tab === "device" ? <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("unbanDevice", row)}>Unban device</button> : <>
      {tab === "suspended" && <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("change", row)}>Change</button>}
      <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction("lift", row)}>Lift</button>
      {tab === "suspended" && <button type="button" className="adm-button adm-button-danger" onClick={() => onAction("ban", row)}>Ban</button>}
    </> },
  ];
  const name = TABS.find(([value]) => value === tab)![1];
  return <DataTable label={`${name} players`} columns={columns} rows={rows} rowKey={(row) => row.id}
    empty={tab === "device" ? { title: "No device bans.", text: "Devices banned from Players appear here, with a way to unban them.", icon: "ban" }
      : tab === "banned" ? { title: "No permanent bans.", text: "Players banned for good appear here, with a way to lift the ban.", icon: "ban" }
      : { title: "No one is suspended.", text: "Suspended players appear here with the days left, until it lifts by itself.", icon: "gavel" }} />;
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
    {actions.notice}
    <SectionCard title={`${TABS.find(([value]) => value === tab)![1]} players`} icon="gavel" flush note="Suspend a player from Players or Reports. Nothing is deleted while a player is suspended, and an expired suspension lifts by itself.">
      {result.kind === "loading" ? <p className="adm-card-status" role="status">Loading suspensions</p> : result.kind === "problem" ? <div className="adm-card-status"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try again</button></div>
        : <SuspensionTable rows={result.value.rows} tab={tab} now={new Date()} onAction={act} />}
    </SectionCard>
    {result.kind === "ok" && <>
      <nav className="adm-pagination" aria-label="Suspension pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => setCursors((before) => before.slice(0, -1))}>Previous page</button><span className="adm-num">Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!result.value.next} onClick={() => { const next = result.value.next; if (next) setCursors((before) => [...before, next]); }}>Next page</button></nav>
    </>}
    {actions.dialog}
  </section>;
}
