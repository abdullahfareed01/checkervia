// The three ways a leaderboard request can fail, in one place (D59), so the
// screen, the profile and the submit form say the same thing:
// - offline: the device is offline, or the request failed on the network;
// - server: the server answered with an error (a 503 or any other 5xx, an
//   unreadable answer, or no answer in time) while the device is online;
// - limited: too many requests (429), with the seconds to wait.
import { HourglassIcon } from "../icons";
import type { ApiResult } from "./api";

export type Problem = { readonly kind: "offline" } | { readonly kind: "server" } | { readonly kind: "limited"; readonly retryAfter: number | null };

export const OFFLINE_TEXT = "You are offline. The leaderboard is not available right now.";
export const SERVER_TEXT = "The leaderboard is having a problem. Please try again in a moment.";

/** "Too many requests. Try again in 30 seconds." Long waits are said in minutes. */
export function tooManyText(retryAfter: number | null): string {
  if (retryAfter === null || retryAfter <= 0) return "Too many requests. Try again in a moment.";
  if (retryAfter < 120) return `Too many requests. Try again in ${Math.ceil(retryAfter)} ${Math.ceil(retryAfter) === 1 ? "second" : "seconds"}.`;
  return `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} minutes.`;
}

export function problemText(problem: Problem): string {
  if (problem.kind === "offline") return OFFLINE_TEXT;
  if (problem.kind === "server") return SERVER_TEXT;
  return tooManyText(problem.retryAfter);
}

/**
 * The problem behind a result that is not ok. A refusal other than 429 (a
 * request the server would not take) is also a server problem to the player.
 */
export function problemOf(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): Problem {
  if (result.kind === "offline") return { kind: "offline" };
  if (result.kind === "failed" && result.status === 429) return { kind: "limited", retryAfter: result.retryAfter ?? null };
  return { kind: "server" };
}

// A cloud with a line through it.
function OfflineIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

// A circle with an exclamation mark.
function ServerIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** The calm panel for a problem, with Try again. `compact` inside the profile sheet. */
export function ProblemPanel({ problem, onRetry, compact = false }: { problem: Problem; onRetry: () => void; compact?: boolean }) {
  return (
    <div className={`lb-state${compact ? " lb-state-compact" : ""} lb-state-${problem.kind}`} role="status">
      {!compact && (
        <span className="lb-state-icon" aria-hidden="true">
          {problem.kind === "offline" ? <OfflineIcon /> : problem.kind === "server" ? <ServerIcon /> : <HourglassIcon />}
        </span>
      )}
      <p className="lb-state-text">{problemText(problem)}</p>
      <button type="button" className="button button-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
