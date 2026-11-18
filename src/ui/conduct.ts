// Reports for abandoned games and the 30 day suspension, on this device
// (D85). A game against the AI left without a move for a minute is
// abandoned and the AI reports the player: every abandoned game is one
// report (once per game). The fourth report suspends the account for 30
// days, with no games against the AI, and the count starts again from zero;
// the total is kept for the profile.
//
// The server keeps the same for the profile (report-abandon, migration 4)
// and is the truth when it answers: this device sends its reports (kept
// until the server has them, like the win queue) and takes the server's
// counts. Without a profile, or before migration 4, the device's own count
// still applies. In localStorage, every access in try and catch, checked
// field by field on load.
//
// A moderator can also suspend, shorten or lift a suspension (D102). The
// server then sends the time of that change (revisedAt); a newer one than
// this device has seen replaces the device's own suspension, even a longer
// one, so lifting it restores play at once. Nothing else is wiped.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AiLevel } from "../ai/difficulty";
import { LEVELS } from "../ai/difficulty";
import { GAME_ID_PATTERN, REPORT_LIMIT, SUSPENSION_DAYS } from "../leaderboard/protocol";
import { parseSuspensionKind } from "../leaderboard/protocol";
import type { AbandonPhase, ConductStatus, SuspensionKind } from "../leaderboard/protocol";
import { leaderboardApi } from "./leaderboard/api";
import type { ApiResult } from "./leaderboard/api";
import { leaderboardStore } from "./leaderboard/profile";
import { gameIdOf } from "./leaderboard/useLeaderboardGame";
import type { GameState } from "../state/gameReducer";

export const CONDUCT_KEY = "checkervia.conduct";
const DAY_MS = 86_400_000;
const REMEMBERED = 50; // game ids kept, so a game is never reported twice

export interface PendingReport {
  readonly gameId: string;
  readonly level: AiLevel;
  readonly phase: AbandonPhase;
}

export interface Conduct {
  readonly reports: number; // towards the next suspension
  readonly totalReports: number;
  readonly suspendedUntil: number | null; // ms since 1970
  readonly kind?: SuspensionKind; // who suspended (D102), while suspended
  readonly revisedAt?: number; // the newest moderator change seen (D102), ms since 1970
  readonly reported: readonly string[]; // the last game ids reported
  readonly pending: readonly PendingReport[]; // not yet accepted by the server
}

export const EMPTY_CONDUCT: Conduct = { reports: 0, totalReports: 0, suspendedUntil: null, reported: [], pending: [] };

/** What the abandon popup says about the report just made. */
export interface AbandonOutcome {
  readonly phase: AbandonPhase;
  readonly left: number; // reports left before a suspension (0 once suspended)
  readonly suspendedUntil: number | null;
  readonly suspendedNow: boolean; // this report suspended the account
}

export const isSuspended = (conduct: Conduct, now: number): boolean => conduct.suspendedUntil !== null && conduct.suspendedUntil > now;

/** The conduct after the AI reported the player for this game (once per game). */
export function withReport(conduct: Conduct, report: PendingReport, now: number): { conduct: Conduct; outcome: AbandonOutcome } {
  const already = conduct.reported.includes(report.gameId);
  const suspended = isSuspended(conduct, now);
  let next = conduct;
  let suspendedNow = false;
  if (!already) {
    const reported = [...conduct.reported, report.gameId].slice(-REMEMBERED);
    const counted = { ...conduct, totalReports: conduct.totalReports + 1, reported, pending: [...conduct.pending, report] };
    if (suspended) next = counted;
    else if (conduct.reports + 1 >= REPORT_LIMIT) {
      next = { ...counted, reports: 0, suspendedUntil: now + SUSPENSION_DAYS * DAY_MS, kind: "reports" };
      suspendedNow = true;
    } else next = { ...counted, reports: conduct.reports + 1, suspendedUntil: null };
  }
  const nowSuspended = isSuspended(next, now);
  return {
    conduct: next,
    outcome: { phase: report.phase, left: nowSuspended ? 0 : REPORT_LIMIT - next.reports, suspendedUntil: nowSuspended ? next.suspendedUntil : null, suspendedNow },
  };
}

/** A moderator's change the device has not seen yet (D102), or null. */
export function newRevision(conduct: Pick<Conduct, "revisedAt">, status: ConductStatus | null | undefined): number | null {
  const revised = status?.revisedAt ? Date.parse(status.revisedAt) : Number.NaN;
  return Number.isNaN(revised) || revised <= (conduct.revisedAt ?? 0) ? null : revised;
}

/**
 * The server's counts, which are the truth for the profile. While reports
 * are still waiting to be sent, the device keeps its own count; a suspension
 * is never shortened by an older answer, and the total never goes down (a
 * report made before the profile existed stays counted here). A moderator's
 * newer change (D102) is taken as it is, shorter or lifted, once no report
 * of this device is still on its way.
 */
export function withServer(conduct: Conduct, status: ConductStatus): Conduct {
  const parsed = status.suspendedUntil === null ? null : Date.parse(status.suspendedUntil);
  const serverUntil = parsed === null || Number.isNaN(parsed) ? null : parsed;
  const serverKind = parseSuspensionKind(status.kind) ?? (serverUntil === null ? null : "reports");
  const revised = conduct.pending.length === 0 ? newRevision(conduct, status) : null;
  const { kind: _kind, ...rest } = conduct;
  const base = {
    ...rest,
    reports: conduct.pending.length > 0 ? conduct.reports : status.reports,
    totalReports: Math.max(conduct.totalReports, status.totalReports),
  };
  const withKind = (until: number | null, kind: SuspensionKind | null | undefined): Conduct => ({ ...base, suspendedUntil: until, ...(until !== null && kind ? { kind } : {}) });
  if (revised !== null) return { ...withKind(serverUntil, serverKind), revisedAt: revised };
  const serverLonger = serverUntil !== null && serverUntil >= (conduct.suspendedUntil ?? 0);
  return serverLonger ? withKind(serverUntil, serverKind) : withKind(conduct.suspendedUntil, conduct.kind);
}

const count = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);

function asPending(value: unknown): PendingReport | null {
  const data = value as Partial<PendingReport> | null;
  if (!data || typeof data.gameId !== "string" || !GAME_ID_PATTERN.test(data.gameId)) return null;
  if (!LEVELS.includes(data.level as AiLevel) || (data.phase !== "start" && data.phase !== "middle")) return null;
  return { gameId: data.gameId, level: data.level as AiLevel, phase: data.phase };
}

/** A stored conduct, or the empty one when it is missing or broken. */
export function parseConduct(raw: string | null): Conduct {
  if (!raw) return EMPTY_CONDUCT;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const reports = count(data["reports"]);
    const totalReports = count(data["totalReports"]);
    const until = data["suspendedUntil"];
    if (reports === null || totalReports === null || reports >= REPORT_LIMIT) return EMPTY_CONDUCT;
    if (until !== null && count(until) === null) return EMPTY_CONDUCT;
    const reported = Array.isArray(data["reported"]) ? data["reported"].filter((id): id is string => typeof id === "string").slice(-REMEMBERED) : [];
    const pending = Array.isArray(data["pending"]) ? data["pending"].map(asPending).filter((item): item is PendingReport => item !== null) : [];
    // Saved before D102: no kind (the AI's reports were the only one) and no revision.
    const kind = until === null ? null : (parseSuspensionKind(data["kind"]) ?? "reports");
    const revisedAt = count(data["revisedAt"]);
    return {
      reports,
      totalReports,
      suspendedUntil: until as number | null,
      ...(kind ? { kind } : {}),
      ...(revisedAt !== null ? { revisedAt } : {}),
      reported,
      pending,
    };
  } catch {
    return EMPTY_CONDUCT;
  }
}

function load(): Conduct {
  try {
    return parseConduct(localStorage.getItem(CONDUCT_KEY));
  } catch {
    return EMPTY_CONDUCT;
  }
}

let current: Conduct | null = null;
let clock: () => number = Date.now;
const listeners = new Set<() => void>();

function save(next: Conduct): void {
  current = next;
  try {
    localStorage.setItem(CONDUCT_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: it still counts for this visit.
  }
  for (const listener of listeners) listener();
}

export const conductStore = {
  get(): Conduct {
    current ??= load();
    return current;
  },
  isSuspended(): boolean {
    return isSuspended(conductStore.get(), clock());
  },
  /** The AI reported the player for this game; returns what the popup says. */
  report(report: PendingReport): AbandonOutcome {
    const { conduct, outcome } = withReport(conductStore.get(), report, clock());
    if (conduct !== conductStore.get()) save(conduct);
    return outcome;
  },
  applyServer(status: ConductStatus): void {
    save(withServer(conductStore.get(), status));
  },
  sent(gameId: string): void {
    const conduct = conductStore.get();
    if (conduct.pending.some((item) => item.gameId === gameId)) save({ ...conduct, pending: conduct.pending.filter((item) => item.gameId !== gameId) });
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Tests: read storage again, with this clock. */
  reload(now: () => number = Date.now): void {
    clock = now;
    current = null;
    for (const listener of listeners) listener();
  },
};

export function useConduct(): Conduct {
  return useSyncExternalStore(conductStore.subscribe, conductStore.get, () => EMPTY_CONDUCT);
}

/**
 * The player's own reports as the profile shows them: this device's count
 * and the server's answer together, the higher total and the later
 * suspension. The device counts a report at once, even while the server
 * cannot take it yet (offline, or before migration 4, when the server
 * answers 0), so the profile never shows fewer reports than were made here.
 */
export function shownConduct(local: Conduct, now: number, server?: ConductStatus | null): ConductStatus {
  // A moderator's change the device has not taken yet (D102) wins outright.
  const merged = server && local.pending.length === 0 && newRevision(local, server) !== null ? withServer(local, server) : local;
  const serverUntil = server?.suspendedUntil && merged === local ? Date.parse(server.suspendedUntil) : Number.NaN;
  const serverWins = !Number.isNaN(serverUntil) && serverUntil > (merged.suspendedUntil ?? 0);
  const until = serverWins ? serverUntil : (merged.suspendedUntil ?? 0);
  const suspended = until > now;
  return {
    reports: suspended ? 0 : merged.pending.length > 0 || !server ? merged.reports : Math.max(merged.reports, server.reports),
    totalReports: Math.max(merged.totalReports, server?.totalReports ?? 0),
    suspendedUntil: suspended ? new Date(until).toISOString() : null,
  };
}

/** shownConduct for this device, kept up to date. */
export function useShownConduct(server?: ConductStatus | null): ConductStatus {
  return shownConduct(useConduct(), Date.now(), server);
}

// What a server answer means for a waiting report: done (accepted, or
// refused for good), or try again later (offline, a server problem, too many
// requests, or migration 4 not run yet).
function settled(result: ApiResult<ConductStatus>): boolean {
  if (result.kind === "ok") return true;
  return result.kind === "failed" && result.status >= 400 && result.status < 500 && result.status !== 429;
}

/** Sends the waiting reports for the profile, one after another, stopping at the first problem. */
export async function sendPendingReports(api: Pick<typeof leaderboardApi, "reportAbandon"> = leaderboardApi): Promise<void> {
  if (!leaderboardStore.get().profile) return;
  for (const report of conductStore.get().pending) {
    const result = await api.reportAbandon(report.gameId, report.level, report.phase);
    if (!settled(result)) return;
    conductStore.sent(report.gameId);
    if (result.kind === "ok") conductStore.applyServer(result.value);
  }
}

/** When the app opens: sends the waiting reports, then takes the server's counts for the profile. */
export async function syncConduct(api: Pick<typeof leaderboardApi, "reportAbandon" | "profile"> = leaderboardApi): Promise<void> {
  const profile = leaderboardStore.get().profile;
  if (!profile) return;
  await sendPendingReports(api);
  const answer = await api.profile(profile.username);
  if (answer.kind === "ok" && answer.value.conduct) conductStore.applyServer(answer.value.conduct);
}

/** Before the player's first move in this game, or after it. */
export const abandonPhaseOf = (state: GameState): AbandonPhase =>
  state.history.some((entry) => entry.player === state.humanSide) ? "middle" : "start";

/**
 * Once per abandoned game: the AI reports the player (on this device at
 * once, then to the server for the profile). Returns what the popup says,
 * or null while the game goes on.
 */
export function useAbandonReport(state: GameState): AbandonOutcome | null {
  const start = state.history[0]!;
  const [made, setMade] = useState<{ game: object; outcome: AbandonOutcome } | null>(null);
  useEffect(() => {
    if (!state.abandoned || made?.game === start) return;
    const outcome = conductStore.report({ gameId: gameIdOf(state), level: state.aiLevel, phase: abandonPhaseOf(state) });
    setMade({ game: start, outcome });
    void sendPendingReports().catch(() => {});
  }, [state.abandoned, start]);
  return made?.game === start ? made.outcome : null;
}
