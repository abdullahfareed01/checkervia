// The Supabase adapter against a fake HTTP layer: the requests it makes
// (tables, functions, paging) and how it reads answers and errors. The SQL
// itself runs only in a real Supabase project (see the deployment guide).
import { describe, expect, it } from "vitest";
import { createSupabaseStore } from "../../netlify/leaderboard/supabaseStore";

interface Seen {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

function fakeDb(answer: (request: Seen) => { status: number; body: unknown; headers?: Record<string, string> }, key = "service-key-for-tests") {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Seen = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    seen.push(request);
    const { status, body, headers } = answer(request);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof fetch;
  return { seen, store: createSupabaseStore("https://example.supabase.co", key, fetchImpl) };
}

// Made up keys in the two formats (D58): a legacy service_role JWT and a new secret key.
const LEGACY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl";
const SECRET_KEY = "sb_secret_N7xFakeKeyForTests0000000000";

describe("the key headers", () => {
  // A read, a write and a database function: every kind of request the adapter makes.
  async function requestsWith(key: string): Promise<Headers[]> {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { allowed: true, retry_after_seconds: 1 } }), key);
    await store.playerByKey("fan");
    await store.updatePlayer("p1", { country: "PK" });
    await store.hitRateLimit("k", 60, 1);
    return seen.map((request) => request.headers);
  }

  it("a legacy service_role JWT goes in apikey and as the Bearer token", async () => {
    const headers = await requestsWith(LEGACY_KEY);
    expect(headers).toHaveLength(3);
    for (const header of headers) {
      expect(header.get("apikey")).toBe(LEGACY_KEY);
      expect(header.get("authorization")).toBe(`Bearer ${LEGACY_KEY}`);
    }
  });

  it("a new sb_secret key goes in apikey only, never as a Bearer token", async () => {
    const headers = await requestsWith(SECRET_KEY);
    expect(headers).toHaveLength(3);
    for (const header of headers) {
      expect(header.get("apikey")).toBe(SECRET_KEY);
      expect(header.get("authorization")).toBeNull();
    }
  });

  it("drops spaces and a line break copied around the key", async () => {
    const headers = await requestsWith(`  ${SECRET_KEY}
`);
    expect(headers[0]!.get("apikey")).toBe(SECRET_KEY);
  });

  it("an error from Supabase carries no key and no value", async () => {
    const { store } = fakeDb(() => ({ status: 401, body: { message: `No API key found in request ${SECRET_KEY}`, hint: "No apikey request header or url param was found." } }), SECRET_KEY);
    const error = (await store.playerByKey("fan").catch((caught: unknown) => caught)) as Error & { code: string };
    expect(error.code).toBe("unknown");
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(SECRET_KEY);
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain("fan");
  });
});

describe("the Supabase adapter", () => {
  it("finds a player by username key with the service role key", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { id: "p1", username: "Fan", username_key: "fan", country: "PK", avatar: "a07", hidden: false, username_changed_at: "2026-11-10T09:00:00Z" } }));
    expect(await store.playerByKey("fan")).toEqual({
      id: "p1", username: "Fan", usernameKey: "fan", country: "PK", avatar: "a07", hidden: false, usernameChangedAt: new Date("2026-11-10T09:00:00Z"),
    });
    expect(seen[0]!.url.pathname).toBe("/rest/v1/players");
    expect(seen[0]!.url.searchParams.get("username_key")).toBe("eq.fan");
    expect(seen[0]!.headers.get("apikey")).toBe("service-key-for-tests");
  });

  it("reads a unique violation as a taken username or a duplicate win", async () => {
    const { store } = fakeDb(() => ({ status: 409, body: { code: "23505", message: "duplicate key value" } }));
    expect(
      await store.createPlayer({ username: "Fan", usernameKey: "fan", country: null, avatar: "a01", tokenHash: "t", deviceHash: "d", ipHash: "i" }),
    ).toBe("taken");
    expect(
      await store.addWin({ playerId: "p1", gameId: "g", level: 4, moves: [[40, 33]], movesHash: "h", moveCount: 1, stats: { totalMoves: 1, captured: 0, kingsMade: 0, bestChain: 0 } }),
    ).toBe("duplicate");
    expect(await store.saveGameResult({ playerId: "p1", gameId: "g", level: 4, result: "loss" }, false)).toBe("duplicate");
  });

  it("throws other errors with their code only", async () => {
    const { store } = fakeDb(() => ({ status: 500, body: { code: "57014", message: "canceling statement, token_hash=secret" } }));
    const error = await store.playerByTokenHash("hash").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "57014" });
    expect(String((error as Error).message)).not.toContain("secret");
  });

  it("pages the ranking through its SQL function and reads the total", async () => {
    const { seen, store } = fakeDb(() => ({
      status: 200,
      body: [{ rank: 21, player_id: "p1", username: "Fan", country: null, avatar: "a05", wins: "3", best_moves: 25, reached_at: "2026-11-18T00:00:00Z" }],
      headers: { "content-range": "20-20/21" },
    }));
    const page = await store.rankedPage(4, new Date("2026-11-16T00:00:00Z"), 20, 20);
    expect(page).toEqual({ rows: [{ rank: 21, playerId: "p1", username: "Fan", country: null, avatar: "a05", wins: 3, bestMoves: 25 }], total: 21 });
    const request = seen[0]!;
    expect(request.method).toBe("POST");
    expect(request.url.pathname).toBe("/rest/v1/rpc/leaderboard_ranked");
    expect(request.body).toEqual({ p_level: 4, p_since: "2026-11-16T00:00:00.000Z" });
    expect(request.url.searchParams.get("offset")).toBe("20");
    expect(request.url.searchParams.get("limit")).toBe("20");
    expect(request.url.searchParams.get("order")).toBe("rank.asc");
    expect(request.headers.get("prefer")).toContain("count=exact");
  });

  it("asks for all time with a null start, and for one player's row", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { rank: 2, player_id: "p9", username: "Me", country: "GB", wins: 1, best_moves: 30 } }));
    expect(await store.rankedRow(3, null, "p9")).toMatchObject({ rank: 2, playerId: "p9" });
    expect(seen[0]!.body).toEqual({ p_level: 3, p_since: null });
    expect(seen[0]!.url.searchParams.get("player_id")).toBe("eq.p9");
  });

  it("counts a rate limit hit through its SQL function", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { allowed: false, retry_after_seconds: 42 } }));
    expect(await store.hitRateLimit("submitWin:ip:abc", 3600, 30)).toEqual({ allowed: false, retryAfterSeconds: 42 });
    expect(seen[0]!.url.pathname).toBe("/rest/v1/rpc/hit_rate_limit");
    expect(seen[0]!.body).toEqual({ p_key: "submitWin:ip:abc", p_window_seconds: 3600, p_limit: 30 });
  });

  it("reads the level counts in order, Easy to Strongest", async () => {
    const { store } = fakeDb(() => ({
      status: 200,
      body: [4, 3, 2, 1].map((level) => ({ level, wins: String(level), best_moves: level === 4 ? 20 : null, losses: 1, games: level + 1 })),
    }));
    const counts = await store.levelCounts("p1");
    expect(counts.map((count) => count.level)).toEqual([1, 2, 3, 4]);
    expect(counts[3]).toEqual({ level: 4, wins: 4, bestMoves: 20, losses: 1, games: 5 });
  });

  it("renames through its SQL function and reads the outcome (D61)", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { outcome: "tooSoon", next_change_at: "2026-11-21T09:00:00Z" } }));
    expect(await store.renamePlayer("p1", "New_Name", "new_name", 7, 30)).toEqual({ outcome: "tooSoon", nextChangeAt: new Date("2026-11-21T09:00:00Z") });
    expect(seen[0]!.url.pathname).toBe("/rest/v1/rpc/rename_player");
    expect(seen[0]!.body).toEqual({ p_player: "p1", p_username: "New_Name", p_username_key: "new_name", p_wait_days: 7, p_reserve_days: 30 });
  });

  it("asks only for a reservation that has not ended", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: { player_id: "p4" } }));
    expect(await store.reservedFor("old_name")).toBe("p4");
    expect(seen[0]!.url.pathname).toBe("/rest/v1/username_reservations");
    expect(seen[0]!.url.searchParams.get("username_key")).toBe("eq.old_name");
    expect(seen[0]!.url.searchParams.get("reserved_until")).toMatch(/^gt\./);
  });

  it("updates only the fields that change, and nothing when none do", async () => {
    const { seen, store } = fakeDb(() => ({ status: 200, body: [] }));
    await store.updatePlayer("p1", { avatar: "a09" });
    await store.updatePlayer("p1", {});
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body).toEqual({ avatar: "a09" });
  });
});
