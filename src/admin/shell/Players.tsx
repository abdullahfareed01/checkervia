import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import { problemText } from "../api";
import { LEVEL_NAMES, playersCsv, statusLabels } from "../players";
import { PLAYER_STATUSES, PLAYER_SORTS } from "../protocol";
import type { Page, PlayerRow, PlayersQuery, PlayerSort, PlayerStatus } from "../protocol";
import { adminCall } from "../session";
import { useAdminRead } from "../useAdminRead";
import { date, dateTime } from "./format";
import { PlayerDetails } from "./PlayerDetail";

const SORT_LABELS: Record<PlayerSort, string> = { joined: "Joined", active: "Last active", name: "Username", wins: "Verified wins", games: "Games", losses: "Losses", resigned: "Resigned", abandoned: "Abandoned", reports: "Reports" };
interface Filters { search: string; status: string; country: string; level: string; sort: PlayerSort; desc: boolean; joinedFrom: string; joinedTo: string; activeFrom: string; activeTo: string }
const defaults = (): Filters => ({ search: "", status: "", country: "", level: "", sort: "joined", desc: true, joinedFrom: "", joinedTo: "", activeFrom: "", activeTo: "" });
export function playerQuery(filters: Filters): PlayersQuery {
  const range = (value: string, end = false) => `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`;
  return { limit: 25, sort: filters.sort, desc: filters.desc,
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}), ...(filters.status ? { status: filters.status as PlayerStatus } : {}),
    ...(filters.country ? { country: filters.country } : {}), ...(filters.level ? { level: Number(filters.level) } : {}),
    ...(filters.joinedFrom ? { joinedFrom: range(filters.joinedFrom) } : {}), ...(filters.joinedTo ? { joinedTo: range(filters.joinedTo, true) } : {}),
    ...(filters.activeFrom ? { activeFrom: range(filters.activeFrom) } : {}), ...(filters.activeTo ? { activeTo: range(filters.activeTo, true) } : {}),
  };
}
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);
export function PlayerCards({ rows, now, onOpen }: { rows: readonly PlayerRow[]; now: Date; onOpen: (id: string) => void }) {
  return <ul className="adm-player-list">{rows.map((row) => <li className="adm-panel" key={row.id}>
    <div className="adm-panel-head"><button type="button" className="adm-link adm-player-name" onClick={() => onOpen(row.id)} aria-label={`View player ${row.username}`}>{row.username}</button>
      <div className="adm-player-badges">{statusLabels(row, now).map((status) => <span className="adm-badge" key={status}>{status}</span>)}</div></div>
    <p className="adm-dim adm-small">{row.country ? COUNTRY_NAMES[row.country] ?? row.country : "No flag"} | Joined {date(row.joinedAt)} | Last active {dateTime(row.lastActiveAt)}</p>
    <dl className="adm-player-stats">{[["Verified wins", row.wins], ["Games", row.games], ["Losses", row.losses], ["Draws", row.draws], ["Resigned", row.resigned], ["Abandoned", row.abandoned], ["Reports", row.reports], ["Unique reporters", row.reporters]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{Number(value).toLocaleString("en-GB")}</dd></div>)}</dl>
    <p className="adm-dim adm-small">Wins by level: {LEVEL_NAMES.map((name, index) => `${name} ${row.winsByLevel[index]}`).join(", ")}</p>
  </li>)}</ul>;
}
export function Players() {
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState<PlayersQuery>(() => playerQuery(defaults()));
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const query = { ...applied, ...(cursors.at(-1) ? { cursor: cursors.at(-1) } : {}) };
  const key = JSON.stringify(query);
  const currentKey = useRef(key); currentKey.current = key;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [result, reload] = useAdminRead<Page<PlayerRow>>("players", query);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof Filters>(name: K, value: Filters[K]) => setDraft((before) => ({ ...before, [name]: value }));
  function apply(event: FormEvent) { event.preventDefault(); setApplied(playerQuery(draft)); setCursors([undefined]); setNotice(""); }
  async function exportPage() {
    setExporting(true); setNotice("");
    const requested = key;
    const answer = await adminCall<Page<PlayerRow>>("playersExport", query);
    if (!alive.current) return;
    setExporting(false);
    if (currentKey.current !== requested) return;
    if (answer.kind !== "ok") { setNotice(problemText(answer)); return; }
    try {
      const blob = new Blob([playersCsv(answer.value.rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "checkervia-players-page.csv";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Exported ${answer.value.rows.length} players from this page. The export is in the audit log.`);
    } catch { setNotice("The download could not start. Try exporting again."); }
  }
  if (selected) return <PlayerDetails id={selected} onBack={() => { setSelected(null); requestAnimationFrame(() => heading.current?.focus()); }} />;
  return <section className="adm-overview" aria-labelledby="adm-players-heading">
    <h2 id="adm-players-heading" ref={heading} tabIndex={-1} className="adm-panel-title">Find a player</h2>
    <form className="adm-panel adm-player-filters" onSubmit={apply}>
      <label className="adm-field">Username<input name="username" type="search" maxLength={64} value={draft.search} onChange={(event) => update("search", event.target.value)} placeholder="Search usernames" /></label>
      <label className="adm-field">Status<select name="status" value={draft.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{PLAYER_STATUSES.map((status) => <option key={status} value={status}>{status === "device" ? "Device banned" : label(status)}</option>)}</select></label>
      <label className="adm-field">Country<select name="country" value={draft.country} onChange={(event) => update("country", event.target.value)}><option value="">All countries</option><option value="none">No flag</option>{Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label className="adm-field">Level<select name="level" value={draft.level} onChange={(event) => update("level", event.target.value)}><option value="">All levels</option>{LEVEL_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
      <label className="adm-field">Sort by<select name="sort" value={draft.sort} onChange={(event) => update("sort", event.target.value as PlayerSort)}>{PLAYER_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABELS[sort]}</option>)}</select></label>
      <label className="adm-field">Direction<select name="direction" value={draft.desc ? "desc" : "asc"} onChange={(event) => update("desc", event.target.value === "desc")}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <details className="adm-chart-data adm-filter-dates"><summary>Joined and active dates, UTC</summary><div className="adm-player-filters">
        {([["joinedFrom", "Joined from"], ["joinedTo", "Joined through"], ["activeFrom", "Active from"], ["activeTo", "Active through"]] as const).map(([name, text]) => <label className="adm-field" key={name}>{text}<input name={name} type="date" value={draft[name]} onChange={(event) => update(name, event.target.value)} /></label>)}
      </div></details>
      <div className="adm-filter-actions"><button type="submit" className="adm-button adm-button-primary">Apply filters</button><button type="button" className="adm-button adm-button-quiet" onClick={() => { setDraft(defaults()); setApplied(playerQuery(defaults())); setCursors([undefined]); setNotice(""); }}>Clear filters</button></div>
    </form>
    <div className="adm-panel-head"><p className="adm-dim adm-small">Up to 25 players per page. Wins are verified; games and losses are reported.</p><div className="adm-filter-actions"><button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}>Refresh players</button><button type="button" className="adm-button adm-button-quiet" disabled={exporting || result.kind !== "ok" || result.value.rows.length === 0} onClick={() => void exportPage()}>{exporting ? "Preparing export" : "Export this page"}</button></div></div>
    <p className="adm-dim adm-small" role="status">{notice}</p>
    <div aria-busy={result.kind === "loading"}>{result.kind === "loading" ? <p role="status">Loading players</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try players again</button></div> : <>
      {result.value.rows.length ? <PlayerCards rows={result.value.rows} now={new Date()} onOpen={setSelected} /> : <p className="adm-panel">No players match these filters.</p>}
      <nav className="adm-pagination" aria-label="Player pages"><button type="button" className="adm-button adm-button-quiet" disabled={cursors.length === 1} onClick={() => { setCursors((before) => before.slice(0, -1)); setNotice(""); }}>Previous page</button><span className="adm-num">Page {cursors.length}</span><button type="button" className="adm-button adm-button-quiet" disabled={!result.value.next} onClick={() => { const next = result.value.next; if (next) setCursors((before) => [...before, next]); setNotice(""); }}>Next page</button></nav>
    </>}</div>
  </section>;
}
