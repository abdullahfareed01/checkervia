// Saving progress with an email (D150): the account function with the in
// memory stores, a fake Supabase Auth and a fake clock. Covers every limit
// with its number, the code rules, one email per profile, logging in on a
// second device, logging out, removing the email, and what is never sent.
import { describe, expect, it } from "vitest";
import { ACCOUNT_LIMITS, CODES_PER_DAY, CODES_PER_EMAIL } from "../../netlify/accounts/deps";
import type { AccountDeps } from "../../netlify/accounts/deps";
import { handleAccount } from "../../netlify/accounts/handler";
import { createMemoryAccountStore } from "../../netlify/accounts/memoryAccountStore";
import type { MemoryAccountStore } from "../../netlify/accounts/memoryAccountStore";
import { createFakePlayerAuth } from "../../netlify/accounts/playerAuth";
import type { FakePlayerAuth } from "../../netlify/accounts/playerAuth";
import { handleClaimUsername } from "../../netlify/leaderboard/handlers/claimUsername";
import { handleGetProfile } from "../../netlify/leaderboard/handlers/getProfile";
import type { LeaderboardHandler, LeaderboardRequest } from "../../netlify/leaderboard/http";
import { createMemoryStore } from "../../netlify/leaderboard/memoryStore";
import type { MemoryStore } from "../../netlify/leaderboard/memoryStore";
import { newToken } from "../../netlify/leaderboard/security";
import { CODE_ATTEMPTS, CODE_MINUTES, emailHint, normalEmail } from "../../src/leaderboard/account";

const START = Date.parse("2026-11-20T12:00:00Z");
const ADMIN = "owner@example.com";

interface World {
  store: MemoryStore;
  accounts: MemoryAccountStore;
  auth: FakePlayerAuth;
  deps: AccountDeps;
  clock: { time: number };
  logs: string[];
}

function world(enabled = true): World {
  const clock = { time: START };
  const store = createMemoryStore(() => clock.time);
  const accounts = createMemoryAccountStore(store, () => clock.time);
  const auth = createFakePlayerAuth();
  const logs: string[] = [];
  const deps: AccountDeps = { enabled, store, accounts, auth, adminEmail: ADMIN, salt: "test salt", now: () => new Date(clock.time), newToken, log: (message) => logs.push(message) };
  return { store, accounts, auth, deps, clock, logs };
}

interface Call { body?: unknown; query?: Record<string, string>; token?: string | null; device?: string | null; ip?: string }
const sent: string[] = []; // every response body, to check nothing secret leaks

async function run(handler: LeaderboardHandler | typeof handleAccount, w: World, options: Call = {}) {
  const request: LeaderboardRequest = {
    method: options.body === undefined ? "GET" : "POST",
    body: options.body === undefined ? "" : JSON.stringify(options.body),
    query: new URLSearchParams(options.query ?? {}),
    authorization: options.token ? `Bearer ${options.token}` : null,
    deviceId: options.device === undefined ? "device-aaaaaaaaaaaaaaaa" : options.device,
    ip: options.ip ?? "203.0.113.7",
  };
  const response = await (handler as LeaderboardHandler)(request, w.deps);
  sent.push(JSON.stringify(response.body));
  return { status: response.status, body: response.body as Record<string, any> };
}
const account = (w: World, options: Call) => run(handleAccount, w, options);

async function claim(w: World, username: string, device = "device-aaaaaaaaaaaaaaaa"): Promise<string> {
  const answer = await run(handleClaimUsername, w, { body: { username, country: "none", avatar: "a07" }, device });
  expect(answer.status).toBe(201);
  return answer.body["token"] as string;
}

async function linkEmail(w: World, token: string, email: string, device?: string) {
  expect((await account(w, { body: { action: "requestCode", email, purpose: "link" }, token, device })).status).toBe(200);
  return account(w, { body: { action: "verify", email, code: w.auth.lastCode(normalEmail(email)!), purpose: "link" }, token, device });
}

async function login(w: World, email: string, device = "device-bbbbbbbbbbbbbbbb") {
  expect((await account(w, { body: { action: "requestCode", email, purpose: "login" }, device })).status).toBe(200);
  return account(w, { body: { action: "verify", email, code: w.auth.lastCode(email) ?? "000000", purpose: "login" }, device });
}

describe("the shared email rules", () => {
  it("normalises emails and refuses what is not one", () => {
    expect(normalEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalEmail("not an email")).toBeNull();
    expect(normalEmail(`${"a".repeat(250)}@x.io`)).toBeNull();
  });
  it("masks an email so only its owner recognises it", () => {
    expect(emailHint("ada@gmail.com")).toBe("a•••@g•••.com");
  });
});

describe("switched off", () => {
  it("only says it is off, and does nothing else", async () => {
    const w = world(false);
    expect((await account(w, { query: { action: "status" } })).body).toEqual({ enabled: false, linked: false, emailHint: null });
    const asked = await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "login" } });
    expect(asked.status).toBe(503);
    expect(w.auth.users.size).toBe(0);
  });
});

describe("saving a profile to an email", () => {
  it("links after the right code, and the session from Supabase is ended at once", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    const linked = await linkEmail(w, token, "Ada@Example.com");
    expect(linked).toEqual({ status: 200, body: { linked: true, emailHint: "a•••@e•••.com" } });
    expect(w.auth.revoked).toBe(1);
    expect((await account(w, { query: { action: "status" }, token })).body).toEqual({ enabled: true, linked: true, emailHint: "a•••@e•••.com" });
  });

  it("needs the profile's own token, and refuses a second email for the same profile", async () => {
    const w = world();
    expect((await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "link" } })).status).toBe(401);
    const token = await claim(w, "Ada");
    await linkEmail(w, token, "a@b.co");
    const again = await account(w, { body: { action: "requestCode", email: "c@d.co", purpose: "link" }, token });
    expect(again.status).toBe(409);
    expect(again.body["code"]).toBe("profileLinked");
  });

  it("one email, one profile: the conflict is told only after the code proves the email", async () => {
    const w = world();
    await linkEmail(w, await claim(w, "Ada"), "shared@b.co");
    const other = await claim(w, "Grace", "device-cccccccccccccccc");
    const asked = await account(w, { body: { action: "requestCode", email: "shared@b.co", purpose: "link" }, token: other, device: "device-cccccccccccccccc" });
    expect(asked.body).toEqual({ sent: true });
    const verified = await account(w, { body: { action: "verify", email: "shared@b.co", code: w.auth.lastCode("shared@b.co"), purpose: "link" }, token: other, device: "device-cccccccccccccccc" });
    expect(verified.status).toBe(409);
    expect(verified.body["error"]).toBe("This email is already used for the profile Ada. Log in with it instead, or use a different email.");
    expect(w.accounts.links).toHaveLength(1);
  });

  it("gives the admin's email no code, with the same answer as anyone else", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    const asked = await account(w, { body: { action: "requestCode", email: ADMIN.toUpperCase(), purpose: "link" }, token });
    expect(asked).toEqual({ status: 200, body: { sent: true } });
    expect(w.auth.users.has(ADMIN)).toBe(false);
    expect(w.auth.lastCode(ADMIN)).toBeNull();
  });
});

describe("codes", () => {
  it("never tells whether an email has a saved profile when asking for a login code", async () => {
    const w = world();
    expect((await account(w, { body: { action: "requestCode", email: "nobody@b.co", purpose: "login" } })).body).toEqual({ sent: true });
  });

  it(`expire after ${CODE_MINUTES} minutes`, async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "link" }, token });
    w.clock.time += CODE_MINUTES * 60_000 + 1000;
    const late = await account(w, { body: { action: "verify", email: "a@b.co", code: w.auth.lastCode("a@b.co"), purpose: "link" }, token });
    expect(late.body["code"]).toBe("codeExpired");
  });

  it(`allow ${CODE_ATTEMPTS} wrong tries, then the code is void even if right`, async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "link" }, token });
    const right = w.auth.lastCode("a@b.co")!;
    const wrong = right === "111111" ? "222222" : "111111";
    const answers = [];
    for (let n = 0; n < CODE_ATTEMPTS; n++) answers.push((await account(w, { body: { action: "verify", email: "a@b.co", code: wrong, purpose: "link" }, token })).body["code"]);
    expect(answers).toEqual([...Array(CODE_ATTEMPTS - 1).fill("wrongCode"), "tooManyWrong"]);
    expect((await account(w, { body: { action: "verify", email: "a@b.co", code: right, purpose: "link" }, token })).body["code"]).toBe("tooManyWrong");
  });

  it("work once only", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await linkEmail(w, token, "a@b.co");
    const reused = await account(w, { body: { action: "verify", email: "a@b.co", code: "123456", purpose: "link" }, token });
    expect(reused.body["code"]).toBe("codeExpired");
  });
});

describe("limits", () => {
  it(`allow ${CODES_PER_EMAIL.limit} codes an hour per email`, async () => {
    const w = world();
    const statuses = [];
    for (let n = 0; n <= CODES_PER_EMAIL.limit; n++) statuses.push((await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "login" }, ip: `198.51.100.${n}`, device: `device-${String(n).padStart(16, "x")}` })).status);
    expect(statuses).toEqual([...Array(CODES_PER_EMAIL.limit).fill(200), 429]);
  });

  it(`allow ${ACCOUNT_LIMITS.requestCode.perDevice} code requests an hour per device and ${ACCOUNT_LIMITS.requestCode.perIp} per IP`, async () => {
    const w = world();
    const device = [];
    for (let n = 0; n <= ACCOUNT_LIMITS.requestCode.perDevice; n++) device.push((await account(w, { body: { action: "requestCode", email: `d${n}@b.co`, purpose: "login" }, ip: `198.51.100.${n}` })).status);
    expect(device.at(-1)).toBe(429);
    expect(device.slice(0, -1).every((status) => status === 200)).toBe(true);
    const ip = [];
    for (let n = 0; n <= ACCOUNT_LIMITS.requestCode.perIp; n++) ip.push((await account(w, { body: { action: "requestCode", email: `i${n}@b.co`, purpose: "login" }, device: `device-${String(n).padStart(16, "y")}`, ip: "192.0.2.1" })).status);
    expect(ip.at(-1)).toBe(429);
    expect(ip.slice(0, -1).every((status) => status === 200)).toBe(true);
  });

  it(`stop at ${CODES_PER_DAY.limit} code emails a day in total`, async () => {
    const w = world();
    let last = { status: 0, body: {} as Record<string, any> };
    for (let n = 0; n <= CODES_PER_DAY.limit; n++) last = await account(w, { body: { action: "requestCode", email: `t${n}@b.co`, purpose: "login" }, device: `device-${String(n).padStart(16, "z")}`, ip: `10.0.${Math.floor(n / 200)}.${n % 200}` });
    expect(last.status).toBe(429);
    expect(last.body["code"]).toBe("dailyLimit");
  });

  it(`allow ${ACCOUNT_LIMITS.verify.perDevice} code checks an hour per device`, async () => {
    const w = world();
    let last = 0;
    for (let n = 0; n <= ACCOUNT_LIMITS.verify.perDevice; n++) last = (await account(w, { body: { action: "verify", email: `v${n}@b.co`, code: "123456", purpose: "login" } })).status;
    expect(last).toBe(429);
  });
});

describe("logging in on another device", () => {
  it("brings the profile and its saved data, and both devices keep working", async () => {
    const w = world();
    const first = await claim(w, "Ada");
    await linkEmail(w, first, "a@b.co");
    const saved = await account(w, { body: { action: "save", collection: { owned: ["jade"], equipped: { board: "jade", pieces: "classic", effect: "classic" } }, settings: { sound: false } }, token: first });
    expect(saved.status).toBe(200);
    const answer = await login(w, "a@b.co");
    expect(answer.status).toBe(200);
    const second = answer.body["profile"]["token"] as string;
    expect(second).not.toBe(first);
    expect(answer.body["profile"]["username"]).toBe("Ada");
    expect(answer.body["save"]["collection"]["owned"]).toContain("jade");
    expect(answer.body["save"]["settings"]).toEqual({ sound: false });
    for (const token of [first, second]) expect((await account(w, { query: { action: "status" }, token })).body["linked"]).toBe(true);
    expect((await run(handleGetProfile, w, { query: { username: "Ada" }, token: second })).status).toBe(200);
  });

  it("says when no saved profile uses the email (after the code proves it)", async () => {
    const w = world();
    await linkEmail(w, await claim(w, "Ada"), "a@b.co");
    await account(w, { body: { action: "unlink" }, token: (await login(w, "a@b.co")).body["profile"]["token"] });
    // The Auth user is gone with the link, so a new login code is never sent.
    expect((await login(w, "a@b.co")).body["code"]).toBe("codeExpired");
  });

  it("refuses a hidden profile", async () => {
    const w = world();
    await linkEmail(w, await claim(w, "Ada"), "a@b.co");
    w.store.hidePlayer(w.store.players[0]!.id);
    expect((await login(w, "a@b.co")).body["code"]).toBe("profileUnavailable");
  });

  it("keeps only known shop items from a save", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await linkEmail(w, token, "a@b.co");
    await account(w, { body: { action: "save", collection: { owned: ["jade", "free-gold"], equipped: { board: "gold" } }, settings: {} }, token });
    const loaded = await account(w, { query: { action: "load" }, token });
    expect(loaded.body["save"]["collection"]["owned"]).not.toContain("free-gold");
    expect(loaded.body["save"]["collection"]["equipped"]["board"]).toBe("classic");
  });
});

describe("logging out and removing the email", () => {
  it("logs one device out; the other keeps working", async () => {
    const w = world();
    const first = await claim(w, "Ada");
    await linkEmail(w, first, "a@b.co");
    const second = (await login(w, "a@b.co")).body["profile"]["token"] as string;
    expect((await account(w, { body: { action: "logout" }, token: second })).status).toBe(200);
    expect((await account(w, { query: { action: "load" }, token: second })).status).toBe(401);
    expect((await account(w, { query: { action: "load" }, token: first })).status).toBe(200);
    expect((await account(w, { body: { action: "logout" }, token: first })).status).toBe(200);
    expect((await account(w, { query: { action: "load" }, token: first })).status).toBe(401);
    // Logged out everywhere, the email still brings the profile back.
    expect((await login(w, "a@b.co")).body["profile"]["username"]).toBe("Ada");
  });

  it("will not log out a profile that is not saved (it would be lost)", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    expect((await account(w, { body: { action: "logout" }, token })).body["code"]).toBe("notSaved");
  });

  it("removing the email deletes it from Supabase Auth with the saved data", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await linkEmail(w, token, "a@b.co");
    await account(w, { body: { action: "save", collection: {}, settings: {} }, token });
    expect((await account(w, { body: { action: "unlink" }, token })).status).toBe(200);
    expect(w.auth.users.has("a@b.co")).toBe(false);
    expect(await w.accounts.saved(w.store.players[0]!.id)).toBeNull();
    expect((await account(w, { query: { action: "status" }, token })).body["linked"]).toBe(false);
  });

  it("deleting a profile queues its email for deletion", async () => {
    const w = world();
    await linkEmail(w, await claim(w, "Ada"), "a@b.co");
    const userId = w.auth.users.get("a@b.co")!;
    w.accounts.deletePlayer(w.store.players[0]!.id);
    expect(await w.accounts.erasures(10)).toEqual([userId]);
  });

  it("removes Auth users made for a code that was never used, after a day", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await account(w, { body: { action: "requestCode", email: "a@b.co", purpose: "link" }, token });
    expect(w.auth.users.has("a@b.co")).toBe(true);
    w.clock.time += 25 * 3_600_000;
    await account(w, { body: { action: "requestCode", email: "other@b.co", purpose: "login" }, device: "device-dddddddddddddddd" });
    expect(w.auth.users.has("a@b.co")).toBe(false);
  });
});

describe("never sent or logged", () => {
  it("no Supabase token, code or email appears in any answer or log", async () => {
    const w = world();
    const token = await claim(w, "Ada");
    await linkEmail(w, token, "secret.person@example.org");
    await login(w, "secret.person@example.org");
    const everything = [...sent, ...w.logs].join("\n");
    expect(everything).not.toMatch(/access_token|refresh_token|eyJ/);
    expect(everything).not.toContain("secret.person@example.org");
  });
});
