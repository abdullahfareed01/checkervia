// The admin page's calls (D100): only to our own two functions, always with
// the admin header, never cached. The access token lives in memory only
// (session.ts); the refresh token is an HttpOnly cookie the page cannot
// read. A 401 from admin-api tries one refresh, then asks to sign in again.
import { ADMIN_API_PATH, ADMIN_AUTH_PATH, ADMIN_MARKER_HEADER, ADMIN_MARKER_VALUE } from "./protocol";
import type { AdminError, EnrollResponse, SessionResponse, SignInStep } from "./protocol";

export type ApiResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "error"; readonly status: number; readonly code: string; readonly message: string; readonly retryAfter?: number }
  | { readonly kind: "offline" };

export type Transport = (path: string, body: string, headers: Record<string, string>) => Promise<Response>;

const realTransport: Transport = (path, body, headers) =>
  fetch(path, { method: "POST", headers, body, credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15_000) });

let transport: Transport = realTransport;

/** Development only (the demo answers in the page); never called in a build. */
export function replaceTransport(next: Transport): void {
  transport = next;
}

export async function post<T>(path: string, body: unknown, token?: string | null): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "content-type": "application/json", [ADMIN_MARKER_HEADER]: ADMIN_MARKER_VALUE };
  if (token) headers["authorization"] = `Bearer ${token}`;
  let response: Response;
  try {
    response = await transport(path, JSON.stringify(body), headers);
  } catch {
    return { kind: "offline" };
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.ok) return { kind: "ok", value: data as T };
  const error = (data ?? {}) as Partial<AdminError>;
  return {
    kind: "error",
    status: response.status,
    code: typeof error.code === "string" ? error.code : "error",
    message: typeof error.error === "string" ? error.error : "Something went wrong. Please try again.",
    ...(typeof error.retryAfter === "number" ? { retryAfter: error.retryAfter } : {}),
  };
}

export const authApi = {
  signIn: (email: string, password: string) => post<SignInStep>(ADMIN_AUTH_PATH, { action: "signIn", email, password }),
  enroll: (pendingToken: string) => post<EnrollResponse>(ADMIN_AUTH_PATH, { action: "enroll" }, pendingToken),
  verify: (pendingToken: string, code: string, factorId: string | null) =>
    post<SessionResponse>(ADMIN_AUTH_PATH, { action: "verify", code, ...(factorId ? { factorId } : {}) }, pendingToken),
  refresh: () => post<SessionResponse>(ADMIN_AUTH_PATH, { action: "refresh" }),
  signOut: (token: string | null) => post<{ signedOut: true }>(ADMIN_AUTH_PATH, { action: "signOut" }, token),
};

export const callAdmin = <T>(op: string, params: Record<string, unknown>, token: string) => post<T>(ADMIN_API_PATH, { op, params }, token);

/** The words for a failed call. */
export function problemText(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): string {
  if (result.kind === "offline") return "No connection. Check the network and try again.";
  if (result.status === 429 && result.retryAfter) {
    const minutes = Math.ceil(result.retryAfter / 60);
    return result.retryAfter >= 120 ? `Too many attempts. Try again in ${minutes} minutes.` : `Too many attempts. Try again in ${result.retryAfter} seconds.`;
  }
  return result.message;
}
