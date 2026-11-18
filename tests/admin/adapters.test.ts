// The admin adapters against a fake HTTP layer (D100): Supabase Auth's REST
// calls (paths, keys, no secret in an error), the store's database function
// calls, the read operations' paging, and the function wrapper's headers
// and its 503 while a setting is missing.
import { afterEach, describe, expect, it } from "vitest";
import { createAuthApi, readClaims } from "../../netlify/admin/gotrue";
import { createSupabaseAdminStore } from "../../netlify/admin/supabaseAdminStore";
import { handleAdminApi } from "../../netlify/admin/api";
import { decodeCursor, encodeCursor } from "../../src/admin/protocol";
import type { PlayerRow } from "../../src/admin/protocol";
import { adminToken, bearer, deps, fakeStore, request } from "./fakes";

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

function fakeFetch(answer: (sent: Sent) => { status: number; body?: unknown }) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    sent.push(call);
    const reply = answer(call);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

describe("Supabase Auth from the server", () => {
  it("signs in with the publishable key only, and reads the session", async () => {
    const { sent, fetchImpl } = fakeFetch(() => ({ status: 200, body: { access_token: "a.b.c", refresh_token: "r1", expires_at: 99 } }));
    const auth = createAuthApi("https://project.supabase.co/", " sb_publishable_key\n", fetchImpl);
    expect(await auth.signIn("owner@example.com", "pw")).toEqual({ ok: true, value: { accessToken: "a.b.c", refreshToken: "r1", expiresAt: 99 } });
    expect(sent[0]!.url).toBe("https://project.supabase.co/auth/v1/token?grant_type=password");
    expect(sent[0]!.headers.get("apikey")).toBe("sb_publishable_key");
    expect(sent[0]!.headers.get("authorization")).toBeNull();
  });

  it("verifies a code as a challenge and then its answer, with the user's token", async () => {
    const { sent, fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/challenge") ? { status: 200, body: { id: "challenge-1" } } : { status: 200, body: { access_token: "x.y.z", refresh_token: "r2", expires_in: 3600 } },
    );
    const auth = createAuthApi("https://project.supabase.co", "key", fetchImpl);
    const answer = await auth.verifyTotp("user.token.here", "factor-1", "123456");
    expect(answer.ok).toBe(true);
    expect(sent.map((call) => call.url.replace("https://project.supabase.co/auth/v1", ""))).toEqual(["/factors/factor-1/challenge", "/factors/factor-1/verify"]);
    expect(sent[1]!.body).toEqual({ challenge_id: "challenge-1", code: "123456" });
    expect(sent[1]!.headers.get("authorization")).toBe("Bearer user.token.here");
  });

  it("reads the user's factors, and fails with a code only", async () => {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith("/user")
        ? { status: 200, body: { id: "u1", email: "o@e.com", factors: [{ id: "f1", factor_type: "totp", status: "verified" }, { id: "f2", factor_type: "totp", status: "unverified" }] } }
        : { status: 400, body: { error_code: "invalid_credentials", msg: "password pw was wrong" } },
    );
    const auth = createAuthApi("https://project.supabase.co", "key", fetchImpl);
    expect(await auth.user("t")).toEqual({ ok: true, value: { id: "u1", email: "o@e.com", factors: [{ id: "f1", type: "totp", status: "verified" }, { id: "f2", type: "totp", status: "unverified" }] } });
    const failed = await auth.signIn("o@e.com", "pw");
    expect(failed).toEqual({ ok: false, status: 400, code: "invalid_credentials" });
    expect(JSON.stringify(failed)).not.toContain("pw");
  });

  it("treats an empty answer to sign out as done, and a network failure as a 503", async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 204 }));
    expect(await createAuthApi("https://p.supabase.co", "k", fetchImpl).signOut("t")).toEqual({ ok: true, value: null });
    const broken = createAuthApi("https://p.supabase.co", "k", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    expect(await broken.user("t")).toEqual({ ok: false, status: 503, code: "network" });
  });

  it("reads the claims of a token: the second factor's time and the level", () => {
    expect(readClaims(adminToken({ totpAt: 1000 }))).toMatchObject({ aal: "aal2", totpAt: 1000 });
    expect(readClaims("not a token")).toBeNull();
  });
});

describe("the admin store on Supabase", () => {
  it("calls migration 7's functions with the secret key and maps the rows", async () => {
    const { sent, fetchImpl } = fakeFetch((call) =>
      call.url.includes("admin_players")
        ? {
            status: 200,
            body: [{ id: "p1", username: "Ana", avatar: null, country: "PK", created_at: "2026-01-01T00:00:00+00:00", last_active: "2026-02-01T00:00:00+00:00", hidden: false, suspended_until: null, suspension_kind: null, device_banned: false, wins: "3", wins_1: 0, wins_2: 1, wins_3: 0, wins_4: 2, games: 5, losses: 2, draws: 0, resigned: 1, abandoned: 0, reports: 0, reporters: 0, sort_value: "3" }],
          }
        : { status: 200, body: null },
    );
    const store = createSupabaseAdminStore("https://p.supabase.co", "sb_secret_abc", fetchImpl);
    const rows = await store.players({ search: "an", status: null, country: null, level: null, joinedFrom: null, joinedTo: null, activeFrom: null, activeTo: null, sort: "wins", desc: true, after: null, limit: 51 });
    expect(rows[0]).toMatchObject({ sortValue: "3", row: { username: "Ana", wins: 3, winsByLevel: [0, 1, 0, 2], joinedAt: "2026-01-01T00:00:00.000Z" } });
    expect(sent[0]!.url).toBe("https://p.supabase.co/rest/v1/rpc/admin_players");
    expect(sent[0]!.headers.get("apikey")).toBe("sb_secret_abc");
    expect(sent[0]!.body).toMatchObject({ p_search: "an", p_sort: "wins", p_desc: true, p_limit: 51 });
    await store.log({ adminId: "a", action: "player.view", outcome: "ok", ipHash: "h" });
    expect(sent[1]!.url).toContain("/rpc/admin_log");
  });

  it("throws only the error code", async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 400, body: { code: "22023", message: "value secret-thing" } }));
    const store = createSupabaseAdminStore("https://p.supabase.co", "sb_secret_abc", fetchImpl);
    await expect(store.audit({ search: null, action: null, playerId: null, before: null, limit: 10 })).rejects.toMatchObject({ code: "22023", message: "storage error 22023" });
  });
});

describe("the read operations", () => {
  const row = (id: string): PlayerRow => ({
    id, username: id, avatar: null, country: null, joinedAt: "", lastActiveAt: "", hidden: false, suspendedUntil: null, suspensionKind: null,
    deviceBanned: false, wins: 0, winsByLevel: [0, 0, 0, 0], games: 0, losses: 0, draws: 0, resigned: 0, abandoned: 0, reports: 0, reporters: 0,
  });
  const ids = Array.from({ length: 4 }, (_, index) => `00000000-0000-4000-8000-00000000000${index}`);

  it("asks for one row more than the page, and gives a cursor only when there is more", async () => {
    const asked: number[] = [];
    const store = fakeStore({
      players: async (filter) => {
        asked.push(filter.limit);
        const start = filter.after ? ids.indexOf(filter.after.id) + 1 : 0;
        return ids.slice(start, start + filter.limit).map((id, index) => ({ row: row(id), sortValue: String(start + index) }));
      },
    });
    const world = deps(store);
    world.auth.state.valid.add(adminToken());
    const call = (params: Record<string, unknown>) => handleAdminApi(request({ op: "players", params }, bearer(adminToken())), world);
    const first = (await call({ limit: 3 })).body as { rows: PlayerRow[]; next: string };
    expect(asked).toEqual([4]);
    expect(first.rows.map((entry) => entry.id)).toEqual(ids.slice(0, 3));
    expect(decodeCursor(first.next)).toEqual(["2", ids[2]]);
    const second = (await call({ limit: 3, cursor: first.next })).body as { rows: PlayerRow[]; next: string | null };
    expect(second).toEqual({ rows: [row(ids[3]!)], next: null });
    expect((await call({ cursor: encodeCursor("1", "not-an-id") })).status).toBe(400);
    expect((await call({ cursor: "!!!" })).status).toBe(400);
  });

  it("asks for a player's details with the admin and the address hash, for the audit row", async () => {
    const seen: unknown[] = [];
    const store = fakeStore({
      playerDetail: async (adminId, ipHash, playerId) => {
        seen.push([adminId, ipHash.length, playerId]);
        return null;
      },
    });
    const world = deps(store);
    world.auth.state.valid.add(adminToken());
    const answer = await handleAdminApi(request({ op: "player", params: { id: ids[1] } }, bearer(adminToken())), world);
    expect(answer.status).toBe(404);
    expect(seen).toEqual([["11111111-1111-4111-8111-111111111111", 64, ids[1]]]);
  });
});

describe("the function wrapper", () => {
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "ADMIN_EMAIL", "LEADERBOARD_HASH_SALT"];
  const saved = Object.fromEntries(names.map((name) => [name, env[name]]));
  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete env[name];
      else env[name] = saved[name];
    }
  });

  it("answers 503 with strict headers while a setting is missing, naming it but never a value", async () => {
    for (const name of names) delete env[name];
    env["SUPABASE_URL"] = "https://p.supabase.co";
    const errors: string[] = [];
    const original = console.error;
    console.error = (message: string) => errors.push(message);
    try {
      const { default: adminApi } = await import("../../netlify/functions/admin-api");
      const response = await adminApi(new Request("https://site.example/.netlify/functions/admin-api", { method: "POST", body: "{}" }), { ip: "1.2.3.4" });
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(errors).toEqual(["admin: not set: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ADMIN_EMAIL, LEADERBOARD_HASH_SALT"]);
      expect(errors.join()).not.toContain("p.supabase.co");
    } finally {
      console.error = original;
    }
  });
});
