// The browser's side of the leaderboard functions (D56, D57). Every call
// returns a result instead of throwing, so the screens can show a calm
// state for each case:
// - ok: the answer;
// - offline: no network, a timeout, or the service is not available (503 or
//   any 5xx): the screens show "You are offline. The leaderboard is not
//   available right now." with Try again;
// - failed: the server refused the request (its code, and the username rules
//   or the seconds to wait when it gives them).
import type { AiLevel } from "../../ai/difficulty";
import type { Period } from "../../leaderboard/periods";
import { DEVICE_HEADER } from "../../leaderboard/protocol";
import type {
  CheckUsernameResponse,
  ClaimResponse,
  CountryChoice,
  EncodedMove,
  LeaderboardResponse,
  ProfileResponse,
  SubmitWinResponse,
} from "../../leaderboard/protocol";
import type { UsernameRule } from "../../leaderboard/username";
import { deviceId, leaderboardStore } from "./profile";

export type ApiResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "offline" }
  | {
      readonly kind: "failed";
      readonly status: number;
      readonly code: string;
      readonly problems?: readonly UsernameRule[];
      readonly retryAfter?: number;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    return { kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 500) return { kind: "offline" };

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { kind: "offline" };
  }
  // The server no longer knows this token (the profile was removed): forget it.
  if (response.status === 401 && token) leaderboardStore.setProfile(null);
  if (response.ok) return { kind: "ok", value: data as T };
  const body = (data ?? {}) as { code?: unknown; problems?: unknown; retryAfter?: unknown };
  return {
    kind: "failed",
    status: response.status,
    code: typeof body.code === "string" ? body.code : "unknown",
    ...(Array.isArray(body.problems) ? { problems: body.problems as UsernameRule[] } : {}),
    ...(typeof body.retryAfter === "number" ? { retryAfter: body.retryAfter } : {}),
  };
}

export const leaderboardApi = {
  checkUsername: (username: string, signal?: AbortSignal) =>
    call<CheckUsernameResponse>("check-username", { query: { username }, ...(signal ? { signal } : {}) }),

  /** On success the profile (with its token) is saved on this device. */
  async claimUsername(username: string, country: CountryChoice): Promise<ApiResult<ClaimResponse>> {
    const result = await call<ClaimResponse>("claim-username", { body: { username, country } });
    if (result.kind === "ok") leaderboardStore.setProfile(result.value);
    return result;
  },

  submitWin: (gameId: string, level: AiLevel, moves: readonly EncodedMove[]) =>
    call<SubmitWinResponse>("submit-win", { body: { gameId, level, mode: "vs-ai", moves } }),

  reportGame: (gameId: string, level: AiLevel, result: "win" | "loss") =>
    call<{ recorded: boolean }>("report-game", { body: { gameId, level, result } }),

  leaderboard: (level: AiLevel, period: Period, page: number, signal?: AbortSignal) =>
    call<LeaderboardResponse>("get-leaderboard", { query: { level: String(level), period, page: String(page) }, ...(signal ? { signal } : {}) }),

  profile: (username: string, signal?: AbortSignal) =>
    call<ProfileResponse>("get-profile", { query: { username }, ...(signal ? { signal } : {}) }),

  async updateCountry(country: CountryChoice): Promise<ApiResult<{ username: string; country: string | null }>> {
    const result = await call<{ username: string; country: string | null }>("update-profile", { body: { country } });
    if (result.kind === "ok") leaderboardStore.setCountry(result.value.country);
    return result;
  },
};
