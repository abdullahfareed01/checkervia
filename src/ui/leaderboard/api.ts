// The browser's side of the leaderboard functions (D56, D57, D59). Every
// call returns a result instead of throwing, so the screens can show a calm
// state for each case (Problem.tsx has their words):
// - ok: the answer;
// - offline: the browser says it is offline, or the request failed on the
//   network (no answer came back at all);
// - serverError: the device is online but the server answered with a 5xx,
//   sent something unreadable, or gave no answer in time;
// - failed: the server refused the request (its code, and the username rules
//   or the seconds to wait when it gives them).
import type { AiLevel } from "../../ai/difficulty";
import type { Player } from "../../engine";
import type { Period } from "../../leaderboard/periods";
import { DEVICE_HEADER } from "../../leaderboard/protocol";
import type {
  AbandonPhase,
  AiStatsResponse,
  ConductStatus,
  CheckUsernameResponse,
  ClaimResponse,
  CountryChoice,
  EncodedMove,
  LeaderboardResponse,
  ProfileResponse,
  SubmitWinResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from "../../leaderboard/protocol";
import type { UsernameRule } from "../../leaderboard/username";
import { deviceId, leaderboardStore } from "./profile";

export type ApiResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "offline" }
  | { readonly kind: "serverError"; readonly status: number } // 0: no answer in time
  | {
      readonly kind: "failed";
      readonly status: number;
      readonly code: string;
      readonly problems?: readonly UsernameRule[];
      readonly retryAfter?: number;
      readonly nextRenameAt?: string;
    };

const BASE = "/.netlify/functions/";
const TIMEOUT_MS = 12_000;

// Tests and the development preview answer in place of the network.
let transport: typeof fetch = (input, init) => fetch(input, init);
export function setLeaderboardTransport(next: typeof fetch | null): void {
  transport = next ?? ((input, init) => fetch(input, init));
}

async function call<T>(name: string, options: { query?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  const query = options.query ? `?${new URLSearchParams(options.query)}` : "";
  const headers: Record<string, string> = { [DEVICE_HEADER]: deviceId() };
  const token = leaderboardStore.get().profile?.token;
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  // The caller's cancel and our timeout in one signal (AbortSignal.any is
  // missing in Safari before 17.4).
  // The browser knows it has no network: do not even try.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const signal = controller.signal;
  let response: Response;
  try {
    response = await transport(`${BASE}${name}${query}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal,
    });
  } catch (error) {
    // A cancelled request is not an outage: the caller has moved on.
    if (options.signal?.aborted) throw error;
    // Our own timeout: the network works but the server did not answer.
    if (timedOut) return { kind: "serverError", status: 0 };
    return { kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 500) return { kind: "serverError", status: response.status };

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { kind: "serverError", status: response.status };
  }
  // The server no longer knows this token (the profile was removed): forget it.
  if (response.status === 401 && token) leaderboardStore.setProfile(null);
  if (response.ok) return { kind: "ok", value: data as T };
  const body = (data ?? {}) as { code?: unknown; problems?: unknown; retryAfter?: unknown; nextRenameAt?: unknown };
  return {
    kind: "failed",
    status: response.status,
    code: typeof body.code === "string" ? body.code : "unknown",
    ...(Array.isArray(body.problems) ? { problems: body.problems as UsernameRule[] } : {}),
    ...(typeof body.retryAfter === "number" ? { retryAfter: body.retryAfter } : {}),
    ...(typeof body.nextRenameAt === "string" ? { nextRenameAt: body.nextRenameAt } : {}),
  };
}

export const leaderboardApi = {
  checkUsername: (username: string, signal?: AbortSignal) =>
    call<CheckUsernameResponse>("check-username", { query: { username }, ...(signal ? { signal } : {}) }),

  /** On success the profile (with its token) is saved on this device. */
  async claimUsername(username: string, country: CountryChoice, avatar: string): Promise<ApiResult<ClaimResponse>> {
    const result = await call<ClaimResponse>("claim-username", { body: { username, country, avatar } });
    if (result.kind === "ok") leaderboardStore.setProfile(result.value);
    return result;
  },

  submitWin: (gameId: string, level: AiLevel, moves: readonly EncodedMove[], colour: Player = "black") =>
    call<SubmitWinResponse>("submit-win", { body: { gameId, level, mode: "vs-ai", colour, moves } }),

  reportGame: (gameId: string, level: AiLevel, result: "win" | "loss" | "draw", resigned = false) =>
    call<{ recorded: boolean }>("report-game", { body: { gameId, level, result, ...(resigned ? { resigned: true } : {}) } }),

  /** The AI reported the player for an abandoned game (D85); answers their reports and suspension. */
  reportAbandon: (gameId: string, level: AiLevel, phase: AbandonPhase) =>
    call<ConductStatus>("report-abandon", { body: { gameId, level, phase } }),

  /** The AI's record over every player (D75). */
  aiStats: (signal?: AbortSignal) => call<AiStatsResponse>("get-ai-stats", signal ? { signal } : {}),

  leaderboard: (level: AiLevel, period: Period, page: number, signal?: AbortSignal) =>
    call<LeaderboardResponse>("get-leaderboard", { query: { level: String(level), period, page: String(page) }, ...(signal ? { signal } : {}) }),

  profile: (username: string, signal?: AbortSignal) =>
    call<ProfileResponse>("get-profile", { query: { username }, ...(signal ? { signal } : {}) }),

  /** Changes the own profile (any of username, flag, avatar); on success this device's copy too. */
  async updateProfile(changes: UpdateProfileRequest): Promise<ApiResult<UpdateProfileResponse>> {
    const result = await call<UpdateProfileResponse>("update-profile", { body: changes });
    if (result.kind === "ok") {
      const { username, country, avatar } = result.value;
      leaderboardStore.updateProfile({ username, country, avatar });
    }
    return result;
  },
};
