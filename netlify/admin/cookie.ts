// The admin's refresh token lives in one cookie the page's scripts cannot
// read (HttpOnly), sent only over HTTPS (Secure), only by our own site
// (SameSite=Strict) and only to the sign in function (its Path). The access
// token stays in the page's memory and is lost on reload; the cookie gets a
// new one. Its age never passes the end of the 12 hour sign in.
import { ADMIN_AUTH_PATH } from "../../src/admin/protocol";

export const REFRESH_COOKIE = "__Secure-checkervia-admin";
const REFRESH_PATTERN = /^[A-Za-z0-9_-]{8,512}$/;

export function refreshCookie(token: string, maxAgeSeconds: number): string {
  return `${REFRESH_COOKIE}=${token}; Path=${ADMIN_AUTH_PATH}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearedCookie = () => `${REFRESH_COOKIE}=; Path=${ADMIN_AUTH_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/** The refresh token from the Cookie header, or null. */
export function readRefreshCookie(header: string | undefined): string | null {
  for (const part of (header ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === REFRESH_COOKIE) {
      const token = value.join("=");
      return REFRESH_PATTERN.test(token) ? token : null;
    }
  }
  return null;
}
