// Words and numbers for the dashboard: audit actions in plain words, dates
// and times in the admin's own time zone.

const ACTIONS: Readonly<Record<string, string>> = {
  "admin.enrollment": "Authenticator setup opened",
  "auth.password": "Password accepted",
  "auth.signin": "Sign in",
  "auth.code": "Authenticator code",
  "auth.enroll": "Authenticator set up",
  "auth.signout": "Signed out",
  "access.refused": "Access refused",
  "player.view": "Viewed player",
  "player.suspend": "Suspended",
  "player.extend": "Suspension changed",
  "player.ban": "Banned",
  "player.unsuspend": "Suspension lifted",
  "player.hide": "Player hidden",
  "player.unhide": "Player shown again",
  "player.rename": "Renamed",
  "player.resetavatar": "Avatar reset",
  "player.resetcountry": "Flag reset",
  "player.delete": "Player deleted",
  "player.export": "Players exported",
  "win.hide": "Win hidden",
  "win.unhide": "Win counted again",
  "device.ban": "Device banned",
  "device.unban": "Device unbanned",
  "game.replay": "Replay opened",
  "report.reviewed": "Report reviewed",
  "report.dismissed": "Report dismissed",
  "report.actioned": "Report actioned",
  "report.open": "Report opened again",
};

export const actionLabel = (action: string) => ACTIONS[action] ?? action;

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const date = (iso: string) => dateFormat.format(new Date(iso));
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** D113: a UTC day such as 2026-11-20 in words ("20 Nov 2026"), for sentences (no hyphens on screen). */
export const day = (isoDay: string) => dayFormat.format(new Date(`${isoDay}T00:00:00Z`));

/**
 * D113: a recent moment in words ("Just now", "5 min ago", "3 hours ago",
 * "Yesterday", "4 days ago"); a week or more back, or in the future, the
 * date and time instead.
 */
export function ago(iso: string, now: number = Date.now()): string {
  const seconds = (now - Date.parse(iso)) / 1000;
  if (!Number.isFinite(seconds) || seconds < -60) return dateTime(iso);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return days < 7 ? `${days} days ago` : dateTime(iso);
}
