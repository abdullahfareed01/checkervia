// The storage the admin functions use (D100, D101): migration 7's functions,
// through the server's secret key. One adapter for the real database
// (supabaseAdminStore.ts); tests pass a small fake.
import type { AuditRow, PlayerRow, PlayerSort, PlayerStatus } from "../../src/admin/protocol";
import type { LiveData, ReportGroup, ReportRow, ReportSource, ReportStatus, ResetField } from "../../src/admin/moderation";

export interface RateResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface GateResult {
  readonly allowed: boolean; // on the allow list, with this id and email
  readonly enrollOpen: boolean; // a new authenticator may be set up now
}

/** One audit row. `adminId` is null for a refused sign in. */
export interface AuditEntry {
  readonly adminId: string | null;
  readonly action: string;
  readonly outcome: "ok" | "refused" | "failed";
  readonly reason?: string | null;
  readonly targetPlayer?: string | null;
  readonly targetLabel?: string | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly ipHash: string;
}

export interface PlayersFilter {
  readonly search: string | null;
  readonly status: PlayerStatus | null;
  readonly country: string | null;
  readonly level: number | null;
  readonly joinedFrom: Date | null;
  readonly joinedTo: Date | null;
  readonly activeFrom: Date | null;
  readonly activeTo: Date | null;
  readonly sort: PlayerSort;
  readonly desc: boolean;
  readonly after: { readonly value: string; readonly id: string } | null;
  readonly limit: number;
}

export interface AuditFilter {
  readonly search: string | null;
  readonly action: string | null;
  readonly playerId: string | null;
  readonly before: number | null;
  readonly limit: number;
}

export interface ReportsFilter {
  readonly status: ReportStatus | null;
  readonly source: ReportSource | null;
  readonly playerId: string | null;
  readonly before: { readonly at: string; readonly key: string } | null;
  readonly limit: number;
}

/** Who acts, from where, and why: written with the action in one database step (D110). */
export interface ActionContext {
  readonly adminId: string;
  readonly ipHash: string;
  readonly reason: string;
}

export interface AdminStore {
  countries(range: import("../../src/admin/analytics").OverviewRange): Promise<import("../../src/admin/reports").CountriesData>;
  winners(range: import("../../src/admin/analytics").OverviewRange, level: number): Promise<import("../../src/admin/reports").WinnersData>;
  resigned(range: import("../../src/admin/analytics").OverviewRange): Promise<import("../../src/admin/reports").ResignedData>;
  overview(range: import("../../src/admin/analytics").OverviewRange): Promise<import("../../src/admin/analytics").OverviewData>;
  hitRateLimit(key: string, windowSeconds: number, limit: number): Promise<RateResult>;
  gate(userId: string, email: string): Promise<GateResult>;
  closeEnrollment(userId: string): Promise<void>;
  log(entry: AuditEntry): Promise<void>;
  /** One page of players, and each row's sort value for the next page's cursor. */
  players(filter: PlayersFilter): Promise<{ row: PlayerRow; sortValue: string }[]>;
  /** Everything stored about a player (null when there is none); records the look in the audit log. */
  playerDetail(adminId: string, ipHash: string, playerId: string): Promise<Record<string, unknown> | null>;
  audit(filter: AuditFilter): Promise<AuditRow[]>;
  // Phase 3 (D110). Reads, then actions; an action answers false (or null,
  // or "notFound") when its target no longer exists.
  reports(filter: ReportsFilter): Promise<ReportRow[]>;
  reportGroups(status: ReportStatus | null, limit: number): Promise<ReportGroup[]>;
  live(): Promise<LiveData>;
  setReportStatus(context: ActionContext, source: ReportSource, key: string, status: ReportStatus): Promise<boolean>;
  /** Suspends until `until`, or for ever; answers the end, or null for no such player. */
  suspend(context: ActionContext, playerId: string, until: Date | null, permanent: boolean, action: string): Promise<string | null>;
  unsuspend(context: ActionContext, playerId: string): Promise<boolean>;
  deviceBan(context: ActionContext, playerId: string, ban: boolean): Promise<boolean>;
  hidePlayer(context: ActionContext, playerId: string, hidden: boolean): Promise<boolean>;
  hideWin(context: ActionContext, winId: string, hidden: boolean): Promise<boolean>;
  rename(context: ActionContext, playerId: string, username: string, usernameKey: string): Promise<"renamed" | "taken" | "notFound">;
  resetProfile(context: ActionContext, playerId: string, field: ResetField): Promise<boolean>;
  deletePlayer(context: ActionContext, playerId: string): Promise<boolean>;
}
