// The overview (D103), redrawn from the owner's mockup (D111): six headline
// cards with the change on the previous window, Players & Visitors, AI game
// results, registrations, resignations, what needs attention, the last seven
// days and results by level. The period, Refresh and Export sit in the
// header. Every picture has its numbers in text or a table beside it.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { change, overviewCsv, periodSums } from "../analytics";
import type { OverviewData, OverviewPeriod } from "../analytics";
import type { ReportGroup } from "../moderation";
import { useAdminRead } from "../useAdminRead";
import type { ReadState } from "../useAdminRead";
import { Chart } from "./Chart";
import { day } from "./format";
import { PageActions, publishBadges, rememberedPeriod, rememberPeriod, useFrame } from "./frame";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { Columns, Donut, Sparkline, SplitBars } from "./Visuals";
import { number, SectionCard, StatTile } from "./ui";

export const PERIODS: readonly [OverviewPeriod, string][] = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All time"]];
const signed = (value: number) => (value > 0 ? `+${number(value)}` : value < 0 ? `−${number(-value)}` : "0");
const against = (period: OverviewPeriod) => `the previous ${period} days`;

export interface Overview {
  readonly period: OverviewPeriod;
  readonly setPeriod: (period: OverviewPeriod) => void;
  readonly result: ReadState<OverviewData>;
  readonly reload: () => void;
}
/** The overview statistics for the chosen period, shared by the analytics pages. */
export function useOverview(): Overview {
  const [period, setPeriod] = useState<OverviewPeriod>(rememberedPeriod);
  const [result, reload] = useAdminRead<OverviewData>("overview", { period });
  useEffect(() => { if (result.kind === "ok") publishBadges(result.value.totals); }, [result]);
  return { period, setPeriod: (next) => { rememberPeriod(next); setPeriod(next); }, result, reload };
}

/** Saves the shown statistics as a CSV file. */
export function downloadCsv(data: OverviewData): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([overviewCsv(data)], { type: "text/csv;charset=utf-8" }));
  link.download = `checkervia-overview-${data.range.from}-to-${data.range.to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function OverviewControls({ overview }: { overview: Overview }) {
  const { period, setPeriod, result, reload } = overview;
  return <PageActions>
    <label className="adm-select-button">
      <Icon name="calendar" /><span className="adm-sr">Statistics period</span>
      <select value={period} onChange={(event) => setPeriod(event.target.value as OverviewPeriod)}>{PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <Icon name="chevronDown" className="adm-select-chevron" />
    </label>
    <button className="adm-button adm-button-quiet" type="button" disabled={result.kind === "loading"} onClick={reload}><Icon name="refresh" /><span className="adm-button-label">Refresh</span></button>
    <button className="adm-button adm-button-quiet" type="button" disabled={result.kind !== "ok"} onClick={() => { if (result.kind === "ok") downloadCsv(result.value); }}><Icon name="download" /><span className="adm-button-label">Export</span></button>
  </PageActions>;
}

function ChangeLine({ now, before, compared }: { now: number; before: number | null | undefined; compared: string }) {
  if (before === null || before === undefined) return null;
  const { delta, percent } = change(now, before);
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return <span className={`adm-change adm-change-${tone}`} title={`Compared with ${compared}`}>
    {tone !== "flat" && <Icon name={tone === "up" ? "arrowUp" : "arrowDown"} />}
    {tone === "flat" ? "No change" : <>{signed(delta)}{percent !== null && <span className="adm-change-percent"> ({signed(percent)}%)</span>}</>}
    <span className="adm-sr"> compared with {compared}</span>
  </span>;
}

export function OverviewNumbers({ data }: { data: OverviewData }) {
  const t = data.totals, now = periodSums(data.daily), before = data.previous, compared = against(data.range.period);
  const today = data.daily.at(-1)?.day === data.range.to ? data.daily.at(-1) : undefined;
  const yesterday = today ? data.daily.at(-2) : undefined;
  return <dl className="adm-stats">
    <StatTile icon="users" label="Total Players" value={t.registered}><ChangeLine now={now.registeredEnd} before={before?.registeredEnd} compared={compared} /></StatTile>
    <StatTile icon="pulse" label="Active Today" value={today?.active ?? 0}><ChangeLine now={today?.active ?? 0} before={yesterday?.active} compared="yesterday" /></StatTile>
    <StatTile icon="wifi" label="Online Now" value={t.onlineNow}><span className="adm-live-pill"><span aria-hidden="true" />Live</span></StatTile>
    <StatTile icon="eye" label="Visitors" value={t.visitors}><ChangeLine now={now.visitors} before={before?.visitors} compared={compared} /></StatTile>
    <StatTile icon="gamepad" label="AI Games" value={t.games} tone="gold"><ChangeLine now={now.games} before={before?.games} compared={compared} /></StatTile>
    <StatTile icon="flag" label="Open Reports" value={t.openReports} tone="red">{t.openReports > 0
      ? <span className="adm-change adm-change-down adm-needs-review"><Icon name="info" />Needs review</span>
      : <span className="adm-change adm-change-up">All clear</span>}</StatTile>
  </dl>;
}

export const resultParts = (data: OverviewData) => {
  const sum = (key: "wins" | "losses" | "draws") => data.totals.levels.reduce((total, row) => total + row[key], 0);
  return [
    { label: "Player wins", value: sum("wins"), tone: "green" as const },
    { label: "Player losses", value: sum("losses"), tone: "blue" as const },
    { label: "Draws", value: sum("draws"), tone: "gold" as const },
  ];
};

function Panel({ icon, title, tone, className = "", children, extra }: { icon: IconName; title: string; tone?: "gold"; className?: string; children: ReactNode; extra?: ReactNode }) {
  return <SectionCard icon={icon} iconTone={tone} title={title} className={className} extra={extra}>{children}</SectionCard>;
}

export function ResultsPanel({ data, className }: { data: OverviewData; className?: string }) {
  return <Panel icon="bars" title="AI Game Results" className={`adm-results ${className ?? ""}`}><Donut parts={resultParts(data)} unit="Games" />
    <p className="adm-sr">Resignations and abandoned games count as player losses.</p></Panel>;
}

export function VisitorsChart({ data }: { data: OverviewData }) {
  return <Chart title="Players & Visitors" icon="users" data="hidden" labels={data.daily.map((row) => row.day)} series={[
    { label: "Visitors", values: data.daily.map((row) => row.visitors) },
    { label: "Active players", values: data.daily.map((row) => row.active) },
  ]} />;
}

export function RegistrationsPanel({ data }: { data: OverviewData }) {
  const before = data.previous;
  return <Panel icon="userPlus" title="Registrations" className="adm-registrations">
    <div className="adm-split-figure">
      <p className="adm-figure"><strong className="adm-num">{number(data.totals.newPlayers)}</strong><span>New registrations</span>
        {before ? <span className="adm-figure-note"><ChangeLine now={periodSums(data.daily).registrations} before={before.registrations} compared={against(data.range.period)} /><span aria-hidden="true" className="adm-dim"> vs. previous {data.range.period} days</span></span>
          : <span className="adm-dim adm-small">All time</span>}</p>
      {/* The running total of the period's registrations: a rising line, as in the mockup. */}
      <Sparkline values={data.daily.reduce<number[]>((sums, row) => [...sums, (sums.at(-1) ?? 0) + row.registrations], [])} />
    </div>
  </Panel>;
}

export function ResignedPanel({ data }: { data: OverviewData }) {
  return <Panel icon="exit" title="Resignations & Abandoned Games">
    <div className="adm-pair">
      <p className="adm-figure adm-figure-gold"><strong className="adm-num">{number(data.totals.resigned)}</strong><span>Resigned games</span></p>
      <p className="adm-figure adm-figure-blue"><strong className="adm-num">{number(data.totals.abandoned)}</strong><span>Abandoned games</span></p>
    </div>
  </Panel>;
}

export function NeedsAttention({ data }: { data: OverviewData }) {
  const { go } = useFrame();
  const [groups] = useAdminRead<readonly ReportGroup[]>("reportGroups", { status: "open" });
  const pending = groups.kind === "ok" ? groups.value.length : null;
  const rows: readonly [IconName, string, number | null, string, string][] = [
    ["flag", "Open reports", data.totals.openReports, "reports", "Reports waiting for a decision"],
    ["ban", "Suspended players", data.totals.suspended, "suspensions", "Suspensions and bans in force now"],
    ["clock", "Pending reviews", pending, "reports", "Players with open reports"],
  ];
  return <Panel icon="warning" tone="gold" title="Needs Attention">
    <ul className="adm-attention">{rows.map(([icon, label, count, section, help]) => <li key={label}>
      <a href={`/admin/${section}${typeof location === "undefined" ? "" : location.search}`} title={help} onClick={(event) => { event.preventDefault(); go(section); }}>
        <Icon name={icon} /><span className="adm-attention-label">{label}</span>
        <span className={`adm-count${count ? " adm-count-red" : ""}`}>{count === null ? "…" : number(count)}</span>
        <Icon name="chevronRight" className="adm-attention-go" />
      </a>
    </li>)}</ul>
  </Panel>;
}

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
export function WeekPanel({ data }: { data: OverviewData }) {
  const days = data.daily.slice(-7);
  return <Panel icon="bars" title="Weekly Active Players" className="adm-week">
    {days.length ? <Columns labels={days.map((row) => weekday.format(new Date(`${row.day}T00:00:00Z`)))} values={days.map((row) => row.active)} caption="Active players on each of the last 7 days, UTC" />
      : <p className="adm-dim">No daily records in this period.</p>}
  </Panel>;
}

export const LEVEL_ROWS: readonly [number, string, IconName][] = [[4, "Strongest", "crown"], [3, "Hard", "diamond"], [2, "Medium", "bars"], [1, "Easy", "star"]];
export function LevelPanel({ data, className }: { data: OverviewData; className?: string }) {
  return <Panel icon="bars" title="Results by Level" className={className} extra={<ul className="adm-chart-legend adm-legend-dots"><li className="adm-tone-green"><span className="adm-dot" aria-hidden="true" />Player wins</li><li className="adm-tone-blue"><span className="adm-dot" aria-hidden="true" />Player losses</li></ul>}>
    <SplitBars leftLabel="wins" rightLabel="losses" rows={LEVEL_ROWS.map(([level, label, icon]) => {
      const row = data.totals.levels.find((value) => value.level === level);
      return { label, icon, left: row?.wins ?? 0, right: row?.losses ?? 0, note: `draws ${number(row?.draws ?? 0)}` };
    })} />
  </Panel>;
}

export function OverviewCharts({ data }: { data: OverviewData }) {
  return <div className="adm-board">
    <div className="adm-span-8"><VisitorsChart data={data} /></div>
    <ResultsPanel data={data} className="adm-span-4" />
    <div className="adm-span-4"><RegistrationsPanel data={data} /></div>
    <div className="adm-span-4"><ResignedPanel data={data} /></div>
    <div className="adm-span-4"><NeedsAttention data={data} /></div>
    <div className="adm-span-5"><WeekPanel data={data} /></div>
    <LevelPanel data={data} className="adm-span-7" />
  </div>;
}

export function StatsState({ overview, children }: { overview: Overview; children: (data: OverviewData) => ReactNode }) {
  const { result, reload } = overview;
  return result.kind === "loading" ? <p className="adm-dim" role="status">Loading statistics</p>
    : result.kind === "problem" ? <div className="adm-panel"><p className="adm-problem" role="alert">{result.text}</p><button className="adm-button adm-button-quiet" type="button" onClick={reload}>Try statistics again</button></div>
    : <>{children(result.value)}</>;
}

export function AboutNumbers({ overview }: { overview: Overview }) {
  const { result, period } = overview;
  return <details className="adm-chart-data adm-notes"><summary>About these numbers</summary>
    <p className="adm-dim adm-small">{result.kind === "ok" ? `Charts: ${day(result.value.range.from)} to ${day(result.value.range.to)}, UTC. ` : ""}{period === "all" ? "All time headline totals; daily and weekly charts show the latest 90 days, and there is no earlier period to compare. " : `Arrows compare with the ${period} days before; Active Today compares with yesterday. `}Periods include today and use UTC days. Total players, online devices, open reports and suspensions are current totals. Visits are counted once per device per UTC day. Online devices are visible games refreshed every 30 seconds and expire after 75 seconds. Weekly Active Players shows each of the last 7 days. Resignations and abandoned games count as player losses.</p>
  </details>;
}

export function OverviewStats() {
  const overview = useOverview();
  return <section className="adm-overview" aria-label="Overview statistics" aria-busy={overview.result.kind === "loading"}>
    <OverviewControls overview={overview} />
    <StatsState overview={overview}>{(data) => <><OverviewNumbers data={data} /><OverviewCharts data={data} /></>}</StatsState>
    <AboutNumbers overview={overview} />
  </section>;
}
