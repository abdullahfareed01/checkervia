// Phase 3 (D110): what the page and the admin functions share for reports,
// suspensions, live play and moderation actions. Pure: no server code.
import { REASON_MAX } from "./protocol";

export const REPORT_STATUSES = ["open", "reviewed", "dismissed", "actioned"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_SOURCES = ["ai", "room"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];
export const REPORTS_PAGE_MAX = 100;
export const REPORT_GROUPS_MAX = 50;

/** One report: an abandoned game reported by the AI, or a player's report in an online room. */
export interface ReportRow {
  readonly source: ReportSource;
  readonly key: string; // "player:game" for the AI's, the report id for rooms
  readonly reportedId: string;
  readonly reported: string;
  readonly reporterId: string | null;
  readonly reporter: string; // "AI" for the AI's reports
  readonly reason: string;
  readonly detail: string | null;
  readonly game: string | null;
  readonly level: number | null;
  readonly createdAt: string;
  readonly status: ReportStatus;
  readonly reviewNote: string | null;
}

/** Reports grouped by the reported player; the AI counts as one reporter. */
export interface ReportGroup {
  readonly playerId: string;
  readonly username: string;
  readonly country: string | null;
  readonly reports: number;
  readonly reporters: number;
  readonly open: number;
  readonly lastAt: string;
  readonly suspendedUntil: string | null;
  readonly hidden: boolean;
}

export interface LiveCountry { readonly country: string; readonly n: number; readonly ai: number; readonly two: number; readonly online: number }
export interface LivePlayer { readonly id: string; readonly username: string; readonly country: string | null }
export interface LiveRoomGame { readonly id: string; readonly number: number; readonly startedAt: string; readonly moveCount: number; readonly black: LivePlayer; readonly white: LivePlayer }
export interface LiveData {
  readonly online: number;
  readonly modes: Readonly<Record<string, number>>; // ai, two, online
  readonly levels: Readonly<Record<string, number>>; // "1" to "4", games against the AI
  readonly countries: readonly LiveCountry[];
  readonly roomGames: readonly LiveRoomGame[];
  readonly rooms: boolean; // online rooms are installed
}

// ---------- Actions ----------

export const REASON_MIN = 3;
/** Every action carries a reason of 3 to 500 characters, kept in the audit log. */
export function reasonOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim().replace(/\s+/g, " ");
  return reason.length >= REASON_MIN && reason.length <= REASON_MAX ? reason : null;
}

export const SUSPEND_MODES = ["suspend", "change", "ban"] as const;
export type SuspendMode = (typeof SUSPEND_MODES)[number];
export const SUSPEND_DAYS_MAX = 3650;
export const SUSPEND_ACTION: Readonly<Record<SuspendMode, string>> = { suspend: "player.suspend", change: "player.extend", ban: "player.ban" };
export const RESET_FIELDS = ["avatar", "country"] as const;
export type ResetField = (typeof RESET_FIELDS)[number];

/** The answer to every action: what changed, in words for the page. */
export interface ActionResult { readonly done: true; readonly message: string }
