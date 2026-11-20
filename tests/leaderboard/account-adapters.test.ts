// The real adapters of saved progress (D150) against fake HTTP: the
// leaderboard store finds a profile by a login device key (and copes before
// migration 9), and the Supabase Auth client sends the right keys, asks for
// codes without making users, and ends every player session at once.
import { describe, expect, it } from "vitest";
import { createPlayerAuth } from "../../netlify/accounts/playerAuth";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";

interface Seen { method: string; url: URL; headers: Headers; body: any }
function fake(answer: (request: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Seen = { method: init?.method ?? "GET", url: new URL(String(input)), headers: new Headers(init?.headers), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    seen.push(request);
    const { status, body } = answer(request);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const ROW = { id: "p1", username: "Ada", username_key: "ada", country: null, avatar: "a07", hidden: false, username_changed_at: null };
const SECRET = "sb_secret_N7xFakeKeyForTests0000000000";
const PUBLISHABLE = "sb_publishable_FakeKeyForTests000000";

describe("finding a profile by a device key", () => {
  it("looks at the profile's first key, then at the login device keys", async () => {
    const { seen, fetchImpl } = fake((request) => (request.url.pathname.endsWith("/players") ? { status: 200, body: [] } : { status: 200, body: [{ players: ROW }] }));
    const store = createSupabaseStore("https://example.supabase.co", SECRET, fetchImpl);
    expect(await store.playerByTokenHash("f".repeat(64))).toMatchObject({ id: "p1", username: "Ada" });
    expect(seen.map((request) => request.url.pathname)).toEqual(["/rest/v1/players", "/rest/v1/player_tokens"]);
  });

  it("finds nothing (and does not fail) before migration 9", async () => {
    const { fetchImpl } = fake((request) => (request.url.pathname.endsWith("/players") ? { status: 200, body: [] } : { status: 404, body: { code: "PGRST205", message: "no table" } }));
    const store = createSupabaseStore("https://example.supabase.co", SECRET, fetchImpl);
    expect(await store.playerByTokenHash("f".repeat(64))).toBeNull();
  });
});

describe("the Supabase Auth client for players", () => {
  it("makes users with the secret key, and asks for codes with the publishable key without making users", async () => {
    const { seen, fetchImpl } = fake((request) => (request.url.pathname.endsWith("/admin/users") ? { status: 200, body: { id: "u1" } } : { status: 200, body: {} }));
    const auth = createPlayerAuth("https://example.supabase.co", SECRET, PUBLISHABLE, fetchImpl);
    expect(await auth.ensureUser("ada@example.com")).toEqual({ userId: "u1", created: true });
    expect(await auth.sendCode("ada@example.com")).toBe("sent");
    expect(seen[0]!.headers.get("apikey")).toBe(SECRET);
    expect(seen[0]!.headers.get("authorization")).toBeNull(); // an sb_secret key is never a Bearer token
    expect(seen[1]!.headers.get("apikey")).toBe(PUBLISHABLE);
    expect(seen[1]!.body).toEqual({ email: "ada@example.com", create_user: false });
  });

  it("treats an existing user as fine, and an unknown login email as no user", async () => {
    const { fetchImpl } = fake((request) => (request.url.pathname.endsWith("/admin/users") ? { status: 422, body: { error_code: "email_exists" } } : { status: 422, body: { error_code: "otp_disabled" } }));
    const auth = createPlayerAuth("https://example.supabase.co", SECRET, PUBLISHABLE, fetchImpl);
    expect(await auth.ensureUser("ada@example.com")).toEqual({ userId: null, created: false });
    expect(await auth.sendCode("nobody@example.com")).toBe("noUser");
  });

  it("ends the player's session at once after a correct code, and returns only the user id", async () => {
    const { seen, fetchImpl } = fake((request) => (request.url.pathname.endsWith("/verify") ? { status: 200, body: { access_token: "eyJ.session.token", refresh_token: "r1", user: { id: "u1" } } } : { status: 204, body: {} }));
    const auth = createPlayerAuth("https://example.supabase.co", SECRET, PUBLISHABLE, fetchImpl);
    const result = await auth.verifyCode("ada@example.com", "123456");
    expect(result).toEqual({ ok: true, userId: "u1" });
    const logout = seen.find((request) => request.url.pathname.endsWith("/logout"))!;
    expect(logout.url.searchParams.get("scope")).toBe("global");
    expect(logout.headers.get("authorization")).toBe("Bearer eyJ.session.token");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("calls a wrong or expired code wrong, and a deleted user gone", async () => {
    const { fetchImpl } = fake((request) => (request.method === "DELETE" ? { status: 404, body: {} } : { status: 403, body: { error_code: "otp_expired" } }));
    const auth = createPlayerAuth("https://example.supabase.co", SECRET, PUBLISHABLE, fetchImpl);
    expect(await auth.verifyCode("ada@example.com", "000000")).toEqual({ ok: false, reason: "wrong" });
    expect(await auth.deleteUser("u1")).toBe(true);
  });
});
