// The game as it is today while saving progress (D150) is switched off:
// ACCOUNTS_ENABLED not set and migration 9 not run. Guest play, making a
// profile, sending wins and the leaderboard work exactly as before, the
// account function only says it is off, and nothing else asks for it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import accountFunction from "../../netlify/functions/account";
import type { AccountDeps } from "../../netlify/accounts/deps";
import { handleAccount } from "../../netlify/accounts/handler";
import { createMemoryAccountStore } from "../../netlify/accounts/memoryAccountStore";
import { createFakePlayerAuth } from "../../netlify/accounts/playerAuth";
import { handleCheckUsername } from "../../netlify/leaderboard/handlers/checkUsername";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetLeaderboard } from "../../netlify/leaderboard/handlers/getLeaderboard";
import { handleGetProfile } from "../../netlify/leaderboard/handlers/getProfile";
import { handleSubmitWin } from "../../netlify/leaderboard/handlers/submitWin";
import type { LeaderboardHandler } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken } from "../../netlify/leaderboard/security";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";
import { DEVICE_HEADER } from "../../src/leaderboard/protocol";
import { accountsEnabled, resetAccountsEnabled } from "../../src/ui/leaderboard/accountClient";
import { accountApi, leaderboardApi, setLeaderboardTransport } from "../../src/ui/leaderboard/api";
import { PROFILE_KEY, leaderboardStore } from "../../src/ui/leaderboard/profile";
import { ProfileScreen } from "../../src/ui/leaderboard/ProfileScreen";
import { flushQueue } from "../../src/ui/leaderboard/winQueue";
import { Root } from "../../src/ui/Root";
import { BLACK_WIN } from "./fixtures";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  });
  leaderboardStore.reload();
  resetAccountsEnabled();
});
afterEach(() => {
  setLeaderboardTransport(null);
  resetAccountsEnabled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const noop = () => {};
const RECORD = { mode: "vs-ai" as const, aiLevel: 4 as const, record: [] };

/** The real leaderboard handlers on a memory store, and the account function switched off. */
function serverWithAccountsOff() {
  const store = createMemoryStore();
  const base = { store, salt: "test salt", now: () => new Date(), newToken, log: () => {} };
  const off: AccountDeps = { ...base, enabled: false, accounts: createMemoryAccountStore(store), auth: createFakePlayerAuth(), adminEmail: null };
  const handlers: Record<string, LeaderboardHandler> = {
    "check-username": handleCheckUsername,
    "claim-username": handleClaimUsername,
    "submit-win": handleSubmitWin,
    "get-leaderboard": handleGetLeaderboard,
    "get-profile": handleGetProfile,
    account: (request) => handleAccount(request, off),
  };
  const calls: string[] = [];
  setLeaderboardTransport(async (input, init) => {
    const url = new URL(String(input), "https://checkervia.example");
    const name = url.pathname.split("/").pop()!;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${name}${url.searchParams.has("action") ? `?${url.searchParams.get("action")}` : ""}`);
    const headers = new Headers(init?.headers);
    const result = await handlers[name]!(
      { method, body: typeof init?.body === "string" ? init.body : "", query: url.searchParams, authorization: headers.get("authorization"), deviceId: headers.get(DEVICE_HEADER), ip: "203.0.113.7" },
      base,
    );
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  });
  return { calls };
}

describe("the game with saving progress switched off", () => {
  it("guest play: no profile, the game screen and the profile screen show nothing about accounts", async () => {
    const { calls } = serverWithAccountsOff();
    expect(await accountsEnabled()).toBe(false);
    expect(leaderboardStore.get().profile).toBeNull();
    // A two player game needs no profile and starts at once.
    const twoPlayer = renderToStaticMarkup(createElement(Root, { initial: { mode: "two-player" as const, aiLevel: 4 as const, record: [] }, checkAi: () => new Promise<"ready">(() => {}) }));
    expect(twoPlayer).toMatch(/aria-label="Row /);
    const create = renderToStaticMarkup(createElement(ProfileScreen, { firstGame: true, onClose: noop, onTerms: noop }));
    expect(create).toContain("Create your profile");
    expect(create).not.toMatch(/Log in|saved profile|email/i);
    // Only the one question "is it on?" went to the account function.
    expect(calls).toEqual(["GET account?status"]);
  });

  it("makes a profile, sends a win and shows it on the leaderboard, as before", async () => {
    const { calls } = serverWithAccountsOff();
    expect((await leaderboardApi.checkUsername("Guest_Fan")).kind).toBe("ok");
    expect((await leaderboardApi.claimUsername("Guest_Fan", "PK", "a07")).kind).toBe("ok");
    const profile = leaderboardStore.get().profile!;
    expect(profile).toMatchObject({ username: "Guest_Fan", country: "PK", avatar: "a07" });
    expect(profile.emailHint).toBeUndefined();
    expect(JSON.parse(storage.get(PROFILE_KEY)!)).not.toHaveProperty("emailHint");

    // A win against the AI goes into the queue and is sent.
    leaderboardStore.enqueue({ gameId: "00000000-0000-4000-8000-000000000001", level: 4, colour: "black", moves: BLACK_WIN });
    await flushQueue();
    expect(leaderboardStore.get().queue).toEqual([]);

    const week = await leaderboardApi.leaderboard(4, "week", 0);
    if (week.kind !== "ok") throw new Error(`leaderboard failed: ${JSON.stringify(week)}`);
    expect(week.value.rows).toEqual([expect.objectContaining({ rank: 1, username: "Guest_Fan", wins: 1 })]);
    expect(week.value.me).toMatchObject({ username: "Guest_Fan", wins: 1 });
    expect((await leaderboardApi.profile("Guest_Fan")).kind).toBe("ok");

    // The board with a profile renders, and no account call was made at all.
    const board = renderToStaticMarkup(createElement(Root, { initial: RECORD, checkAi: () => new Promise<"ready">(() => {}) }));
    expect(board).toMatch(/aria-label="Row /);
    expect(calls.some((call) => call.includes("account"))).toBe(false);
  });

  it("the account function refuses everything but the status question", async () => {
    serverWithAccountsOff();
    expect(await accountApi.status()).toEqual({ kind: "ok", value: { enabled: false, linked: false, emailHint: null } });
    const refused = [
      await accountApi.requestCode("a@b.co", "login"),
      await accountApi.verifyLogin("a@b.co", "123456"),
      await accountApi.verifyLink("a@b.co", "123456"),
      await accountApi.load(),
      await accountApi.save({ owned: [], equipped: {} } as never, {}),
      await accountApi.logout(),
      await accountApi.unlink(),
    ];
    // The browser reads the 503 as "not available" and shows no account control.
    for (const result of refused) expect(result).toEqual({ kind: "serverError", status: 503 });
  });
});

describe("the deployed account function before the owner switches it on", () => {
  const configure = (extra: Record<string, string | undefined>) => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_FakeKeyForTests000000000000");
    vi.stubEnv("LEADERBOARD_HASH_SALT", "test salt");
    vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_FakeKeyForTests000000");
    vi.stubEnv("ADMIN_EMAIL", undefined);
    for (const [name, value] of Object.entries(extra)) vi.stubEnv(name, value);
  };

  it("with ACCOUNTS_ENABLED not set: says it is off and never reaches Supabase", async () => {
    configure({ ACCOUNTS_ENABLED: undefined });
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in this test"));
    const status = await accountFunction(new Request("https://example.test/.netlify/functions/account?action=status"));
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ enabled: false, linked: false, emailHint: null });
    const asked = await accountFunction(new Request("https://example.test/.netlify/functions/account", { method: "POST", body: JSON.stringify({ action: "requestCode", email: "a@b.co", purpose: "login" }) }));
    expect(asked.status).toBe(503);
    expect(await asked.json()).toMatchObject({ code: "accountsOff" });
    expect(network).not.toHaveBeenCalled();
  });

  it("without the publishable key: answers the calm 503, so the game hides every account control", async () => {
    configure({ SUPABASE_ANON_KEY: undefined, ACCOUNTS_ENABLED: undefined });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await accountFunction(new Request("https://example.test/.netlify/functions/account?action=status"));
    expect(status.status).toBe(503);
    expect(errors).toHaveBeenCalledWith("account: not set: SUPABASE_ANON_KEY");
    // The browser reads any answer but "enabled: true" as off.
    setLeaderboardTransport(async () => new Response(JSON.stringify(await status.clone().json().catch(() => ({}))), { status: 503 }));
    expect(await accountsEnabled()).toBe(false);
  });
});

describe("the leaderboard store before migration 9", () => {
  it("finds a profile by its own key with one request, never asking for the table migration 9 adds", async () => {
    const row = { id: "p1", username: "Guest_Fan", username_key: "guest_fan", country: "PK", avatar: "a07", hidden: false, username_changed_at: null };
    const asked: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      asked.push(url.pathname);
      if (url.pathname.endsWith("/player_tokens")) return new Response(JSON.stringify({ code: "PGRST205", message: "no table" }), { status: 404 });
      return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const store = createSupabaseStore("https://example.supabase.co", "sb_secret_FakeKeyForTests000000000000", fetchImpl);
    expect(await store.playerByTokenHash("f".repeat(64))).toMatchObject({ id: "p1", username: "Guest_Fan" });
    expect(asked).toEqual(["/rest/v1/players"]);
  });
});
