import { useState } from "react";
import type { FormEvent } from "react";
import type { AuditQuery, AuditRow, Page } from "../protocol";
import { useAdminRead } from "../useAdminRead";
import { actionLabel } from "./format";
import { Badge, EmptyState, toneOf, When } from "./ui";

const OUTCOME = { ok: "Done", refused: "Refused", failed: "Failed" } as const;
/** D109: one compact row per entry; the raw details open on demand. */
export function AuditRows({ rows }: { rows: readonly AuditRow[] }) {
  return rows.length ? <div className="adm-panel adm-flush"><ol className="adm-log adm-records">{rows.map((row) => <li key={row.id}>
    <Badge tone={toneOf(row.outcome)}>{OUTCOME[row.outcome]}</Badge>
    <h2 className="adm-log-title">{actionLabel(row.action)}</h2>
    <span className="adm-log-time"><When iso={row.at} /></span>
    <p className="adm-log-meta adm-break">{row.targetLabel || row.targetPlayer ? <>Player: {row.targetLabel ?? row.targetPlayer} | </> : null}Reason: {row.reason ?? "No reason recorded"} | {row.adminEmail ?? "No authenticated admin"} | Entry {row.id}</p>
    <details className="adm-chart-data"><summary>Entry details</summary><p className="adm-small adm-break">Action: {row.action} | Time: {row.at}{row.targetPlayer ? ` | Player ID: ${row.targetPlayer}` : ""}</p><pre className="adm-audit-details">{JSON.stringify(row.details, null, 2)}</pre></details>
  </li>)}</ol></div> : <div className="adm-panel adm-flush"><EmptyState title="No audit entries match these filters." text="Sign ins and admin actions appear here as they happen, newest first." icon="file" /></div>;
}
export function Audit() {
  const [search, setSearch] = useState(""), [action, setAction] = useState(""), [playerId, setPlayerId] = useState("");
  const [filters, setFilters] = useState<AuditQuery>({ limit: 25 });
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [result, reload] = useAdminRead<Page<AuditRow>>("audit", { ...filters, ...(cursors.at(-1) ? { cursor: cursors.at(-1) } : {}) });
  function apply(event: FormEvent) { event.preventDefault(); setFilters({ limit: 25, ...(search.trim() ? { search: search.trim() } : {}), ...(action.trim() ? { action: action.trim() } : {}), ...(playerId.trim() ? { playerId: playerId.trim() } : {}) }); setCursors([undefined]); }
  return <section className="adm-overview" aria-label="Audit log"><p className="adm-dim adm-small">Every recorded sign in and admin action, newest first. Entries cannot be edited or deleted. Display times follow this device; exact UTC times are in Entry details.</p>
    <form className="adm-panel adm-player-filters" onSubmit={apply}><label className="adm-field">Search audit<input name="search" type="search" value={search} maxLength={64} onChange={(event) => setSearch(event.target.value)} /></label><label className="adm-field">Exact action<input name="action" value={action} placeholder="player.view" maxLength={40} pattern="[a-z]+(\.[a-z]+)*" onChange={(event) => setAction(event.target.value)} /></label><label className="adm-field">Player ID<input name="playerId" value={playerId} maxLength={36} placeholder="Player UUID" pattern="[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}" onChange={(event) => setPlayerId(event.target.value)} /></label><div className="adm-filter-actions"><button className="adm-button adm-button-primary" type="submit">Apply audit filters</button><button className="adm-button adm-button-quiet" type="button" onClick={() => { setSearch(""); setAction(""); setPlayerId(""); setFilters({ limit: 25 }); setCursors([undefined]); }}>Clear audit filters</button></div></form>
    <div className="adm-toolbar adm-toolbar-end"><button className="adm-button adm-button-quiet" type="button" disabled={result.kind === "loading"} onClick={() => { setCursors([undefined]); reload(); }}>Refresh audit log</button></div>
    <div aria-busy={result.kind === "loading"}>{result.kind === "loading" ? <p role="status">Loading audit log</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try audit again</button></div> : <><AuditRows rows={result.value.rows} /><nav className="adm-pagination" aria-label="Audit pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => setCursors((before) => before.slice(0, -1))}>Previous entries</button><span>Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!result.value.next} onClick={() => setCursors((before) => [...before, result.value.next!])}>Older entries</button></nav></>}</div>
  </section>;
}
