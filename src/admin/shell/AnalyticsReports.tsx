import { useState } from "react";
import type { ReactNode } from "react";
import type { OverviewPeriod, OverviewRange } from "../analytics";
import type { CountriesData, ResignedData, WinnersData } from "../reports";
import { LEVEL_NAMES } from "../players";
import { useAdminRead } from "../useAdminRead";
import type { ReadState } from "../useAdminRead";
import { Chart } from "./Chart";
import { day } from "./format";
import { Badge, countryName, DataTable, FlagName, number, SectionCard } from "./ui";
import type { Column } from "./ui";

export { countryName };
export function PeriodControls({ period, onChange }: { period: OverviewPeriod; onChange: (value: OverviewPeriod) => void }) {
  return <div className="adm-periods" role="group" aria-label="Report period">{([["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]] as const).map(([value, label]) => <button key={value} type="button" className="adm-button adm-button-quiet" aria-pressed={value === period} onClick={() => onChange(value)}>{label}</button>)}</div>;
}
function Report<T>({ result, reload, controls, children }: { result: ReadState<T>; reload: () => void; controls: ReactNode; children: (data: T) => ReactNode }) {
  return <div className="adm-overview" aria-busy={result.kind === "loading"}>
    <div className="adm-toolbar"><div className="adm-filter-actions">{controls}</div><button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}>Refresh report</button></div>
    {result.kind === "loading" ? <p role="status">Loading report</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try report again</button></div> : children(result.value)}
  </div>;
}
function WindowNote({ range, charts = false, inline = false }: { range: OverviewRange; charts?: boolean; inline?: boolean }) {
  const text = `${range.period === "all" ? "All time totals." : `Period: ${day(range.from)} through ${day(range.to)}, including today.`} Days use UTC.${charts && range.period === "all" ? " Charts show only the latest 90 days." : ""}`;
  return inline ? <>{text}</> : <p className="adm-dim adm-small">{text}</p>;
}
export function CountriesTable({ data }: { data: CountriesData }) {
  const columns: readonly Column<CountriesData["rows"][number]>[] = [
    { label: "Flag", head: true, cell: (row) => <FlagName code={row.country} /> },
    { label: "Profiles now", numeric: true, cell: (row) => number(row.players) },
    { label: "New registrations", numeric: true, cell: (row) => number(row.signups) },
    { label: "Games", numeric: true, cell: (row) => number(row.games) },
    { label: "Online devices", numeric: true, cell: (row) => number(row.onlineNow) },
  ];
  return <SectionCard title="Players by flag" icon="flag" flush note={<><WindowNote range={data.range} inline /> Profiles and online devices are current totals. Registrations and games use the selected period. Flags are chosen by players and do not identify their location. Online devices expire after 75 seconds.</>}>
    <DataTable label="Country statistics" columns={columns} rows={data.rows} rowKey={(row) => row.country ?? "none"}
      empty={{ title: "No country records in this period.", text: "Each flag players chose appears here with its profiles, registrations and games.", icon: "flag" }} />
  </SectionCard>;
}
export function Countries() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [result, reload] = useAdminRead<CountriesData>("countries", { period });
  return <section className="adm-overview" aria-label="Countries report"><Report result={result} reload={reload} controls={<PeriodControls period={period} onChange={setPeriod} />}>{(data) => <CountriesTable data={data} />}</Report></section>;
}
type Ranked = WinnersData["rows"][number];
type Top = WinnersData["top"][number];
export function WinnersTables({ data }: { data: WinnersData }) {
  const level = LEVEL_NAMES[data.level - 1];
  const ranking: readonly Column<Ranked>[] = [
    { label: "Rank", numeric: true, cell: (row) => `#${row.rank}` },
    { label: "Player", head: true, cell: (row) => row.username },
    { label: "Flag", cell: (row) => <FlagName code={row.country} /> },
    { label: "Verified wins", numeric: true, cell: (row) => number(row.wins) },
    { label: "Best", numeric: true, cell: (row) => row.bestMoves === null ? "No move count" : `${number(row.bestMoves)} moves` },
    { label: "Reported games", numeric: true, cell: (row) => number(row.games) },
  ];
  const record: readonly Column<string>[] = [
    { label: "Level", head: true, cell: (name) => name },
    ...(["wins", "losses", "draws"] as const).map((key): Column<string> => ({ label: key === "wins" ? "Player wins" : key === "losses" ? "AI wins" : "Draws", numeric: true,
      cell: (name) => number(data.levels.find((value) => value.level === (LEVEL_NAMES as readonly string[]).indexOf(name) + 1)?.[key] ?? 0) })),
  ];
  const top: readonly Column<Top>[] = [
    { label: "#", numeric: true, cell: (row) => String(data.top.indexOf(row) + 1) },
    { label: "Player", head: true, cell: (row) => <>{row.username}{row.hidden ? <> <Badge>Hidden profile</Badge></> : null}</> },
    { label: "Flag", cell: (row) => <FlagName code={row.country} /> },
    { label: "Verified wins", numeric: true, cell: (row) => number(row.wins) },
    { label: "Reported games", numeric: true, cell: (row) => number(row.games) },
  ];
  return <><WindowNote range={data.range} />
    <SectionCard title={`${level} public ranking`} icon="trophy" flush note="First 25 ranked players. Verified wins and best move counts follow the public leaderboard, including its visibility rules. Reported games are a separate count; they are not used to invent a win rate.">
      <DataTable label={`${level} ranking`} columns={ranking} rows={data.rows} rowKey={(row) => row.playerId}
        empty={{ title: "No ranked wins in this period.", text: "Players with verified wins at this level appear here, best first.", icon: "trophy" }} />
    </SectionCard>
    <SectionCard title="AI and player record" icon="bars" flush note="Reported results in the selected period. A player loss is an AI win; draws count for neither side.">
      <DataTable label="Reported results by level" columns={record} rows={LEVEL_NAMES} rowKey={(name) => name} empty={{ title: "No levels.", text: "Each level appears here." }} />
    </SectionCard>
    <SectionCard title="Top winners across all levels, all time" icon="crown" iconTone="gold" flush note="First 25 by verified wins across all history. This administrative list includes hidden profiles and does not change with the period or level above.">
      <DataTable label="Top winners, all time" columns={top} rows={data.top} rowKey={(row) => row.playerId}
        empty={{ title: "No verified wins yet.", text: "The players with the most verified wins appear here once games are won.", icon: "crown" }} />
    </SectionCard></>;
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
type Resigner = ResignedData["rows"][number];
export function ResignedTables({ data, level }: { data: ResignedData; level: number }) {
  const chart = resignationSeries(data, level);
  const totals: readonly Column<string>[] = [
    { label: "Level", head: true, cell: (name) => name },
    ...(["resigned", "abandoned", "games"] as const).map((key): Column<string> => ({ label: key === "resigned" ? "Resigned" : key === "abandoned" ? "Abandoned" : "Reported games", numeric: true,
      cell: (name) => number(data.levels.find((value) => value.level === (LEVEL_NAMES as readonly string[]).indexOf(name) + 1)?.[key] ?? 0) })),
  ];
  const players: readonly Column<Resigner>[] = [
    { label: "#", numeric: true, cell: (row) => String(data.rows.indexOf(row) + 1) },
    { label: "Player", head: true, cell: (row) => row.username },
    { label: "Flag", cell: (row) => <FlagName code={row.country} /> },
    { label: "Resigned", numeric: true, cell: (row) => number(row.resigned) },
    { label: "Abandoned", numeric: true, cell: (row) => number(row.abandoned) },
    { label: "Reported games", numeric: true, cell: (row) => number(row.games) },
  ];
  return <><WindowNote range={data.range} charts /><Chart title="Resignations and abandoned games" {...chart} note="Missing days are zero. Resignations mean pressing Resign; abandoned games remain separate." />
    <SectionCard title="Totals by level" icon="bars" flush note="Full selected period. The chart level control changes only the chart.">
      <DataTable label="Resigned and abandoned games by level" columns={totals} rows={LEVEL_NAMES} rowKey={(name) => name} empty={{ title: "No levels.", text: "Each level appears here." }} />
    </SectionCard>
    <SectionCard title="Players with most resignations" icon="exit" flush note="First 25 in the selected period, across all levels. Abandonments never increase the resignation count.">
      <DataTable label="Players with most resignations" columns={players} rows={data.rows} rowKey={(row) => row.playerId}
        empty={{ title: "No resignations in this period.", text: "Players who pressed Resign appear here, the most first.", icon: "exit" }} />
    </SectionCard></>;
}
export function Resigned() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [level, setLevel] = useState(0);
  const [result, reload] = useAdminRead<ResignedData>("resigned", { period });
  return <section className="adm-overview" aria-label="Resigned games report"><Report result={result} reload={reload} controls={<><PeriodControls period={period} onChange={setPeriod} /><label className="adm-field adm-inline-field">Chart level<select value={level} onChange={(event) => setLevel(Number(event.target.value))}><option value={0}>All levels</option>{LEVEL_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label></>}>{(data) => <ResignedTables data={data} level={level} />}</Report></section>;
}
