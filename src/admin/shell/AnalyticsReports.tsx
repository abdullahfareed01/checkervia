import { useState } from "react";
import type { ReactNode } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import type { OverviewPeriod, OverviewRange } from "../analytics";
import type { CountriesData, ResignedData, WinnersData } from "../reports";
import { LEVEL_NAMES } from "../players";
import { useAdminRead } from "../useAdminRead";
import type { ReadState } from "../useAdminRead";
import { Chart } from "./Chart";

/** A compact list table (D109): the first column names the row. */
function ListTable({ label, head, rows }: { label: string; head: readonly string[]; rows: readonly (readonly [string, ReactNode, ...ReactNode[]])[] }) {
  return <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={label}><table className="adm-data-table"><caption className="adm-sr">{label}</caption>
    <thead><tr>{head.map((name, index) => <th scope="col" key={name} className={index < 2 ? "adm-left" : undefined}>{name}</th>)}</tr></thead>
    <tbody>{rows.map(([key, first, ...rest]) => <tr key={key}><th scope="row" className="adm-left">{first}</th>{rest.map((cell, index) => <td key={index} className={index === 0 ? "adm-left" : undefined}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}
export const countryName = (country: string | null) => country ? COUNTRY_NAMES[country] ?? country : "No flag";
const number = (value: number) => value.toLocaleString("en-GB");
export function PeriodControls({ period, onChange }: { period: OverviewPeriod; onChange: (value: OverviewPeriod) => void }) {
  return <div className="adm-periods" role="group" aria-label="Report period">{([["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]] as const).map(([value, label]) => <button key={value} type="button" className="adm-button adm-button-quiet" aria-pressed={value === period} onClick={() => onChange(value)}>{label}</button>)}</div>;
}
function Report<T>({ result, reload, controls, children }: { result: ReadState<T>; reload: () => void; controls: ReactNode; children: (data: T) => ReactNode }) {
  return <div className="adm-overview" aria-busy={result.kind === "loading"}>
    <div className="adm-toolbar"><div className="adm-filter-actions">{controls}</div><button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}>Refresh report</button></div>
    {result.kind === "loading" ? <p role="status">Loading report</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try report again</button></div> : children(result.value)}
  </div>;
}
function WindowNote({ range, charts = false }: { range: OverviewRange; charts?: boolean }) {
  return <p className="adm-dim adm-small">{range.period === "all" ? "All time totals." : `Period: ${range.from} through ${range.to}, including today.`} Days use UTC.{charts && range.period === "all" ? " Charts show only the latest 90 days." : ""}</p>;
}
export function CountriesTable({ data }: { data: CountriesData }) {
  return <section className="adm-panel"><h2 className="adm-panel-title">Players by flag</h2><WindowNote range={data.range} />
    <p className="adm-dim adm-small">Profiles and online devices are current totals. Registrations and games use the selected period. Flags are chosen by players and do not identify their location. Online devices expire after 75 seconds.</p>
    {data.rows.length ? <div className="adm-table-scroll" tabIndex={0} role="region" aria-label="Country statistics"><table className="adm-data-table"><caption>Country statistics</caption><thead><tr>{["Flag", "Profiles now", "New registrations", "Games", "Online devices"].map((name) => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.country}><th scope="row">{countryName(row.country)}</th>{[row.players, row.signups, row.games, row.onlineNow].map((value, index) => <td key={index}>{number(value)}</td>)}</tr>)}</tbody></table></div> : <p>No country records in this period.</p>}
  </section>;
}
export function Countries() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [result, reload] = useAdminRead<CountriesData>("countries", { period });
  return <section className="adm-overview" aria-label="Countries report"><Report result={result} reload={reload} controls={<PeriodControls period={period} onChange={setPeriod} />}>{(data) => <CountriesTable data={data} />}</Report></section>;
}
export function WinnersTables({ data }: { data: WinnersData }) {
  return <><WindowNote range={data.range} /><section className="adm-panel"><h2 className="adm-panel-title">{LEVEL_NAMES[data.level - 1]} public ranking</h2><p className="adm-dim adm-small">First 25 ranked players. Verified wins and best move counts follow the public leaderboard, including its visibility rules. Reported games are a separate count; they are not used to invent a win rate.</p>
    {data.rows.length ? <ListTable label={`${LEVEL_NAMES[data.level - 1]} ranking`} head={["Rank", "Player", "Flag", "Verified wins", "Best", "Reported games"]}
      rows={data.rows.map((row) => [row.playerId, `#${row.rank}`, row.username, countryName(row.country), number(row.wins), row.bestMoves === null ? "No move count" : `${number(row.bestMoves)} moves`, number(row.games)])} /> : <p>No ranked wins in this period.</p>}
  </section><section className="adm-panel"><h2 className="adm-panel-title">AI and player record</h2><p className="adm-dim adm-small">Reported results in the selected period. A player loss is an AI win; draws count for neither side.</p><div className="adm-table-scroll" tabIndex={0} role="region" aria-label="Results by level"><table className="adm-data-table"><caption>Reported results by level</caption><thead><tr>{["Level", "Player wins", "AI wins", "Draws"].map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{LEVEL_NAMES.map((name, i) => { const row = data.levels.find((value) => value.level === i + 1); return <tr key={name}><th scope="row">{name}</th><td>{number(row?.wins ?? 0)}</td><td>{number(row?.losses ?? 0)}</td><td>{number(row?.draws ?? 0)}</td></tr>; })}</tbody></table></div></section>
    <section className="adm-panel"><h2 className="adm-panel-title">Top winners across all levels, all time</h2><p className="adm-dim adm-small">First 25 by verified wins across all history. This administrative list includes hidden profiles and does not change with the period or level above.</p>{data.top.length ? <ListTable label="Top winners, all time" head={["#", "Player", "Flag", "Verified wins", "Reported games"]}
      rows={data.top.map((row, index) => [row.playerId, String(index + 1), <>{row.username}{row.hidden ? <span className="adm-badge"> Hidden profile</span> : null}</>, countryName(row.country), number(row.wins), number(row.games)])} /> : <p>No verified wins yet.</p>}</section></>;
}
export function Winners() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [level, setLevel] = useState(1);
  const [result, reload] = useAdminRead<WinnersData>("winners", { period, level });
  return <section className="adm-overview" aria-label="Who is winning report"><Report result={result} reload={reload} controls={<><PeriodControls period={period} onChange={setPeriod} /><label className="adm-field adm-inline-field">Ranking level<select value={level} onChange={(event) => setLevel(Number(event.target.value))}>{LEVEL_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label></>}>{(data) => <WinnersTables data={data} />}</Report></section>;
}
export function resignationSeries(data: ResignedData, level: number) {
  const labels: string[] = [], resigned: number[] = [], abandoned: number[] = [];
  const days = new Map<string, { resigned: number; abandoned: number }>();
  for (const row of data.daily) if (level === 0 || row.level === level) {
    const current = days.get(row.day) ?? { resigned: 0, abandoned: 0 };
    days.set(row.day, { resigned: current.resigned + row.resigned, abandoned: current.abandoned + row.abandoned });
  }
  const day = new Date(`${data.range.from}T00:00:00Z`);
  while (day.toISOString().slice(0, 10) <= data.range.to) {
    const label = day.toISOString().slice(0, 10), row = days.get(label);
    labels.push(label); resigned.push(row?.resigned ?? 0); abandoned.push(row?.abandoned ?? 0);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return { labels, series: [{ label: "Resigned", values: resigned }, { label: "Abandoned", values: abandoned }] };
}
export function ResignedTables({ data, level }: { data: ResignedData; level: number }) {
  const chart = resignationSeries(data, level);
  return <><WindowNote range={data.range} charts /><Chart title="Resignations and abandoned games" {...chart} note="Missing days are zero. Resignations mean pressing Resign; abandoned games remain separate." />
    <section className="adm-panel"><h2 className="adm-panel-title">Totals by level</h2><p className="adm-dim adm-small">Full selected period. The chart level control changes only the chart.</p><div className="adm-table-scroll" tabIndex={0} role="region" aria-label="Resignations by level"><table className="adm-data-table"><caption>Resigned and abandoned games</caption><thead><tr>{["Level", "Resigned", "Abandoned", "Reported games"].map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead><tbody>{LEVEL_NAMES.map((name, i) => { const row = data.levels.find((value) => value.level === i + 1); return <tr key={name}><th scope="row">{name}</th><td>{number(row?.resigned ?? 0)}</td><td>{number(row?.abandoned ?? 0)}</td><td>{number(row?.games ?? 0)}</td></tr>; })}</tbody></table></div></section>
    <section className="adm-panel"><h2 className="adm-panel-title">Players with most resignations</h2><p className="adm-dim adm-small">First 25 in the selected period, across all levels. Abandonments never increase the resignation count.</p>{data.rows.length ? <ListTable label="Players with most resignations" head={["#", "Player", "Flag", "Resigned", "Abandoned", "Reported games"]}
      rows={data.rows.map((row, index) => [row.playerId, String(index + 1), row.username, countryName(row.country), number(row.resigned), number(row.abandoned), number(row.games)])} /> : <p>No resignations in this period.</p>}</section></>;
}
export function Resigned() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [level, setLevel] = useState(0);
  const [result, reload] = useAdminRead<ResignedData>("resigned", { period });
  return <section className="adm-overview" aria-label="Resigned games report"><Report result={result} reload={reload} controls={<><PeriodControls period={period} onChange={setPeriod} /><label className="adm-field adm-inline-field">Chart level<select value={level} onChange={(event) => setLevel(Number(event.target.value))}><option value={0}>All levels</option>{LEVEL_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label></>}>{(data) => <ResignedTables data={data} level={level} />}</Report></section>;
}
