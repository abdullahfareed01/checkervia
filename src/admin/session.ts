// The admin's session in the page (D100). The access token is kept in
// memory only, never in storage, so a reload asks the HttpOnly cookie for a
// new one. It is refreshed a minute before it expires, and the page signs
// out after IDLE_MINUTES without a key press, click or touch.
import { useSyncExternalStore } from "react";
import { authApi, callAdmin, problemText } from "./api";
import type { ApiResult } from "./api";
import { IDLE_MINUTES } from "./protocol";
import type { SessionResponse } from "./protocol";

export type SessionState =
  | { readonly status: "checking" }
  | { readonly status: "signedOut"; readonly message: string | null }
  | { readonly status: "signedIn"; readonly email: string; readonly expiresAt: number };

let state: SessionState = { status: "checking" };
let token: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function clearTimers(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (idleTimer) clearTimeout(idleTimer);
  refreshTimer = idleTimer = null;
}

function resetIdle(): void {
  if (state.status !== "signedIn") return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void signOut("Signed out after 30 minutes without use."), IDLE_MINUTES * 60_000);
}

/** Starts the session from a sign in or a refresh. */
export function start(session: SessionResponse): void {
  token = session.accessToken;
  clearTimers();
  const wait = Math.max(10_000, session.expiresAt * 1000 - Date.now() - 60_000);
  refreshTimer = setTimeout(() => void refresh(), wait);
  set({ status: "signedIn", email: session.email, expiresAt: session.expiresAt });
  resetIdle();
}

/** A new access token from the cookie; false when the sign in has ended. */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const answer = await authApi.refresh();
    refreshing = null;
    if (answer.kind === "ok") {
      start(answer.value);
      return true;
    }
    if (answer.kind === "error" && (answer.status === 401 || answer.status === 403)) end(state.status === "checking" ? null : "Your sign in has ended. Please sign in again.");
    else if (state.status === "checking") end(problemText(answer));
    return false;
  })();
  return refreshing;
}

function end(message: string | null): void {
  token = null;
  clearTimers();
  set({ status: "signedOut", message });
}

export async function signOut(message: string | null = null): Promise<void> {
  const current = token;
  end(message);
  await authApi.signOut(current);
}

/** Calls an admin operation; one refresh and retry on a 401. */
export async function adminCall<T>(op: string, params: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  if (!token) return { kind: "error", status: 401, code: "noSession", message: "Please sign in again." };
  resetIdle();
  const first = await callAdmin<T>(op, params, token);
  if (first.kind !== "error" || first.status !== 401) return first;
  if (!(await refresh()) || !token) return first;
  return callAdmin<T>(op, params, token);
}

export const sessionStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
}

/** Any key press, click or touch counts as use. */
export function watchActivity(target: Pick<Window, "addEventListener" | "removeEventListener">): () => void {
  const onUse = () => resetIdle();
  for (const name of ["keydown", "pointerdown"]) target.addEventListener(name, onUse, { passive: true });
  return () => {
    for (const name of ["keydown", "pointerdown"]) target.removeEventListener(name, onUse);
  };
}
