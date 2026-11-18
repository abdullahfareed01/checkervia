import { useEffect, useRef } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import type { PlayerDetail as Detail, PlayerReport } from "../players";
import { LEVEL_NAMES } from "../players";
import { useAdminRead } from "../useAdminRead";
import { actionLabel, date, dateTime } from "./format";

function Facts({ rows }: { rows: readonly (readonly [string, string | number])[] }) {
  return <dl className="adm-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="adm-break">{value}</dd></div>)}</dl>;
}
function Reports({ title, rows }: { title: string; rows: readonly PlayerReport[] }) {
  return <section className="adm-panel"><h3 className="adm-panel-title">{title}</h3>
    {rows.length === 0 ? <p className="adm-dim">No reports recorded.</p> : <ul className="adm-records">{rows.map((row, index) => <li key={row.key ?? row.id ?? index}>
      <div className="adm-panel-head"><strong>{row.reason}</strong><span className="adm-badge">{row.status}</span></div>
      <p className="adm-dim">{row.reporter ?? (row.source === "ai" ? "AI" : "Online room")} | {dateTime(row.created_at)}</p>
      {row.detail && <p>{row.detail}</p>}{row.review_note && <p>{row.review_note}</p>}
    </li>)}</ul>}
  </section>;
}
export function PlayerDetailContent({ detail }: { detail: Detail }) {
  const p = detail.player;
  const stats = detail.stats;
  return <div className="adm-overview">
    <div className="adm-grid">
      <section className="adm-panel"><h3 className="adm-panel-title">Profile</h3><Facts rows={[
        ["Username", p.username], ["Player ID", p.id], ["Country", p.country ? COUNTRY_NAMES[p.country] ?? p.country : "No flag"],
        ["Joined", date(p.createdAt)], ["Last seen", p.lastSeenAt ? dateTime(p.lastSeenAt) : "Not recorded"],
        ["Username changed", p.usernameChangedAt ? date(p.usernameChangedAt) : "Never"], ["Avatar", p.avatar ?? "Default"],
        ["Public profile", p.hidden ? "Hidden" : "Visible"], ["Active reports", p.reportsActive],
      ]} /></section>
      <section className="adm-panel"><h3 className="adm-panel-title">Games and verified wins</h3><Facts rows={[
        ["Verified wins", stats?.["wins"] ?? 0], ["Reported games", stats?.["games"] ?? 0], ["Losses", stats?.["losses"] ?? 0],
        ["Draws", stats?.["draws"] ?? 0], ["Resigned", stats?.["resigned"] ?? 0], ["Abandoned", stats?.["abandoned"] ?? 0],
        ...LEVEL_NAMES.map((name, index): [string, number] => [`${name} wins`, stats?.[`wins_${index + 1}`] ?? 0]),
      ]} /></section>
      <section className="adm-panel"><h3 className="adm-panel-title">Moderation status</h3><Facts rows={[
        ["Suspension", p.suspendedUntil ? p.suspensionKind === "permanent" ? "Permanent ban" : `Until ${date(p.suspendedUntil)}` : "None"],
        ["Reason", p.suspensionReason ?? "None recorded"], ["Set by", p.suspendedBy ?? "None recorded"],
        ["Last revised", p.suspensionRevisedAt ? dateTime(p.suspensionRevisedAt) : "Not recorded"],
        ["Device banned", p.deviceBanned ? "Yes" : "No"],
      ]} /><p className="adm-dim adm-small">Moderation actions are added in phase 3.</p></section>
      <section className="adm-panel"><h3 className="adm-panel-title">Device markers and reserved names</h3>
        <p className="adm-dim adm-small">Shortened markers identify devices without exposing full hashes or profile tokens.</p>
        <Facts rows={[["Profile device", p.device], ["IP marker", p.ip], ["Known devices", detail.devices.join(", ") || "None"]]} />
        {detail.reservations.length === 0 ? <p className="adm-dim">No reserved usernames.</p> : <ul>{detail.reservations.map((row) => <li key={row.username}>{row.username}, until {date(row.until)}</li>)}</ul>}
      </section>
    </div>
    <section className="adm-panel"><h3 className="adm-panel-title">Recent reported games</h3>
      <p className="adm-dim adm-small">Latest 50 games. Results are from the player's perspective. Abandoned games and resignations are distinct.</p>
      {detail.games.length === 0 ? <p className="adm-dim">No games recorded.</p> : <ul className="adm-records">{detail.games.map((game) => <li key={game.game_id}>
        <div className="adm-panel-head"><strong>{LEVEL_NAMES[game.level - 1] ?? game.level}: {game.result}</strong><time dateTime={game.created_at}>{dateTime(game.created_at)}</time></div>
        <p className="adm-break adm-dim adm-small">Game {game.game_id}{game.resigned ? ", resigned" : game.abandoned ? ", abandoned" : ""}</p>
      </li>)}</ul>}
    </section>
    <section className="adm-panel"><h3 className="adm-panel-title">Recent verified wins</h3>
      <p className="adm-dim adm-small">Latest 50 verified wins, including wins hidden from rankings.</p>
      {detail.wins.length === 0 ? <p className="adm-dim">No verified wins.</p> : <ul className="adm-records">{detail.wins.map((win) => <li key={win.id}>
        <div className="adm-panel-head"><strong>{LEVEL_NAMES[win.level - 1] ?? win.level}, {win.move_count} moves{win.hidden ? ", hidden" : ""}</strong><span>{dateTime(win.created_at)}</span></div>
        <p className="adm-break adm-dim adm-small">Win {win.id}</p>
      </li>)}</ul>}
    </section>
    <p className="adm-dim adm-small">Report lists and admin history show the latest 100 entries each.</p>
    <div className="adm-grid"><Reports title="Reports against this player" rows={detail.reportsAgainst} /><Reports title="Reports made by this player" rows={detail.reportsMade} /></div>
    <section className="adm-panel"><h3 className="adm-panel-title">Admin history</h3>
      {detail.adminHistory.length === 0 ? <p className="adm-dim">No earlier actions.</p> : <ul className="adm-records">{detail.adminHistory.map((row) => <li key={row.id}>
        <div className="adm-panel-head"><strong>{actionLabel(row.action)}</strong><span className="adm-badge">{row.outcome}</span></div>
        <p className="adm-dim">{dateTime(row.at)} | {row.admin ?? "Admin"}</p>{row.reason && <p>{row.reason}</p>}
      </li>)}</ul>}
    </section>
  </div>;
}
export function PlayerDetails({ id, onBack }: { id: string; onBack: () => void }) {
  const [result, reload] = useAdminRead<Detail>("player", { id });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [id]);
  return <section className="adm-overview" aria-label="Player details" aria-busy={result.kind === "loading"}>
    <div className="adm-panel-head"><h2 ref={heading} tabIndex={-1} className="adm-panel-title">{result.kind === "ok" ? result.value.player.username : "Player details"}</h2><button type="button" className="adm-button adm-button-quiet" onClick={onBack}>Back to players</button></div>
    <p className="adm-dim adm-small">Opening these details is recorded in the admin audit log.</p>
    {result.kind === "loading" ? <p role="status">Loading player details</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try player again</button></div> : <PlayerDetailContent detail={result.value} />}
  </section>;
}
