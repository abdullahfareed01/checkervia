import { useEffect, useRef } from "react";
import type { PlayerDetail as Detail, PlayerReport } from "../players";
import { LEVEL_NAMES } from "../players";
import { useAdminRead } from "../useAdminRead";
import type { ActionRequest } from "./ActionDialog";
import { useActions } from "./ActionDialog";
import * as act from "./actions";
import { actionLabel, date, dateTime } from "./format";
import { Badge, countryName, DataTable, EmptyState, SectionCard, toneOf, When } from "./ui";
import type { Column } from "./ui";

function Facts({ rows }: { rows: readonly (readonly [string, string | number])[] }) {
  return <dl className="adm-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="adm-break">{value}</dd></div>)}</dl>;
}
function Reports({ title, rows }: { title: string; rows: readonly PlayerReport[] }) {
  return <SectionCard level={3} title={title} icon="flag">
    {rows.length === 0 ? <EmptyState title="No reports recorded." text="Reports appear here with their reason, who sent them and when." icon="flag" /> : <ul className="adm-records">{rows.map((row, index) => <li key={row.key ?? row.id ?? index}>
      <div className="adm-panel-head"><strong>{row.reason}</strong><Badge tone={toneOf(row.status)}>{row.status}</Badge></div>
      <p className="adm-dim">{row.reporter ?? (row.source === "ai" ? "AI" : "Online room")} | {dateTime(row.created_at)}</p>
      {row.detail && <p>{row.detail}</p>}{row.review_note && <p>{row.review_note}</p>}
    </li>)}</ul>}
  </SectionCard>;
}
/** D110: the actions that fit the player's current state; each opens the reason dialog. */
function Moderation({ detail, onAction }: { detail: Detail; onAction: (request: ActionRequest) => void }) {
  const p = detail.player, target = { id: p.id, username: p.username };
  const permanent = p.suspensionKind === "permanent";
  const suspended = !permanent && p.suspendedUntil !== null && Date.parse(p.suspendedUntil) > Date.now();
  const button = (label: string, request: ActionRequest, danger = false) =>
    <button type="button" className={`adm-button ${danger ? "adm-button-danger" : "adm-button-quiet"}`} onClick={() => onAction(request)}>{label}</button>;
  return <SectionCard level={3} title="Actions" icon="gavel" className="adm-wide" note="Each action asks for a reason and is saved in the audit log with the change.">
    <div className="adm-filter-actions">
      {suspended ? <>{button("Change suspension", act.suspend(target, true))}{button("Lift suspension", act.lift(target))}</> : permanent ? button("Lift ban", act.lift(target)) : button("Suspend", act.suspend(target))}
      {!permanent && button("Ban permanently", act.ban(target), true)}
      {button(p.deviceBanned ? "Unban device" : "Ban device", act.deviceBan(target, !p.deviceBanned))}
      {button(p.hidden ? "Show in public lists" : "Hide from public lists", act.hidePlayer(target, !p.hidden))}
      {button("Rename", act.rename(target))}
      {p.avatar && button("Reset avatar", act.resetProfile(target, "avatar"))}
      {p.country && button("Remove flag", act.resetProfile(target, "country"))}
      {button("Delete player", act.deletePlayer(target), true)}
    </div>
  </SectionCard>;
}

type Game = Detail["games"][number];
type Win = Detail["wins"][number];
export function PlayerDetailContent({ detail, onAction }: { detail: Detail; onAction?: (request: ActionRequest) => void }) {
  const p = detail.player;
  const stats = detail.stats;
  const levelName = (level: number) => LEVEL_NAMES[level - 1] ?? String(level);
  const games: readonly Column<Game>[] = [
    { label: "Level", head: true, cell: (game) => levelName(game.level) },
    { label: "Result", cell: (game) => `${game.result}${game.resigned ? ", resigned" : game.abandoned ? ", abandoned" : ""}` },
    { label: "Played", cell: (game) => <When iso={game.created_at} /> },
    { label: "Game", span: "all", cell: (game) => <span className="adm-break adm-dim">{game.game_id}</span> },
  ];
  const wins: readonly Column<Win>[] = [
    { label: "Level", head: true, cell: (win) => levelName(win.level) },
    { label: "Moves", numeric: true, cell: (win) => String(win.move_count) },
    { label: "Won", cell: (win) => <When iso={win.created_at} /> },
    { label: "Rankings", cell: (win) => win.hidden ? <Badge tone="warn">Hidden</Badge> : <Badge tone="ok">Counted</Badge> },
    { label: "Win", span: "all", cell: (win) => <span className="adm-break adm-dim">{win.id}</span> },
    ...(onAction ? [{ label: "Actions", actions: true, cell: (win: Win) => <button type="button" className="adm-button adm-button-quiet" onClick={() => onAction(act.hideWin({ id: p.id, username: p.username }, { id: win.id, label: `${levelName(win.level)} win in ${win.move_count} moves, ${dateTime(win.created_at)}` }, !win.hidden))}>{win.hidden ? "Count again" : "Hide win"}</button> }] : []),
  ];
  return <div className="adm-overview">
    <div className="adm-grid">
      {onAction && <Moderation detail={detail} onAction={onAction} />}
      <SectionCard level={3} title="Profile" icon="users"><Facts rows={[
        ["Username", p.username], ["Player ID", p.id], ["Country", countryName(p.country)],
        ["Joined", date(p.createdAt)], ["Last seen", p.lastSeenAt ? dateTime(p.lastSeenAt) : "Not recorded"],
        ["Username changed", p.usernameChangedAt ? date(p.usernameChangedAt) : "Never"], ["Avatar", p.avatar ?? "Default"],
        ["Public profile", p.hidden ? "Hidden" : "Visible"], ["Active reports", p.reportsActive],
      ]} /></SectionCard>
      <SectionCard level={3} title="Games and verified wins" icon="trophy"><Facts rows={[
        ["Verified wins", stats?.["wins"] ?? 0], ["Reported games", stats?.["games"] ?? 0], ["Losses", stats?.["losses"] ?? 0],
        ["Draws", stats?.["draws"] ?? 0], ["Resigned", stats?.["resigned"] ?? 0], ["Abandoned", stats?.["abandoned"] ?? 0],
        ...LEVEL_NAMES.map((name, index): [string, number] => [`${name} wins`, stats?.[`wins_${index + 1}`] ?? 0]),
      ]} /></SectionCard>
      <SectionCard level={3} title="Moderation status" icon="shield"><Facts rows={[
        ["Suspension", p.suspendedUntil ? p.suspensionKind === "permanent" ? "Permanent ban" : `Until ${date(p.suspendedUntil)}` : "None"],
        ["Reason", p.suspensionReason ?? "None recorded"], ["Set by", p.suspendedBy ?? "None recorded"],
        ["Last revised", p.suspensionRevisedAt ? dateTime(p.suspensionRevisedAt) : "Not recorded"],
        ["Device banned", p.deviceBanned ? "Yes" : "No"],
      ]} /></SectionCard>
      <SectionCard level={3} title="Device markers and reserved names" icon="database" note="Shortened markers identify devices without exposing full hashes or profile tokens.">
        <Facts rows={[["Profile device", p.device], ["IP marker", p.ip], ["Known devices", detail.devices.join(", ") || "None"]]} />
        {detail.reservations.length === 0 ? <p className="adm-dim">No reserved usernames.</p> : <ul>{detail.reservations.map((row) => <li key={row.username}>{row.username}, until {date(row.until)}</li>)}</ul>}
      </SectionCard>
    </div>
    <SectionCard level={3} title="Recent reported games" icon="gamepad" flush note="Latest 50 games. Results are from the player's perspective. Abandoned games and resignations are distinct.">
      <DataTable label="Recent reported games" columns={games} rows={detail.games} rowKey={(game) => game.game_id}
        empty={{ title: "No games recorded.", text: "Games this player reports appear here, newest first.", icon: "gamepad" }} />
    </SectionCard>
    <SectionCard level={3} title="Recent verified wins" icon="trophy" flush note="Latest 50 verified wins, including wins hidden from rankings.">
      <DataTable label="Recent verified wins" columns={wins} rows={detail.wins} rowKey={(win) => win.id}
        empty={{ title: "No verified wins.", text: "Each win the server verifies appears here, newest first.", icon: "trophy" }} />
    </SectionCard>
    <p className="adm-dim adm-small">Report lists and admin history show the latest 100 entries each.</p>
    <div className="adm-grid"><Reports title="Reports against this player" rows={detail.reportsAgainst} /><Reports title="Reports made by this player" rows={detail.reportsMade} /></div>
    <SectionCard level={3} title="Admin history" icon="file">
      {detail.adminHistory.length === 0 ? <EmptyState title="No earlier actions." text="Every admin action on this player appears here with its reason." icon="file" /> : <ul className="adm-records">{detail.adminHistory.map((row) => <li key={row.id}>
        <div className="adm-panel-head"><strong>{actionLabel(row.action)}</strong><Badge tone={toneOf(row.outcome)}>{row.outcome}</Badge></div>
        <p className="adm-dim">{dateTime(row.at)} | {row.admin ?? "Admin"}</p>{row.reason && <p>{row.reason}</p>}
      </li>)}</ul>}
    </SectionCard>
  </div>;
}
export function PlayerDetails({ id, onBack }: { id: string; onBack: () => void }) {
  const [result, reload] = useAdminRead<Detail>("player", { id });
  const actions = useActions(reload);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [id]);
  return <section className="adm-overview" aria-label="Player details" aria-busy={result.kind === "loading"}>
    <div className="adm-panel-head"><h2 ref={heading} tabIndex={-1} className="adm-panel-title adm-detail-title">{result.kind === "ok" ? result.value.player.username : "Player details"}</h2><button type="button" className="adm-button adm-button-quiet" onClick={onBack}>Back to players</button></div>
    <p className="adm-dim adm-small">Opening these details is recorded in the admin audit log.</p>
    {actions.notice}
    {result.kind === "loading" ? <p role="status">Loading player details</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try player again</button></div> : <PlayerDetailContent detail={result.value} onAction={actions.open} />}
    {actions.dialog}
  </section>;
}
