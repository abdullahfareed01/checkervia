// What the admin page and the admin functions send each other (D100).
// Shared so both sides agree on the shapes and limits. Pure: no secrets,
// no server code. The page talks only to /.netlify/functions/admin-auth
// (signing in) and /.netlify/functions/admin-api (everything else).

export const ADMIN_AUTH_PATH = "/.netlify/functions/admin-auth";
export const ADMIN_API_PATH = "/.netlify/functions/admin-api";

// Every request from the page carries this header. A page on another site
// cannot add it without the browser asking first (and the functions never
// say yes), so a forged request from elsewhere is refused.
export const ADMIN_MARKER_HEADER = "x-checkervia-admin";
export const ADMIN_MARKER_VALUE = "1";

// A sign in lasts at most 12 hours from the second factor; the page also
// signs out after 30 minutes without use.
export const SESSION_HOURS = 12;
export const IDLE_MINUTES = 30;

export const TOTP_CODE_PATTERN = /^[0-9]{6}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const REASON_MAX = 500;

export type AuthAction = "signIn" | "enroll" | "verify" | "refresh" | "signOut";

/** After the password: set up an authenticator, or type its code. */
export interface SignInStep {
  readonly step: "enroll" | "verify";
  readonly pendingToken: string; // good for the second factor only
  readonly factorId: string | null; // the authenticator to verify, when one is set up
}

export interface EnrollResponse {
  readonly factorId: string;
  readonly qrCode: string; // an SVG data URL from Supabase
  readonly secret: string; // the same key as text, to type in by hand
}

export interface SessionResponse {
  readonly accessToken: string;
  readonly expiresAt: number; // seconds since 1970
  readonly email: string;
}

export interface AdminError {
  readonly error: string;
  readonly code: string;
  readonly retryAfter?: number;
}

// ---------- The players table ----------

export const PLAYER_STATUSES = ["active", "suspended", "banned", "hidden", "reported", "device"] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];
export const PLAYER_SORTS = ["joined", "active", "name", "wins", "games", "losses", "resigned", "abandoned", "reports"] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];
export const PLAYERS_PAGE_MAX = 100;

export interface PlayersQuery {
  readonly search?: string;
  readonly status?: PlayerStatus;
  readonly country?: string; // a code, or "none"
  readonly level?: number;
  readonly joinedFrom?: string; // ISO times
  readonly joinedTo?: string;
  readonly activeFrom?: string;
  readonly activeTo?: string;
  readonly sort?: PlayerSort;
  readonly desc?: boolean;
  readonly cursor?: string; // from the last page's `next`
  readonly limit?: number;
}

export interface PlayerRow {
  readonly id: string;
  readonly username: string;
  readonly avatar: string | null;
  readonly country: string | null;
  readonly joinedAt: string;
  readonly lastActiveAt: string;
  readonly hidden: boolean;
  readonly suspendedUntil: string | null;
  readonly suspensionKind: "reports" | "admin" | "permanent" | null;
  readonly deviceBanned: boolean;
  readonly wins: number;
  readonly winsByLevel: readonly [number, number, number, number]; // Easy to Strongest
  readonly games: number;
  readonly losses: number;
  readonly draws: number;
  readonly resigned: number;
  readonly abandoned: number;
  readonly reports: number;
  readonly reporters: number;
}

export interface Page<T> {
  readonly rows: readonly T[];
  readonly next: string | null; // a cursor for the next page, null at the end
}

// ---------- The audit log ----------

export interface AuditQuery {
  readonly search?: string;
  readonly action?: string;
  readonly playerId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditRow {
  readonly id: number;
  readonly at: string;
  readonly adminEmail: string | null;
  readonly action: string;
  readonly outcome: "ok" | "refused" | "failed";
  readonly reason: string | null;
  readonly targetPlayer: string | null;
  readonly targetLabel: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

export const ACTION_PATTERN = /^[a-z]+(\.[a-z]+)*$/;

/** A page cursor: the last row's sort value and id, as base64url JSON. */
export function encodeCursor(value: string | number, id: string): string {
  return btoa(JSON.stringify([value, id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor: string): [string, string] | null {
  if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as unknown;
    if (!Array.isArray(data) || data.length !== 2) return null;
    const [value, id] = data as unknown[];
    if ((typeof value !== "string" && typeof value !== "number") || typeof id !== "string" || String(value).length > 80) return null;
    return [String(value), id];
  } catch {
    return null;
  }
}
