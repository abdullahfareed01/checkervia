// Storage for saved progress (D150, migration 9). Two adapters, like the
// leaderboard: supabaseAccountStore.ts (the real one) and
// memoryAccountStore.ts (tests and the development server).
import type { PlayerRecord } from "../leaderboard/store";

export interface AccountLink {
  readonly playerId: string;
  readonly authUserId: string;
  readonly emailHash: string;
  readonly emailHint: string;
}

/** The latest code request for one email. */
export interface CodeRequest {
  readonly emailHash: string;
  readonly authUserId: string | null; // set when our function made the Auth user
  readonly createdUser: boolean;
  readonly requestedAt: Date;
  readonly wrongAttempts: number;
  readonly used: boolean;
}

export interface SavedData {
  readonly collection: unknown;
  readonly settings: unknown;
  readonly updatedAt: Date;
}

export interface AccountStore {
  linkOfPlayer(playerId: string): Promise<AccountLink | null>;
  linkOfUser(authUserId: string): Promise<AccountLink | null>;
  linkOfEmail(emailHash: string): Promise<AccountLink | null>;
  /** One step: refused when the profile already has an email or the email has a profile. */
  link(link: AccountLink): Promise<"linked" | "emailTaken" | "profileLinked">;
  /** Removes the link and the saved data; the Auth user is queued for deletion. */
  unlink(playerId: string): Promise<boolean>;
  playerById(playerId: string): Promise<PlayerRecord | null>;
  /** A key for one more device of the profile. */
  addDeviceToken(playerId: string, tokenHash: string, deviceHash: string): Promise<void>;
  /** Removes a device key; false when it is not one (it is the profile's first key). */
  removeDeviceToken(tokenHash: string): Promise<boolean>;
  /** Replaces the profile's first key, which signs that device out. */
  replaceFirstToken(playerId: string, tokenHash: string): Promise<void>;
  saved(playerId: string): Promise<SavedData | null>;
  putSaved(playerId: string, collection: unknown, settings: unknown): Promise<Date>;
  code(emailHash: string): Promise<CodeRequest | null>;
  putCode(request: CodeRequest): Promise<void>;
  /** Counts one wrong code and returns the wrong attempts so far. */
  wrongCode(emailHash: string): Promise<number>;
  useCode(emailHash: string): Promise<void>;
  /** Codes older than `before`: forgets them, queueing Auth users we made that were never linked. */
  queueStaleCodes(before: Date): Promise<number>;
  /** Auth users waiting to be deleted, oldest first. */
  erasures(limit: number): Promise<string[]>;
  erased(authUserId: string): Promise<void>;
}
