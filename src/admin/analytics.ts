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
}
