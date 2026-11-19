// Tokens and hashes, with the Web Crypto API that Node and Netlify provide
// (no dependency). Rules this file keeps:
// - A token is 32 random bytes, returned to the browser once, at claim time.
//   Only its SHA 256 hash is stored, so a copy of the database cannot be used
//   to act as a player.
// - The device id and the IP address are stored only as keyed hashes (HMAC
//   with LEADERBOARD_HASH_SALT), so they cannot be reversed by trying every
//   IP address without the secret. Used for rate limits only.
import { TOKEN_PATTERN } from "../../src/leaderboard/protocol";

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** A keyed hash: `kind` keeps device and IP hashes apart even for the same text. */
export async function saltedHash(salt: string, kind: "device" | "ip" | "email", value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${kind}:${value}`)));
}

/** The token from an "Authorization: Bearer ..." header, or null if there is none or it has the wrong shape. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? "");
  return match && TOKEN_PATTERN.test(match[1]!) ? match[1]! : null;
}
