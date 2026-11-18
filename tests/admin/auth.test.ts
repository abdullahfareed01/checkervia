// The admin's sign in and guard (D100), with a fake Supabase Auth: missing,
// malformed, unknown and other users' tokens are refused; a token without
// the second factor is refused; only the allow listed ADMIN_EMAIL gets in;
// every step is rate limited and audited; the refresh token only ever
// travels in the HttpOnly cookie.
import { describe, expect, it } from "vitest";
import { handleAdminApi } from "../../netlify/admin/api";
import { readRefreshCookie } from "../../netlify/admin/cookie";
import { handleAdminAuth } from "../../netlify/admin/handlers/auth";
import { ADMIN_EMAIL, ADMIN_ID, FACTOR_ID, NOW, OTHER_ID, adminToken, bearer, deps, fakeAuth, fakeStore, passwordToken, request, token } from "./fakes";

const players = (headers: Record<string, string>, extra: Record<string, string> = {}) => request({ op: "players", params: {} }, { ...headers, ...extra });
const valid = (world: ReturnType<typeof deps>, value: string) => {
  world.auth.state.valid.add(value);
  return value;
};

describe("the guard on admin-api", () => {
  it("lets the signed in admin with the second factor through", async () => {
    const world = deps();
    const answer = await handleAdminApi(players(bearer(valid(world, adminToken()))), world);
    expect(answer).toEqual({ status: 200, body: { rows: [], next: null } });
  });

  it("refuses a missing, a malformed and an unknown token", async () => {
    const world = deps();
    expect((await handleAdminApi(players({}), world)).status).toBe(401);
    expect((await handleAdminApi(players({ authorization: "Bearer not-a-jwt" }), world)).status).toBe(401);
    expect((await handleAdminApi(players({ authorization: `Basic ${adminToken()}` }), world)).status).toBe(401);
    // The right shape and claims, but Supabase does not accept it (forged, expired or signed out).
    expect(await handleAdminApi(players(bearer(adminToken())), world)).toMatchObject({ status: 401, body: { code: "noSession" } });
    expect(await handleAdminApi(players(bearer(token({ sub: ADMIN_ID, email: ADMIN_EMAIL, aal: "aal2" }, "forged"))), world)).toMatchObject({ status: 401 });
  });

  it("refuses a real token of another user, and writes it to the audit log", async () => {
    const world = deps();
    const other = valid(world, adminToken({ sub: OTHER_ID, email: "someone@example.com" }));
    expect(await handleAdminApi(players(bearer(other)), world)).toMatchObject({ status: 403, body: { code: "notAdmin" } });
    expect(world.store.state.logs).toEqual([expect.objectContaining({ action: "access.refused", outcome: "refused", details: { why: "notAdminEmail", user: OTHER_ID } })]);
    // Claims that name the admin on another user's token change nothing.
    const lying = valid(world, adminToken({ sub: OTHER_ID }));
    expect((await handleAdminApi(players(bearer(lying)), world)).status).toBe(403);
  });

  it("refuses the admin without the second factor, or with an old one", async () => {
    const world = deps();
    expect(await handleAdminApi(players(bearer(valid(world, passwordToken()))), world)).toMatchObject({ status: 403, body: { code: "mfaRequired" } });
    expect((await handleAdminApi(players(bearer(valid(world, adminToken({ aal: "aal1" })))), world)).status).toBe(403);
    const thirteenHours = NOW.getTime() / 1000 - 13 * 3600;
    expect((await handleAdminApi(players(bearer(valid(world, adminToken({ totpAt: thirteenHours })))), world)).status).toBe(401);
    // The authenticator was removed in Supabase: the token alone is not enough.
    world.auth.state.users.set(ADMIN_ID, { id: ADMIN_ID, email: ADMIN_EMAIL, factors: [] });
    expect((await handleAdminApi(players(bearer(valid(world, adminToken()))), world)).status).toBe(403);
  });

  it("refuses the admin email when it is not on the database allow list", async () => {
    const world = deps();
    world.store.state.allowList.clear();
    expect(await handleAdminApi(players(bearer(valid(world, adminToken()))), world)).toMatchObject({ status: 403, body: { code: "notAdmin" } });
    expect(world.store.state.logs.at(-1)).toMatchObject({ action: "access.refused", details: { why: "notOnAllowList" } });
  });

  it("refuses requests that do not come from the admin page", async () => {
    const world = deps();
    const good = bearer(valid(world, adminToken()));
    expect((await handleAdminApi(players(good, { "x-checkervia-admin": "" }), world)).status).toBe(400);
    expect((await handleAdminApi(players(good, { origin: "https://evil.example" }), world)).status).toBe(400);
    expect((await handleAdminApi(players(good, { "sec-fetch-site": "cross-site" }), world)).status).toBe(400);
    expect(world.auth.state.calls).toEqual([]);
  });

  it("refuses unknown operations, unknown params and bad values before anything else", async () => {
    const world = deps();
    const good = bearer(valid(world, adminToken()));
    expect((await handleAdminApi(request({ op: "dropEverything", params: {} }, good), world)).status).toBe(400);
    expect((await handleAdminApi(request({ op: "players", params: { sql: "1" } }, good), world)).status).toBe(400);
    expect((await handleAdminApi(request({ op: "players", params: { sort: "password" } }, good), world)).status).toBe(400);
    expect((await handleAdminApi(request({ op: "players", params: { limit: 5000 } }, good), world)).status).toBe(400);
    expect((await handleAdminApi(request({ op: "player", params: { id: "1 or 1=1" } }, good), world)).status).toBe(400);
    expect((await handleAdminApi(request("not json", good), world)).status).toBe(400);
  });

  it("rate limits by address before asking Supabase, and by account", async () => {
    const world = deps();
    world.store.state.limits.set("admin:read:ip:", 2);
    const unknown = bearer(adminToken());
    for (let index = 0; index < 2; index++) await handleAdminApi(players(unknown), world);
    const callsBefore = world.auth.state.calls.length;
    expect(await handleAdminApi(players(unknown), world)).toMatchObject({ status: 429, body: { code: "rateLimited", retryAfter: 60 } });
    expect(world.auth.state.calls.length).toBe(callsBefore);

    const second = deps();
    second.store.state.limits.set("admin:read:user:", 1);
    const good = bearer(valid(second, adminToken()));
    expect((await handleAdminApi(players(good), second)).status).toBe(200);
    expect((await handleAdminApi(players(good, {}), second)).status).toBe(429);
  });

  it("answers a calm 503 on a storage failure and logs only its code", async () => {
    const store = fakeStore({
      players: async () => {
        throw Object.assign(new Error("relation secret_value does not exist"), { code: "42P01" });
      },
    });
    const world = deps(store);
    const answer = await handleAdminApi(players(bearer(valid(world, adminToken()))), world);
    expect(answer.status).toBe(503);
    expect(world.logged).toEqual(["admin api: storage error 42P01"]);
  });
});

const auth = (body: Record<string, unknown>, headers: Record<string, string> = {}) => request(body, headers);

describe("the sign in", () => {
  it("goes from the password to the code, puts the refresh token in an HttpOnly cookie, and audits both steps", async () => {
    const world = deps();
    const step = await handleAdminAuth(auth({ action: "signIn", email: "Owner@Example.com ", password: world.auth.state.password }), world);
    expect(step).toMatchObject({ status: 200, body: { step: "verify", factorId: FACTOR_ID } });
    expect(step.setCookie).toBeUndefined();
    const pendingToken = (step.body as { pendingToken: string }).pendingToken;
    // The password step's token is not enough for the dashboard.
    expect((await handleAdminApi(players(bearer(pendingToken)), world)).status).toBe(403);

    const signedIn = await handleAdminAuth(auth({ action: "verify", code: "123456" }, bearer(pendingToken)), world);
    expect(signedIn).toMatchObject({ status: 200, body: { email: ADMIN_EMAIL } });
    expect(JSON.stringify(signedIn.body)).not.toContain("refreshadmin12345");
    expect(signedIn.setCookie).toMatch(/^__Secure-checkervia-admin=refreshadmin12345; Path=\/\.netlify\/functions\/admin-auth; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict$/);
    expect(Number(/Max-Age=(\d+)/.exec(signedIn.setCookie!)![1])).toBeLessThanOrEqual(12 * 3600);
    const accessToken = (signedIn.body as { accessToken: string }).accessToken;
    expect((await handleAdminApi(players(bearer(accessToken)), world)).status).toBe(200);
    expect(world.store.state.logs.map((entry) => [entry.action, entry.outcome])).toEqual([
      ["auth.password", "ok"],
      ["auth.signin", "ok"],
    ]);
  });

  it("answers a wrong password and another email the same way, and never sends another email to Supabase", async () => {
    const world = deps();
    const wrong = await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: "nope" }), world);
    const other = await handleAdminAuth(auth({ action: "signIn", email: "attacker@example.com", password: "nope" }), world);
    expect(wrong).toEqual(other);
    expect(wrong).toMatchObject({ status: 401, body: { code: "badCredentials" } });
    expect(world.auth.state.calls).toEqual([`signIn ${ADMIN_EMAIL}`]);
    expect(JSON.stringify(world.store.state.logs)).not.toContain("attacker");
    expect(world.store.state.logs.map((entry) => entry.details)).toEqual([{ why: "password" }, { why: "otherEmail" }]);
  });

  it("limits password tries per address", async () => {
    const world = deps();
    for (let index = 0; index < 8; index++) await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: `guess ${index}` }), world);
    expect(await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: world.auth.state.password }), world)).toMatchObject({ status: 429 });
    expect(world.auth.state.calls.filter((call) => call.startsWith("signIn"))).toHaveLength(8);
  });

  it("refuses a wrong code, and limits codes per account", async () => {
    const world = deps();
    const pendingToken = valid(world, passwordToken());
    expect(await handleAdminAuth(auth({ action: "verify", code: "000000" }, bearer(pendingToken)), world)).toMatchObject({ status: 401, body: { code: "badCode" } });
    expect(await handleAdminAuth(auth({ action: "verify", code: "12345" }, bearer(pendingToken)), world)).toMatchObject({ status: 400 });
    for (let index = 0; index < 5; index++) await handleAdminAuth(auth({ action: "verify", code: "000000" }, bearer(pendingToken)), world);
    expect(await handleAdminAuth(auth({ action: "verify", code: "123456" }, bearer(pendingToken)), world)).toMatchObject({ status: 429 });
  });

  it("refuses to sign in while public sign ups are on", async () => {
    const world = deps(fakeStore(), fakeAuth({ signupsDisabled: false }));
    expect(await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: world.auth.state.password }), world)).toMatchObject({ status: 403, body: { code: "signupsOn" } });
    expect(world.auth.state.calls.at(-1)).toBe("signOut");
  });

  it("sets up a new authenticator only while the window is open, then closes it", async () => {
    const world = deps(fakeStore(), fakeAuth({ users: new Map([[ADMIN_ID, { id: ADMIN_ID, email: ADMIN_EMAIL, factors: [] }]]) }));
    const closed = await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: world.auth.state.password }), world);
    expect(closed).toMatchObject({ status: 403, body: { code: "enrollClosed" } });

    world.store.state.allowList.set(ADMIN_ID, { email: ADMIN_EMAIL, enrollOpen: true });
    const step = await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: world.auth.state.password }), world);
    expect(step).toMatchObject({ status: 200, body: { step: "enroll", factorId: null } });
    const pendingToken = (step.body as { pendingToken: string }).pendingToken;
    const enrolled = await handleAdminAuth(auth({ action: "enroll" }, bearer(pendingToken)), world);
    expect(enrolled).toMatchObject({ status: 200, body: { qrCode: expect.stringMatching(/^data:image\/svg\+xml/), secret: "JBSWY3DPEHPK3PXP" } });
    const factorId = (enrolled.body as { factorId: string }).factorId;
    // Setting up again first removes the half finished one.
    const again = await handleAdminAuth(auth({ action: "enroll" }, bearer(pendingToken)), world);
    expect(world.auth.state.calls).toContain(`deleteFactor ${factorId}`);
    const newFactor = (again.body as { factorId: string }).factorId;
    const signedIn = await handleAdminAuth(auth({ action: "verify", code: "123456", factorId: newFactor }, bearer(pendingToken)), world);
    expect(signedIn.status).toBe(200);
    expect(world.store.state.closed).toEqual([ADMIN_ID]);
    // With a working authenticator, no new one can be added from the dashboard.
    world.store.state.allowList.set(ADMIN_ID, { email: ADMIN_EMAIL, enrollOpen: true });
    expect(await handleAdminAuth(auth({ action: "enroll" }, bearer(pendingToken)), world)).toMatchObject({ status: 403, body: { code: "enrollClosed" } });
  });

  it("refreshes from the cookie only, rotating it, and clears it when Supabase says no", async () => {
    const world = deps();
    world.auth.state.valid.add("refresh:refreshadmin12345");
    const cookie = { cookie: "theme=dark; __Secure-checkervia-admin=refreshadmin12345" };
    const refreshed = await handleAdminAuth(auth({ action: "refresh" }, cookie), world);
    expect(refreshed).toMatchObject({ status: 200, body: { email: ADMIN_EMAIL } });
    expect(readRefreshCookie(refreshed.setCookie)).toMatch(/^rotated/);
    const reused = await handleAdminAuth(auth({ action: "refresh" }, cookie), world);
    expect(reused).toMatchObject({ status: 401 });
    expect(reused.setCookie).toMatch(/Max-Age=0/);
    expect((await handleAdminAuth(auth({ action: "refresh" }), world)).status).toBe(401);
    expect((await handleAdminAuth(auth({ action: "refresh" }, { ...cookie, "sec-fetch-site": "cross-site" }), world)).status).toBe(400);
  });

  it("signs out every session, clears the cookie and audits it", async () => {
    const world = deps();
    const access = valid(world, adminToken());
    const answer = await handleAdminAuth(auth({ action: "signOut" }, bearer(access)), world);
    expect(answer.setCookie).toMatch(/Max-Age=0/);
    expect(world.auth.state.valid.has(access)).toBe(false);
    expect(world.store.state.logs.at(-1)).toMatchObject({ action: "auth.signout", adminId: ADMIN_ID });
    expect((await handleAdminApi(players(bearer(access)), world)).status).toBe(401);
  });

  it("never logs a password, code or token", async () => {
    const world = deps();
    const step = await handleAdminAuth(auth({ action: "signIn", email: ADMIN_EMAIL, password: world.auth.state.password }), world);
    const pendingToken = (step.body as { pendingToken: string }).pendingToken;
    const signedIn = await handleAdminAuth(auth({ action: "verify", code: "123456" }, bearer(pendingToken)), world);
    const accessToken = (signedIn.body as { accessToken: string }).accessToken;
    const everything = JSON.stringify([world.store.state.logs, world.logged]);
    expect(everything).not.toContain(world.auth.state.password);
    expect(everything).not.toContain("123456");
    expect(everything).not.toContain("refresh");
    for (const value of [pendingToken, accessToken]) for (const part of value.split(".")) expect(everything).not.toContain(part);
  });
});
