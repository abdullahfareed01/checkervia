// The 18+ consent for the Strongest level (D45): the steps, and the record
// kept in this browser. It is a self declaration: nothing here can verify a
// player's age. No age is stored, only that the notice was accepted, when,
// and which version of the notice it was.

// Bump this whenever the notice text changes: everyone is asked again.
export const NOTICE_VERSION = 1;
export const CONSENT_KEY = "draft.strongestConsent";

export interface ConsentRecord {
  readonly version: number;
  readonly acceptedAt: string; // ISO date and time
}

type Store = Pick<Storage, "getItem" | "setItem">;

// Storage can be missing or blocked (private windows, tests); then nothing
// is remembered and the player is simply asked each time.
function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored acceptance, or null if there is none or it cannot be read. */
export function readConsent(store: Store | null = browserStore()): ConsentRecord | null {
  try {
    const value: unknown = JSON.parse(store?.getItem(CONSENT_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { version, acceptedAt } = value as Record<string, unknown>;
    return typeof version === "number" && typeof acceptedAt === "string" ? { version, acceptedAt } : null;
  } catch {
    return null;
  }
}

/** True if the current version of the notice was accepted in this browser. */
export function hasConsent(store: Store | null = browserStore()): boolean {
  return readConsent(store)?.version === NOTICE_VERSION;
}

/** Records the acceptance of the current notice, with the time. */
export function saveConsent(now: Date, store: Store | null = browserStore()): ConsentRecord {
  const record = { version: NOTICE_VERSION, acceptedAt: now.toISOString() };
  try {
    store?.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Not remembered; the player is asked again next time.
  }
  return record;
}

// age: "Are you 18 or older?"; notice: the strong language notice;
// declined: the friendly message after No or Cancel.
export type ConsentStep = "age" | "notice" | "declined";

/** Where a Yes (true) or a No (false) on a step leads. */
export function nextConsentStep(step: ConsentStep, yes: boolean): ConsentStep | "accepted" | "closed" {
  if (step === "age") return yes ? "notice" : "declined";
  if (step === "notice") return yes ? "accepted" : "declined";
  return "closed";
}
