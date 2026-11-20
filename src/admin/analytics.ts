// UTC windows for the dashboard. The caller supplies the clock so a request
// uses one consistent day, including across a midnight or year boundary.
export const OVERVIEW_PERIODS = ["7", "30", "90", "all"] as const;
export type OverviewPeriod = typeof OVERVIEW_PERIODS[number];
export interface OverviewRange {
  readonly period: OverviewPeriod;
  readonly since: string | null;
  readonly from: string;
  readonly to: string;
}
export function overviewRange(period: OverviewPeriod, now: Date): OverviewRange {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - (period === "all" ? 89 : Number(period) - 1));
  return { period, since: period === "all" ? null : from.toISOString(), from: from.toISOString().slice(0, 10), to };
}
export interface LevelTotals {
  readonly level: number;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly resigned: number;
  readonly abandoned: number;
}
export interface OverviewTotals {
  readonly registered: number;
  readonly newPlayers: number;
  readonly visitors: number;
  readonly visitorsToday: number;
  readonly onlineNow: number;
  readonly games: number;
  readonly onlineGames: number;
  readonly resigned: number;
  readonly abandoned: number;
  readonly openReports: number;
  readonly suspended: number;
  readonly levels: readonly LevelTotals[];
}
export interface DailyTotals {
  readonly day: string;
  readonly registrations: number;
  readonly deletions: number;
  readonly registered: number;
  readonly visitors: number;
  readonly active: number;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly resigned: number;
  readonly abandoned: number;
  readonly onlineGames: number;
}
export interface WeeklyActive { readonly week: string; readonly active: number }
export interface OverviewData {
  readonly range: OverviewRange;
  readonly totals: OverviewTotals;
  readonly daily: readonly DailyTotals[];
  readonly weekly: readonly WeeklyActive[];
  /** D111: the same sums for the window just before, for the change arrows; null for all time. */
  readonly previous: PeriodSums | null;
}

/** D111: what a window of daily rows adds up to. */
export interface PeriodSums {
  readonly registrations: number;
  readonly registeredEnd: number;
  readonly visitors: number;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly resigned: number;
  readonly abandoned: number;
}
export function periodSums(daily: readonly DailyTotals[]): PeriodSums {
  const sum = (key: keyof DailyTotals) => daily.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  return { registrations: sum("registrations"), registeredEnd: daily.at(-1)?.registered ?? 0, visitors: sum("visitors"), games: sum("games"),
    wins: sum("wins"), losses: sum("losses"), draws: sum("draws"), resigned: sum("resigned"), abandoned: sum("abandoned") };
}
/** The window of the same length that ends the day before; none for all time. */
export function previousRange(range: OverviewRange): { readonly from: string; readonly to: string } | null {
  if (range.period === "all") return null;
  const day = (offset: number) => { const date = new Date(`${range.from}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
  return { from: day(-Number(range.period)), to: day(-1) };
}
export interface Change { readonly delta: number; readonly percent: number | null }
/** A change and its whole percent; no percent when there was nothing before. */
export function change(current: number, previous: number): Change {
  return { delta: current - previous, percent: previous > 0 ? Math.round((current - previous) * 100 / previous) : null };
}
/** The overview's daily rows as a CSV file (numbers and dates only). */
export function overviewCsv(data: OverviewData): string {
  const columns = ["day", "registrations", "deletions", "registered", "visitors", "active", "games", "wins", "losses", "draws", "resigned", "abandoned", "onlineGames"] as const;
  return [columns.join(","), ...data.daily.map((row) => columns.map((key) => String(row[key])).join(","))].join("\r\n") + "\r\n";
}
