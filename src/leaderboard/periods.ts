// The leaderboard's periods, all in UTC so every player sees the same board.
// A week starts on Monday at 00:00 UTC, a month on its first day at 00:00 UTC.
// Pure: the time is always passed in.

export type Period = "week" | "month" | "all";
export const PERIODS: readonly Period[] = ["week", "month", "all"];

const DAY_MS = 86_400_000;

/** When the period that contains `now` began, or null for all time. */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === "month") return new Date(Date.UTC(year, month, 1));
  // getUTCDay: Sunday is 0. Days since Monday: Monday 0 ... Sunday 6.
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month, now.getUTCDate() - sinceMonday));
}

/** When the period that contains `now` ends (the next one begins), or null for all time. */
export function periodEnd(period: Period, now: Date): Date | null {
  const start = periodStart(period, now);
  if (start === null) return null;
  if (period === "week") return new Date(start.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** "Resets in 2d 5h", "Resets in 5h 12m" or "Resets in 12m": the two largest units, rounded up. */
export function resetsInText(end: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${rest}m`;
  return `Resets in ${rest}m`;
}
