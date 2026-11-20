// The browser's side of saving progress (D150): whether accounts are on,
// the words for each refusal, bringing a saved profile to this device, and
// keeping a saved profile's shop collection and settings in step with the
// server. Guest play and unsaved profiles never call any of this.
import { useEffect, useState } from "react";
import type { AccountSave, LoginResponse } from "../../leaderboard/account";
import { settingsStore } from "../settings";
import type { Settings } from "../settings";
import { collectionStoreFor } from "../useMarketplace";
import { accountApi } from "./api";
import type { ApiResult } from "./api";
import { leaderboardStore, useLeaderboardProfile } from "./profile";

/** When this device last sent or took the saved data (the server's time). */
export const SYNC_KEY = "checkervia.account.sync";
const PUSH_DELAY_MS = 2000;

let enabled: Promise<boolean> | null = null;
/** Whether the owner has switched accounts on; asked once per visit. */
export function accountsEnabled(): Promise<boolean> {
  enabled ??= accountApi.status().then((result) => result.kind === "ok" && result.value.enabled);
  return enabled;
}
export function useAccountsEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void accountsEnabled().then((value) => live && setOn(value));
    return () => { live = false; };
  }, []);
  return on;
}
/** Tests: ask again. */
export const resetAccountsEnabled = () => { enabled = null; };

const CODE_TEXT: Record<string, string> = {
  rateLimited: "Too many tries. Please wait a moment and try again.",
  dailyLimit: "Too many login emails were sent today. Please try again tomorrow.",
  codeExpired: "This code has expired. Request a new one.",
  tooManyWrong: "Too many wrong codes. Request a new one.",
  wrongCode: "That code is not right. Check it and try again.",
  profileLinked: "This profile is already saved to an email.",
  noSavedProfile: "No saved profile uses this email. Open your profile and choose Save your progress first.",
  profileUnavailable: "This profile is not available.",
  notSaved: "This profile is not saved to an email yet.",
  accountsOff: "Saving progress is not available yet.",
};

/** The words for a result that did not work. */
export function accountProblemText(result: Exclude<ApiResult<unknown>, { kind: "ok" }>): string {
  if (result.kind === "offline") return "You are offline. Connect to the internet and try again.";
  if (result.kind === "serverError") return "Saving progress is not available right now. Please try again later.";
  // The one answer that names another profile comes in the server's own words.
  if (result.code === "emailTaken" && result.message) return result.message;
  if (result.code === "emailTaken") return "This email is already used for another profile. Log in with it instead, or use a different email.";
  return CODE_TEXT[result.code] ?? "That did not work. Please try again.";
}

function readSync(): number {
  try { return Date.parse(localStorage.getItem(SYNC_KEY) ?? "") || 0; } catch { return 0; }
}
function writeSync(iso: string): void {
  try { localStorage.setItem(SYNC_KEY, iso); } catch { /* Private mode: syncs again next visit. */ }
}

let applying = false;
/** Puts saved data on this device for the profile with this token. */
export async function applySave(token: string, save: AccountSave | null): Promise<void> {
  if (!save) return;
  applying = true;
  try {
    (await collectionStoreFor(token)).replace(save.collection);
    settingsStore().update(() => save.settings as unknown as Settings);
  } finally {
    applying = false;
  }
  writeSync(save.updatedAt);
}

/** After a correct login code: this device now uses the saved profile. */
export async function finishLogin(response: LoginResponse): Promise<void> {
  leaderboardStore.switchProfile({ ...response.profile, emailHint: response.emailHint });
  await applySave(response.profile.token, response.save);
}

/** Sends this device's collection and settings for the saved profile. */
export async function pushSave(token: string): Promise<void> {
  const collection = (await collectionStoreFor(token)).get();
  const result = await accountApi.save(collection, settingsStore().get());
  if (result.kind === "ok") writeSync(result.value.updatedAt);
  // Removed on another device: this one is no longer saved either.
  if (result.kind === "failed" && result.code === "notSaved") leaderboardStore.updateProfile({ emailHint: undefined });
}

/**
 * For a saved profile: take newer saved data when the app opens, then send
 * changes to the shop collection and the settings a moment after they
 * happen. Mounted once, near the root.
 */
export function useAccountSync(): void {
  const profile = useLeaderboardProfile().profile;
  const token = profile?.emailHint ? profile.token : null;
  useEffect(() => {
    if (!token) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe: Array<() => void> = [];
    const schedule = () => {
      if (applying) return;
      clearTimeout(timer);
      timer = setTimeout(() => void pushSave(token), PUSH_DELAY_MS);
    };
    void (async () => {
      const loaded = await accountApi.load();
      if (!live) return;
      if (loaded.kind === "ok" && loaded.value.save && Date.parse(loaded.value.save.updatedAt) > readSync()) await applySave(token, loaded.value.save);
      if (loaded.kind === "failed" && loaded.code === "notSaved") leaderboardStore.updateProfile({ emailHint: undefined });
      const collection = await collectionStoreFor(token);
      if (live) unsubscribe.push(collection.subscribe(schedule), settingsStore().subscribe(schedule));
    })();
    return () => {
      live = false;
      clearTimeout(timer);
      unsubscribe.forEach((stop) => stop());
    };
  }, [token]);
}
