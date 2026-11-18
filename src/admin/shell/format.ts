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
