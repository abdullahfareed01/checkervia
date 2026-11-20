// D111: the Game Analytics pages of the owner's mockup (AI Games, Game
// Results, Activity & Retention) and Settings. The analytics pages read the
// same bounded overview as the Overview, with the same period and Export.
import type { ReactNode } from "react";
import { LEVEL_NAMES } from "../players";
import type { OverviewData } from "../analytics";
import { signOut, useSession } from "../session";
import { Chart } from "./Chart";
import { Icon } from "./icons";
import { dateTime } from "./format";
import { ThemeSwitch } from "./ThemeSwitch";
import { DataTable, number, SectionCard } from "./ui";
import type { Column } from "./ui";
import { AboutNumbers, LevelPanel, OverviewControls, ResultsPanel, StatsState, useOverview, VisitorsChart } from "./OverviewStats";
import type { Overview } from "./OverviewStats";

const days = (data: OverviewData) => data.daily.map((row) => row.day);
/** Registrations added up by week (from Monday, UTC), in order. */
export function registrationWeeks(data: OverviewData): [string, number][] {
  const weeks = new Map<string, number>();
  for (const row of data.daily) {
    const monday = new Date(`${row.day}T00:00:00.000Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0, 10);
    weeks.set(week, (weeks.get(week) ?? 0) + row.registrations);
  }
  return [...weeks];
}

function Page({ label, overview, children }: { label: string; overview: Overview; children: (data: OverviewData) => ReactNode }) {
  return <section className="adm-overview" aria-label={label} aria-busy={overview.result.kind === "loading"}>
    <OverviewControls overview={overview} />
    <StatsState overview={overview}>{children}</StatsState>
    <AboutNumbers overview={overview} />
  </section>;
}

export function LevelTable({ data }: { data: OverviewData }) {
  const keys = [["games", "Games"], ["wins", "Player wins"], ["losses", "Player losses"], ["draws", "Draws"], ["resigned", "Resigned"], ["abandoned", "Abandoned"]] as const;
  const columns: readonly Column<string>[] = [
    { label: "Level", head: true, cell: (name) => name },
    ...keys.map(([key, label]): Column<string> => ({ label, numeric: true, cell: (name) => number(data.totals.levels.find((value) => value.level === (LEVEL_NAMES as readonly string[]).indexOf(name) + 1)?.[key] ?? 0) })),
  ];
  return <SectionCard title="Games by level" icon="bars" flush>
    <DataTable label="Games against the AI in the selected period, by level" columns={columns} rows={LEVEL_NAMES} rowKey={(name) => name} empty={{ title: "No levels.", text: "Each level appears here." }} />
  </SectionCard>;
}

export function AiGames() {
  const overview = useOverview();
  return <Page label="AI games" overview={overview}>{(data) => <div className="adm-board">
    <div className="adm-span-8"><Chart title="AI games per day" icon="gamepad" labels={days(data)} series={[{ label: "Games", values: data.daily.map((row) => row.games) }]} /></div>
    <ResultsPanel data={data} className="adm-span-4" />
    <div className="adm-span-12"><LevelTable data={data} /></div>
  </div>}</Page>;
}

export function GameResults() {
  const overview = useOverview();
  return <Page label="Game results" overview={overview}>{(data) => <div className="adm-board">
    <div className="adm-span-8"><Chart title="Results per day" icon="bars" labels={days(data)} series={[
      { label: "Player wins", values: data.daily.map((row) => row.wins) },
      { label: "Player losses", values: data.daily.map((row) => row.losses) },
      { label: "Draws", values: data.daily.map((row) => row.draws) },
    ]} /></div>
    <ResultsPanel data={data} className="adm-span-4" />
    <LevelPanel data={data} className="adm-span-12" />
  </div>}</Page>;
}

export function Activity() {
  const overview = useOverview();
  return <Page label="Activity and retention" overview={overview}>{(data) => <div className="adm-board">
    <div className="adm-span-12"><VisitorsChart data={data} /></div>
    <div className="adm-span-6"><Chart title="Weekly active players" icon="users" labels={data.weekly.map((row) => row.week)} series={[{ label: "Players", values: data.weekly.map((row) => row.active) }]}
      note="Players active in each week, from Monday, UTC. The first and last week may be partial." /></div>
    <div className="adm-span-6"><Chart title="New registrations per week" icon="userPlus" labels={registrationWeeks(data).map(([week]) => week)} series={[{ label: "Registrations", values: registrationWeeks(data).map(([, n]) => n) }]}
      note="Weeks from Monday, UTC, inside the period. The first and last week may be partial." /></div>
    <div className="adm-span-12"><Chart title="Registered players" icon="trend" labels={days(data)} series={[{ label: "Profiles at day end", values: data.daily.map((row) => row.registered) }]} /></div>
  </div>}</Page>;
}

export function Settings({ email }: { email: string }) {
  const session = useSession();
  const sample = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
  return <div className="adm-board">
    <SectionCard title="Account" icon="users" className="adm-span-6">
      <dl className="adm-facts">
        <div><dt>Signed in as</dt><dd className="adm-break">{email}</dd></div>
        <div><dt>Second step</dt><dd>Authenticator verified</dd></div>
        {session.status === "signedIn" && <div><dt>Access renews</dt><dd>{dateTime(new Date(session.expiresAt * 1000).toISOString())}</dd></div>}
      </dl>
      <p className="adm-dim adm-small">You are signed out after 30 minutes without use, and after 12 hours in any case. Only the allowed admin email can open this dashboard.</p>
      <div><button type="button" className="adm-button adm-button-quiet" onClick={() => void signOut("You signed out.")}>Sign out</button></div>
    </SectionCard>
    <section className="adm-panel adm-card adm-span-6" aria-labelledby="adm-settings-look">
      <div className="adm-card-head"><h2 id="adm-settings-look" className="adm-panel-title"><Icon name="eye" />Appearance</h2></div>
      <p className="adm-dim adm-small">System follows this device's light or dark setting. Light or Dark stays on this browser only.</p>
      <ThemeSwitch labelledBy="adm-settings-look" />
    </section>
    <SectionCard title="Dashboard data" icon="database" className="adm-span-6">
      <dl className="adm-facts">
        <div><dt>Source</dt><dd>{sample ? "Sample data, for previews" : "Your game records"}</dd></div>
        <div><dt>Days</dt><dd>UTC</dd></div>
        <div><dt>Admin actions</dt><dd>Each needs a reason and is kept in the Audit Log</dd></div>
      </dl>
    </SectionCard>
  </div>;
}
