// D110: who is in a game now, from the 30 second heartbeats (a device drops
// out 75 seconds after its last one), and online room games in progress.
// Counts and names only: never the board of a game being played.
import { useEffect, useRef } from "react";
import { LEVEL_NAMES } from "../players";
import type { LiveData } from "../moderation";
import { useAdminRead } from "../useAdminRead";
import { countryName } from "./AnalyticsReports";
import { dateTime } from "./format";

const MODES: readonly [string, string][] = [["ai", "Against the AI"], ["two", "Two players, one device"], ["online", "Online rooms"]];
const count = (value: number | undefined) => (value ?? 0).toLocaleString("en-GB");

export function LiveContent({ data }: { data: LiveData }) {
  return <>
    <dl className="adm-metrics">
      <div className="adm-panel adm-metric"><dt>In a game now</dt><dd><span className="adm-metric-value adm-num">{count(data.online)}</span><span className="adm-dim adm-small">Devices, last 75 seconds</span></dd></div>
      {MODES.map(([mode, label]) => <div className="adm-panel adm-metric" key={mode}><dt>{label}</dt><dd><span className="adm-metric-value adm-num">{count(data.modes[mode])}</span></dd></div>)}
      {LEVEL_NAMES.map((name, index) => <div className="adm-panel adm-metric" key={name}><dt>AI, {name}</dt><dd><span className="adm-metric-value adm-num">{count(data.levels[String(index + 1)])}</span></dd></div>)}
    </dl>
    <div className="adm-grid">
      <section className="adm-panel" aria-labelledby="adm-live-flags"><h2 id="adm-live-flags" className="adm-panel-title">By flag</h2>
        {data.countries.length ? <div className="adm-table-scroll"><table className="adm-data-table"><caption className="adm-sr">Devices in a game now, by flag</caption>
          <thead><tr><th scope="col">Flag</th><th scope="col">Now</th><th scope="col">AI</th><th scope="col">Two players</th><th scope="col">Online</th></tr></thead>
          <tbody>{data.countries.map((row) => <tr key={row.country}><th scope="row">{countryName(row.country || null)}</th><td>{count(row.n)}</td><td>{count(row.ai)}</td><td>{count(row.two)}</td><td>{count(row.online)}</td></tr>)}</tbody>
        </table></div> : <p className="adm-dim">No one is in a game right now.</p>}
      </section>
      <section className="adm-panel" aria-labelledby="adm-live-rooms"><h2 id="adm-live-rooms" className="adm-panel-title">Online room games</h2>
        {!data.rooms ? <p className="adm-dim">Online rooms are not installed yet. Their games appear here once they are.</p>
          : data.roomGames.length ? <div className="adm-table-scroll"><table className="adm-data-table"><caption className="adm-sr">Room games in progress</caption>
            <thead><tr><th scope="col">Black</th><th scope="col" className="adm-left">White</th><th scope="col">Started</th><th scope="col">Moves</th></tr></thead>
            <tbody>{data.roomGames.map((game) => <tr key={game.id}><th scope="row">{game.black.username}</th><td className="adm-left">{game.white.username}</td><td className="adm-num">{dateTime(game.startedAt)}</td><td>{count(game.moveCount)}</td></tr>)}</tbody>
          </table></div> : <p className="adm-dim">No room games in progress.</p>}
      </section>
    </div>
  </>;
}

export function Live() {
  const [result, reload] = useAdminRead<LiveData>("live", {});
  const reloadNow = useRef(reload);
  reloadNow.current = reload;
  // Keep showing the last counts while the next ones load, so the page
  // does not flash every 30 seconds.
  const last = useRef<LiveData | null>(null);
  if (result.kind === "ok") last.current = result.value;
  // Refresh every 30 seconds, the pace of the game's heartbeats, while visible.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") reloadNow.current(); }, 30_000);
    return () => clearInterval(timer);
  }, []);
  const shown = result.kind === "ok" ? result.value : result.kind === "loading" ? last.current : null;
  return <section className="adm-overview" aria-label="Live" aria-busy={result.kind === "loading"}>
    <div className="adm-toolbar"><p className="adm-dim adm-small">Updates every 30 seconds while this page is open.</p><button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}>Refresh now</button></div>
    {shown ? <LiveContent data={shown} /> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try again</button></div> : <p role="status">Loading live play</p>}
  </section>;
}
