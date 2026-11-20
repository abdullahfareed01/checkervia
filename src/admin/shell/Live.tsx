// D110: who is in a game now, from the 30 second heartbeats (a device drops
// out 75 seconds after its last one), and online room games in progress.
// Counts and names only: never the board of a game being played.
import { useEffect, useRef } from "react";
import { LEVEL_NAMES } from "../players";
import type { LiveCountry, LiveData, LiveRoomGame } from "../moderation";
import { useAdminRead } from "../useAdminRead";
import { PageActions } from "./frame";
import { Icon } from "./icons";
import { Breakdown, DataTable, EmptyState, FlagName, HeroTile, number, SectionCard, StatTile, TileGrid, When } from "./ui";
import type { Column } from "./ui";

const count = (value: number | undefined) => number(value ?? 0);
const FLAGS: readonly Column<LiveCountry>[] = [
  { label: "Flag", head: true, cell: (row) => <FlagName code={row.country || null} /> },
  { label: "In a game", numeric: true, cell: (row) => count(row.n) },
  { label: "Against the AI", numeric: true, cell: (row) => count(row.ai) },
  { label: "Two players", numeric: true, cell: (row) => count(row.two) },
  { label: "Online rooms", numeric: true, cell: (row) => count(row.online) },
];

/** D113: one hero number, the three ways to play under it (the AI levels inside their tile), then the tables. */
export function LiveContent({ data, now }: { data: LiveData; now?: number }) {
  const rooms: readonly Column<LiveRoomGame>[] = [
    { label: "Black", head: true, cell: (game) => game.black.username },
    { label: "White", cell: (game) => game.white.username },
    { label: "Started", cell: (game) => <When iso={game.startedAt} now={now} /> },
    { label: "Moves", numeric: true, cell: (game) => count(game.moveCount) },
  ];
  return <>
    <HeroTile icon="live" label="In a game now" value={data.online}
      note={`${count(data.online)} ${data.online === 1 ? "device" : "devices"}, last seen within 75 seconds`}
      aside={<><span className="adm-live-pill"><span aria-hidden="true" />Live</span><span className="adm-hero-meta">Updates every 30 seconds while this page is open.</span></>} />
    <TileGrid className="adm-tiles">
      <StatTile icon="gamepad" label="Against the AI" value={data.modes["ai"] ?? 0} className="adm-tile-wide">
        <Breakdown label="Against the AI by level" parts={LEVEL_NAMES.map((name, index) => ({ label: name, value: data.levels[String(index + 1)] ?? 0 }))} />
      </StatTile>
      <StatTile icon="users" label="Two players, one device" value={data.modes["two"] ?? 0} />
      <StatTile icon="wifi" label="Online rooms" value={data.modes["online"] ?? 0} />
    </TileGrid>
    <div className="adm-grid">
      <SectionCard title="By flag" icon="flag" flush>
        <DataTable label="Devices in a game now, by flag" columns={FLAGS} rows={data.countries} rowKey={(row) => row.country || "none"}
          empty={{ title: "No one is in a game right now.", text: "Each device in a game shows here under its chosen flag within 30 seconds.", icon: "live" }} />
      </SectionCard>
      <SectionCard title="Online room games" icon="wifi" flush>
        {!data.rooms ? <EmptyState title="Online rooms are not installed yet." text="Their games appear here once they are." />
          : <DataTable label="Room games in progress" columns={rooms} rows={data.roomGames} rowKey={(game) => game.id}
            empty={{ title: "No room games in progress.", text: "Games in online rooms appear here while they are being played.", icon: "wifi" }} />}
      </SectionCard>
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
    <PageActions><button type="button" className="adm-button adm-button-quiet" disabled={result.kind === "loading"} onClick={reload}><Icon name="refresh" /><span className="adm-button-label">Refresh now</span></button></PageActions>
    {shown ? <LiveContent data={shown} /> : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button type="button" className="adm-button adm-button-quiet" onClick={reload}>Try again</button></div> : <p role="status">Loading live play</p>}
  </section>;
}
