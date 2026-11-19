import { useEffect, useState } from "react";
import { problemText } from "../api";
import type { OverviewData, OverviewPeriod } from "../analytics";
import { adminCall } from "../session";
import { Chart } from "./Chart";

const PERIODS: readonly [OverviewPeriod, string][] = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]];
type Loaded = { kind: "loading" } | { kind: "problem"; text: string } | { kind: "ok"; data: OverviewData };

export function OverviewNumbers({ data }: { data: OverviewData }) {
  const t = data.totals;
  const today = data.daily.find((row) => row.day === data.range.to);
  const metrics: readonly [string, number, string][] = [
    ["Registered players", t.registered, "Profiles now"],
    ["New registrations", t.newPlayers, "In this period"],
    ["Games against AI", t.games, "Reported in this period"],
    ["Active players today", today?.active ?? 0, "Played today, UTC"],
    ["Visitors", t.visitors, "Devices, once a day"],
    ["Online devices", t.onlineNow, "Last 75 seconds"],
    ["Open reports", t.openReports, "Awaiting review"],
    ["Suspended players", t.suspended, "Suspensions and bans now"],
    ["Resigned games", t.resigned, "Pressed Resign"],
    ["Abandoned games", t.abandoned, "Separate from resignations"],
  ];
  return <dl className="adm-metrics">{metrics.map(([label, value, help]) => <div className="adm-panel adm-metric" key={label}>
    <dt>{label}</dt><dd><span className="adm-metric-value adm-num">{value.toLocaleString("en-GB")}</span><span className="adm-dim adm-small">{help}</span></dd>
  </div>)}</dl>;
}

export function OverviewCharts({ data }: { data: OverviewData }) {
  const days = data.daily.map((row) => row.day);
  return <div className="adm-grid adm-grid-3">
    <Chart title="Registered players" labels={days} series={[{ label: "Profiles at day end", values: data.daily.map((row) => row.registered) }]} />
    <Chart title="Visitors and active players" labels={days} series={[
      { label: "Visitors", values: data.daily.map((row) => row.visitors) },
      { label: "Active players", values: data.daily.map((row) => row.active) },
    ]} />
    <Chart title="AI game results" labels={days} series={[
      { label: "Player wins", values: data.daily.map((row) => row.wins) },
      { label: "Player losses", values: data.daily.map((row) => row.losses) },
      { label: "Draws", values: data.daily.map((row) => row.draws) },
    ]} />
    <Chart title="Resignations and abandoned games" labels={days} series={[
      { label: "Resigned", values: data.daily.map((row) => row.resigned) },
      { label: "Abandoned", values: data.daily.map((row) => row.abandoned) },
    ]} />
    <Chart title="Weekly active players" labels={data.weekly.map((row) => row.week)} series={[{ label: "Players", values: data.weekly.map((row) => row.active) }]}
      note="Weeks start on Monday, UTC. Only days inside the chart period are counted; the first and last week may be partial." />
    <section className="adm-panel" aria-labelledby="adm-level-results">
      <h2 id="adm-level-results" className="adm-panel-title">Results by level</h2>
      <table className="adm-data-table"><caption>Players against the AI in the selected period. Resignations and abandoned games count as losses.</caption><thead><tr><th scope="col">Level</th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Draws</th></tr></thead>
        <tbody>{["Easy", "Medium", "Hard", "Strongest"].map((name, index) => {
          const level = data.totals.levels.find((row) => row.level === index + 1);
          return <tr key={name}><th scope="row">{name}</th><td>{(level?.wins ?? 0).toLocaleString("en-GB")}</td><td>{(level?.losses ?? 0).toLocaleString("en-GB")}</td><td>{(level?.draws ?? 0).toLocaleString("en-GB")}</td></tr>;
        })}</tbody>
      </table>
    </section>
  </div>;
}

export function OverviewStats() {
  const [period, setPeriod] = useState<OverviewPeriod>("30");
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ period: OverviewPeriod; revision: number; result: Loaded }>({ period, revision, result: { kind: "loading" } });
  // Hide the previous window immediately; ignore replies from older windows,
  // refreshes and unmounted screens (including StrictMode's first effect).
  const result: Loaded = loaded.period === period && loaded.revision === revision ? loaded.result : { kind: "loading" };
  useEffect(() => {
    let active = true;
    void adminCall<OverviewData>("overview", { period }).then((answer) => {
      if (active) setLoaded({ period, revision, result: answer.kind === "ok" ? { kind: "ok", data: answer.value } : { kind: "problem", text: problemText(answer) } });
    });
    return () => { active = false; };
  }, [period, revision]);
  return <section className="adm-overview" aria-label="Overview statistics" aria-busy={result.kind === "loading"}>
    <div className="adm-toolbar">
      <div className="adm-periods" role="group" aria-label="Statistics period">{PERIODS.map(([value, label]) => <button key={value} className="adm-button adm-button-quiet" type="button" aria-pressed={value === period} onClick={() => setPeriod(value)}>{label}</button>)}</div>
      <button className="adm-button adm-button-quiet" type="button" disabled={result.kind === "loading"} onClick={() => setRevision((value) => value + 1)}>Refresh statistics</button>
    </div>
    {result.kind === "loading" ? <p className="adm-dim" role="status">Loading statistics</p> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button className="adm-button adm-button-quiet" type="button" onClick={() => setRevision((value) => value + 1)}>Try statistics again</button></div> : <>
      <OverviewNumbers data={result.data} /><OverviewCharts data={result.data} />
    </>}
    <details className="adm-chart-data adm-notes"><summary>About these numbers</summary>
      <p className="adm-dim adm-small">{result.kind === "ok" ? `Charts: ${result.data.range.from} to ${result.data.range.to}, UTC. ` : ""}{period === "all" ? "All time headline totals; daily and weekly charts show the latest 90 days. " : ""}Periods include today and use UTC days. Registered players, online devices, open reports and suspensions are current totals. Visits are counted once per device per UTC day. Online devices are visible games refreshed every 30 seconds and expire after 75 seconds.</p>
    </details>
  </section>;
}
