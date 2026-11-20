// What a saved profile keeps on the server (D150): the shop collection and
// the settings, plus logging out on one device and removing the email.
// Only a profile saved to an email has these: otherwise there would be no
// way to get them back, and logging out would lose the profile for ever.
import { SETTINGS_MAX_CHARS } from "../../src/leaderboard/account";
import type { AccountSave, AccountStatus } from "../../src/leaderboard/account";
import { parseCollection } from "../../src/state/marketplace";
import { bearerToken, sha256Hex } from "../leaderboard/security";
import { checkRateLimits, fail, invalid, notSignedIn, ok, playerFromToken, validDevice } from "../leaderboard/http";
import type { LeaderboardRequest, LeaderboardResponse } from "../leaderboard/http";
import type { PlayerRecord } from "../leaderboard/store";
import { ACCOUNT_LIMITS, drainErasures } from "./deps";
import type { AccountDeps } from "./deps";
import type { AccountLink, SavedData } from "./store";

const notSaved = () => fail(403, "notSaved", "This profile is not saved to an email yet.");
const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Saved data as the browser gets it: the collection checked against the catalogue again. */
export function savedForBrowser(saved: SavedData | null): AccountSave | null {
  if (!saved) return null;
  return {
    collection: parseCollection(JSON.stringify(saved.collection)),
    settings: isPlainObject(saved.settings) ? saved.settings : {},
    updatedAt: saved.updatedAt.toISOString(),
  };
}

/** The signed in, saved profile, or the answer that refuses the request. */
async function savedProfile(request: LeaderboardRequest, deps: AccountDeps): Promise<{ player: PlayerRecord; link: AccountLink } | LeaderboardResponse> {
  const player = await playerFromToken(request, deps.store);
  if (!player) return notSignedIn();
  const link = await deps.accounts.linkOfPlayer(player.id);
  return link ? { player, link } : notSaved();
}

export async function status(request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const limited = await checkRateLimits("accountRead", ACCOUNT_LIMITS.read, request, deps);
  if (limited) return limited;
  const player = request.authorization ? await playerFromToken(request, deps.store) : null;
  const link = player ? await deps.accounts.linkOfPlayer(player.id) : null;
  const body: AccountStatus = { enabled: true, linked: link !== null, emailHint: link?.emailHint ?? null };
  return ok(body);
}

export async function load(request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const limited = await checkRateLimits("accountRead", ACCOUNT_LIMITS.read, request, deps);
  if (limited) return limited;
  const found = await savedProfile(request, deps);
  if (!("player" in found)) return found;
  return ok({ save: savedForBrowser(await deps.accounts.saved(found.player.id)) });
}

export async function save(body: Record<string, unknown>, request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  const collection = body["collection"];
  const settings = body["settings"];
  if (!validDevice(request) || !isPlainObject(collection) || !isPlainObject(settings) || JSON.stringify(settings).length > SETTINGS_MAX_CHARS) return invalid();
  const limited = await checkRateLimits("accountSave", ACCOUNT_LIMITS.save, request, deps);
  if (limited) return limited;
  const found = await savedProfile(request, deps);
  if (!("player" in found)) return found;
  // Only known items are kept: a saved collection is never proof of payment (D96).
  const updatedAt = await deps.accounts.putSaved(found.player.id, parseCollection(JSON.stringify(collection)), settings);
  return ok({ updatedAt: updatedAt.toISOString() });
}

export async function logout(request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  if (!validDevice(request)) return invalid();
  const limited = await checkRateLimits("accountLeave", ACCOUNT_LIMITS.leave, request, deps);
  if (limited) return limited;
  const found = await savedProfile(request, deps);
  if (!("player" in found)) return found;
  const tokenHash = await sha256Hex(bearerToken(request.authorization)!);
  // A device key from a login goes; the profile's first key is replaced by one nobody has.
  if (!(await deps.accounts.removeDeviceToken(tokenHash))) await deps.accounts.replaceFirstToken(found.player.id, await sha256Hex(deps.newToken()));
  return ok({ loggedOut: true });
}

export async function unlink(request: LeaderboardRequest, deps: AccountDeps): Promise<LeaderboardResponse> {
  if (!validDevice(request)) return invalid();
  const limited = await checkRateLimits("accountLeave", ACCOUNT_LIMITS.leave, request, deps);
  if (limited) return limited;
  const found = await savedProfile(request, deps);
  if (!("player" in found)) return found;
  await deps.accounts.unlink(found.player.id);
  await drainErasures(deps);
  return ok({ unlinked: true });
}
