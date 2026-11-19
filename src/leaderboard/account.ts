// Saving progress with an email (D150): what the browser and the account
// function send each other, and the rules both sides share. Pure.
//
// The email only proves who may log in. It is checked with a 6 digit code,
// lives in Supabase Auth, and is never public. Guest play never needs it.
import type { Collection } from "../state/marketplace";

export const EMAIL_MAX = 254;
export const CODE_PATTERN = /^\d{6}$/;
/** A code is good for this long, checked by our function as well as by Supabase. */
export const CODE_MINUTES = 10;
/** Wrong codes allowed before the code is void and a new one is needed. */
export const CODE_ATTEMPTS = 5;
/** A saved settings object larger than this is refused. */
export const SETTINGS_MAX_CHARS = 4000;

export type AccountPurpose = "link" | "login";
export type AccountAction = "status" | "load" | "requestCode" | "verify" | "save" | "logout" | "unlink";

/** The email in the one form we hash and send, or null if it is not an email. */
export function normalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > EMAIL_MAX) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** "a•••@g•••.com": enough for a player to recognise their own address. */
export function emailHint(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const end = dot > 0 ? domain.slice(dot) : "";
  return `${name.slice(0, 1)}•••@${host.slice(0, 1)}•••${end}`.slice(0, 80);
}

export interface AccountSave {
  readonly collection: Collection;
  readonly settings: Record<string, unknown>;
  readonly updatedAt: string; // ISO time on the server
}

export interface AccountStatus {
  readonly enabled: boolean; // false until the owner switches accounts on
  readonly linked: boolean;
  readonly emailHint: string | null;
}

export interface LinkResponse {
  readonly linked: true;
  readonly emailHint: string;
}

export interface LoginResponse {
  readonly profile: { readonly username: string; readonly country: string | null; readonly avatar: string | null; readonly token: string };
  readonly emailHint: string;
  readonly save: AccountSave | null;
}
