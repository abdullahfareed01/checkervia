// What the account function needs (D150), its limits, and the clean up of
// Auth users whose email must go.
import type { LeaderboardDeps, LeaderboardRequest, LeaderboardResponse } from "../leaderboard/http";
import type { PlayerAuth } from "./playerAuth";
import type { AccountStore } from "./store";

export interface AccountDeps extends LeaderboardDeps {
  /** False until the owner sets ACCOUNTS_ENABLED: then only `status` answers. */
  readonly enabled: boolean;
  readonly accounts: AccountStore;
  readonly auth: PlayerAuth;
  /** The admin's email gets no player code (D150, point 1). */
  readonly adminEmail: string | null;
}

export type AccountHandler = (request: LeaderboardRequest, deps: AccountDeps) => Promise<LeaderboardResponse>;

// Per fixed window, with the leaderboard's rate limit table and its salted
// hashes of the IP address and the device id. A refused request still counts.
export const ACCOUNT_LIMITS = {
  requestCode: { windowSeconds: 3600, perDevice: 5, perIp: 10 },
  verify: { windowSeconds: 3600, perDevice: 20, perIp: 30 },
  save: { windowSeconds: 3600, perDevice: 120, perIp: 360 },
  read: { windowSeconds: 60, perIp: 60 },
  leave: { windowSeconds: 3600, perDevice: 10, perIp: 30 }, // log out, remove email
};
// Per email (salted hash): a few codes an hour. And for everyone together, a
// day's total under the email provider's free daily allowance (100).
export const CODES_PER_EMAIL = { windowSeconds: 3600, limit: 3 };
export const CODES_PER_DAY = { windowSeconds: 86_400, limit: 90 };
/** Auth users made for a code that was never used are removed after this. */
export const STALE_CODE_HOURS = 24;

export const MAX_ACCOUNT_BODY = 10_000; // a save: the collection and the settings

/**
 * Deletes, through the Auth admin API, the Auth users (and so the emails)
 * whose link is gone. Never fails the request it runs in: a user not
 * deleted now stays queued for the next time.
 */
export async function drainErasures(deps: Pick<AccountDeps, "accounts" | "auth" | "log">, limit = 5): Promise<void> {
  try {
    for (const userId of await deps.accounts.erasures(limit)) {
      if (await deps.auth.deleteUser(userId)) await deps.accounts.erased(userId);
    }
  } catch {
    deps.log("account: erasure deferred");
  }
}
