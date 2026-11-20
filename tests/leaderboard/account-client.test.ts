// Saving progress in the browser (D150): the whole round trip through the
// real handlers (save on one device, log in on a fresh one, the shop and
// settings come back), the warning before a login replaces a profile, the
// words for refusals, and the saved profile kept in storage.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountDeps } from "../../netlify/accounts/deps";
import { handleAccount } from "../../netlify/accounts/handler";
import { createMemoryAccountStore } from "../../netlify/accounts/memoryAccountStore";
import { createFakePlayerAuth } from "../../netlify/accounts/playerAuth";
import type { FakePlayerAuth } from "../../netlify/accounts/playerAuth";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import type { LeaderboardHandler } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken } from "../../netlify/leaderboard/security";
import { DEVICE_HEADER } from "../../src/leaderboard/protocol";
import { replaceWarning } from "../../src/ui/leaderboard/AccountDialog";
import { accountProblemText, finishLogin } from "../../src/ui/leaderboard/accountClient";
import { accountApi, leaderboardApi, setLeaderboardTransport } from "../../src/ui/leaderboard/api";
import { PROFILE_KEY, leaderboardStore } from "../../src/ui/leaderboard/profile";
import { settingsStore } from "../../src/ui/settings";
import { collectionStoreFor } from "../../src/ui/useMarketplace";
import { BLACK_WIN } from "./fixtures";

const storage = new Map<string, string>();
function freshBrowser() {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
  leaderboardStore.reload();
  settingsStore().reset();
}
beforeEach(freshBrowser);
afterEach(() => setLeaderboardTransport(null));

function server(): FakePlayerAuth {
  const store = createMemoryStore();
  const auth = createFakePlayerAuth();
  const base = { store, salt: "test salt", now: () => new Date(), newToken, log: () => {} };
  const deps: AccountDeps = { ...base, enabled: true, accounts: createMemoryAccountStore(store), auth, adminEmail: null };
  const handlers: Record<string, LeaderboardHandler> = { "claim-username": handleClaimUsername, account: (request) => handleAccount(request, deps) };
  setLeaderboardTransport(async (input, init) => {
    const url = new URL(String(input), "https://checkervia.example");
    const headers = new Headers(init?.headers);
    const result = await handlers[url.pathname.split("/").pop()!]!(
      { method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : "", query: url.searchParams, authorization: headers.get("authorization"), deviceId: headers.get(DEVICE_HEADER), ip: "203.0.113.7" },
      base,
    );
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  });
  return auth;
}

describe("saving progress, then logging in on a fresh device", () => {
  it("brings back the profile, the shop collection and the settings", async () => {
    const auth = server();
    expect((await leaderboardApi.claimUsername("Ada_Saves", "none", "a07")).kind).toBe("ok");
    const first = leaderboardStore.get().profile!;
    const shop = await collectionStoreFor(first.token);
    shop.addDemo("jade");
    shop.equip("jade");
    settingsStore().update((current) => ({ ...current, board: { ...current.board, theme: "slate" } }));

    expect((await accountApi.requestCode("ada@example.com", "link")).kind).toBe("ok");
    const linked = await accountApi.verifyLink("ada@example.com", auth.lastCode("ada@example.com")!);
    expect(linked.kind).toBe("ok");
    expect((await accountApi.save(shop.get(), settingsStore().get())).kind).toBe("ok");

    freshBrowser(); // a new phone: nothing in storage, default settings
    expect(settingsStore().get().board.theme).not.toBe("slate");
    expect((await accountApi.requestCode("ada@example.com", "login")).kind).toBe("ok");
    const login = await accountApi.verifyLogin("ada@example.com", auth.lastCode("ada@example.com")!);
    if (login.kind !== "ok") throw new Error(`login failed: ${JSON.stringify(login)}`);
    await finishLogin(login.value);

    const now = leaderboardStore.get().profile!;
    expect(now.username).toBe("Ada_Saves");
    expect(now.token).not.toBe(first.token);
    expect(now.emailHint).toBe("a•••@e•••.com");
    expect(JSON.parse(storage.get(PROFILE_KEY)!).emailHint).toBe("a•••@e•••.com");
    expect((await collectionStoreFor(now.token)).get()).toMatchObject({ equipped: { board: "jade" } });
    expect(settingsStore().get().board.theme).toBe("slate");
  });

  it("drops the replaced profile's unsent wins, so they are never sent as the new profile's", async () => {
    leaderboardStore.setProfile({ username: "Guest_One", country: null, avatar: null, token: "B".repeat(43) });
    leaderboardStore.enqueue({ gameId: "00000000-0000-4000-8000-000000000001", level: 4, colour: "black", moves: BLACK_WIN });
    await finishLogin({ profile: { username: "Ada_Saves", country: null, avatar: null, token: "C".repeat(43) }, emailHint: "a•••@e•••.com", save: null });
    expect(leaderboardStore.get().queue).toEqual([]);
    expect(leaderboardStore.get().profile?.username).toBe("Ada_Saves");
  });
});

describe("the warning before a login replaces this device's profile", () => {
  it("says exactly what happens to a profile that is not saved", () => {
    expect(replaceWarning("Guest_One", false, 2)).toEqual({
      title: "Replace this device's profile?",
      lines: [
        "This device has the profile Guest_One, and it is not saved to an email. If you log in, this device forgets Guest_One. Its wins stay on the leaderboard, but you will not be able to use it again. Its shop unlocks and settings on this device are replaced by your saved ones.",
        "2 wins have not been sent yet and will be lost.",
        "To keep Guest_One, save it to its own email first.",
      ],
      go: "Log in anyway",
      keep: "Keep Guest_One",
    });
    expect(replaceWarning("Guest_One", false, 0).lines).toHaveLength(2);
  });
  it("is calmer for a profile that is saved", () => {
    expect(replaceWarning("Ada_Saves", true, 0).lines[0]).toContain("stays saved to its email");
  });
});

describe("refusals in words", () => {
  it("passes on the name of the profile that has the email, and words every other case", () => {
    expect(accountProblemText({ kind: "failed", status: 409, code: "emailTaken", message: "This email is already used for the profile Ada. Log in with it instead, or use a different email." })).toContain("the profile Ada");
    expect(accountProblemText({ kind: "failed", status: 429, code: "dailyLimit" })).toBe("Too many login emails were sent today. Please try again tomorrow.");
    expect(accountProblemText({ kind: "failed", status: 400, code: "tooManyWrong" })).toBe("Too many wrong codes. Request a new one.");
    expect(accountProblemText({ kind: "offline" })).toContain("offline");
  });
});
